// Pure worldline geometry: one vertical line per participant, time flowing down.
// Imports only from the ledger and the engine. No React, no DOM, no clock, no randomness.
import type { ParticipantId } from "../engine/types";
import { clearLine } from "../ledger/clear-line";
import { buildLedger, contradictedIds, firstLoss, receivedAt } from "../ledger/ledger";
import type { LedgerEvent, Settled } from "../ledger/ledger";
import { spreadLabels } from "./declutter";
import { formatClearLineLimit, formatLimit, resolveParticipants, styleFor } from "./participants";
import type {
  ArrivalMark,
  DecisionNode,
  Fate,
  KnowledgeLimit,
  KnowledgeMark,
  LayoutOptions,
  LegendKey,
  Signal,
  TimeAxis,
  Tone,
  Worldline,
  WorldlineInput,
  WorldlineLayout,
} from "./types";
import { VIEW } from "./types";

const TICK_LENGTH = 16;
const LABEL_OFFSET = 12;
/** Past this many decisions, labels fall back to their position and the text timeline carries the text. */
const MAX_TEXT_LABELS = 40;

type SentEvent = Extract<LedgerEvent, { kind: "sent" }>;
type OutcomeEvent = Extract<LedgerEvent, { kind: "outcome" }>;
type ArrivalEvent = Extract<LedgerEvent, { kind: "arrival" }>;
type Lost = "garbled" | "collision";

/** Vertical position of sim-time `t`. Linear; the first time is at `top`, the last at `bottom`. */
export function timeToY(time: TimeAxis, t: number): number {
  return time.top + ((t - time.start) / (time.end - time.start || 1)) * (time.bottom - time.top);
}

function niceTicks(start: number, end: number): number[] {
  const span = end - start;
  if (!(span > 0)) return [start];
  const raw = span / 7;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = mag * 10;
  for (const m of [1, 2, 5, 10]) {
    if (m * mag >= raw) {
      step = m * mag;
      break;
    }
  }
  const first = Math.ceil(start / step - 1e-9);
  const last = Math.floor(end / step + 1e-9);
  const ticks: number[] = [];
  for (let k = first; k <= last; k++) ticks.push(Number((k * step).toPrecision(12)));
  return ticks;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

export function layoutWorldlines(input: WorldlineInput, options: LayoutOptions = {}): WorldlineLayout {
  const recorded = buildLedger(input.ledger.events);
  // On a clear line the signals are laid out from the cleared record; the time axis still
  // comes from the recorded one, so toggling does not move anything on the page.
  const ledger = options.clearLine === true ? clearLine(recorded) : recorded;
  const names = input.names ?? {};
  const participants = resolveParticipants(ledger, input.scenario, input.participants);
  const byId = new Map(participants.map((p) => [p.id, p]));

  const decisionEvents = input.scenario.events
    .filter((e) => e.type === "decision" && e.actor !== undefined)
    .sort((a, b) => a.simTime - b.simTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Time range over the ledger and the decisions.
  let start = Infinity;
  let end = -Infinity;
  for (const e of recorded.events) {
    start = Math.min(start, e.simTime);
    end = Math.max(end, e.simTime);
  }
  for (const e of decisionEvents) {
    start = Math.min(start, e.simTime);
    end = Math.max(end, e.simTime);
  }
  if (start === Infinity) {
    start = 0;
    end = 0;
  }
  const time: TimeAxis = {
    start,
    end,
    top: VIEW.top,
    bottom: VIEW.height - VIEW.bottom,
    ticks: niceTicks(start, end),
  };
  const y = (t: number): number => timeToY(time, t);

  // Cursor: null is the closed record.
  const at = options.at ?? null;
  // A cursor at the last time is the closed record, unless a participant is in focus:
  // a decision made at the last moment still fades what its role did not know.
  const closed = at === null || end <= start || (at >= end && (options.focus ?? null) === null);
  const cursor = closed ? null : Math.max(at as number, start);

  // x by order, in equal columns.
  const column = (VIEW.width - VIEW.left - VIEW.right) / Math.max(1, participants.length);
  const xs = new Map<ParticipantId, number>();
  participants.forEach((p, i) => xs.set(p.id, VIEW.left + (i + 0.5) * column));
  const xOf = (id: ParticipantId): number => xs.get(id) as number;

  // Group the events by message id.
  const sends = new Map<string, SentEvent>();
  const outcomes = new Map<string, OutcomeEvent[]>();
  const arrivalEvents = new Map<string, ArrivalEvent[]>();
  for (const e of ledger.events) {
    if (e.kind === "sent" && !sends.has(e.messageId)) sends.set(e.messageId, e);
    else if (e.kind === "outcome") push(outcomes, e.messageId, e);
    else if (e.kind === "arrival") push(arrivalEvents, e.messageId, e);
  }
  const ids = new Set<string>([...sends.keys(), ...outcomes.keys(), ...arrivalEvents.keys()]);

  const skipped = new Set<string>();
  // A message id whose sends or arrivals disagree on sender or recipient contradicts itself:
  // it is skipped and not drawn. Detected on the recorded log so a clear line skips the same ids.
  const parties = new Map<string, { senders: Set<string>; recipients: Set<string> }>();
  for (const e of recorded.events) {
    if (e.kind !== "sent" && e.kind !== "arrival") continue;
    let p = parties.get(e.messageId);
    if (p === undefined) {
      p = { senders: new Set(), recipients: new Set() };
      parties.set(e.messageId, p);
    }
    p.senders.add(e.sender);
    p.recipients.add(e.recipient);
  }
  const conflicting = new Set<string>();
  for (const [id, p] of parties) if (p.senders.size > 1 || p.recipients.size > 1) conflicting.add(id);
  for (const id of conflicting) skipped.add(id);
  // An outcome or arrival earlier than its message's first send is ignored by the ledger
  // queries (`resolve` below). The id is listed in `skipped` when nothing valid remains for it.
  const contradicted = contradictedIds(ledger);
  const signals: Signal[] = [];
  const arrivals: ArrivalMark[] = [];

  // A focus only has an effect with a cursor.
  const focus: ParticipantId | null = cursor === null ? null : (options.focus ?? null);
  /** Tone for an item under a focus: loss if settled lost and involving the focus, ink if the focus knew it. */
  const focusTone = (
    involves: boolean,
    lostSettled: boolean,
    knownToFocus: boolean,
  ): Tone => (involves && lostSettled ? "loss" : knownToFocus ? "ink" : "faded");

  /** The one settled time and outcome of a message for its recipient, shared with the ledger. */
  const resolve = (id: string, to: ParticipantId): Settled | undefined => {
    const r = receivedAt(ledger, id, to);
    return r !== undefined ? { outcome: "received", simTime: r } : firstLoss(ledger, id, to);
  };

  const toneOf = (fate: "received" | Lost | "never-arrived", settledAt: number | null, sentAt: number | null): Tone => {
    if (cursor === null) return fate === "received" ? "ink" : "loss";
    if (sentAt !== null && sentAt > cursor) return "faded";
    if (settledAt === null) return "ink";
    if (settledAt > cursor) return sentAt === null ? "faded" : "ink";
    return fate === "received" ? "ink" : "loss";
  };

  for (const id of [...ids].sort()) {
    if (conflicting.has(id)) continue;
    const send = sends.get(id);
    const sender = send === undefined ? undefined : byId.get(send.sender);
    if (send !== undefined && sender !== undefined && sender.history === "complete") {
      const all = outcomes.get(id) ?? [];
      const outcome = resolve(id, send.recipient);
      if (outcome === undefined && contradicted.has(id)) skipped.add(id);
      if (outcome === undefined && (all.length > 0 || contradicted.has(id))) continue; // the log contradicts itself: claim nothing
      signals.push(buildSignal(send, outcome));
      continue;
    }
    const arrival = arrivalEvents.get(id)?.[0];
    const from = send === undefined ? arrival?.sender : send.sender;
    const to = send === undefined ? arrival?.recipient : send.recipient;
    const settled = to === undefined ? undefined : resolve(id, to);
    const source =
      from === undefined || to === undefined || settled === undefined
        ? undefined
        : { from, to, outcome: settled.outcome, at: settled.simTime };
    if (source === undefined) {
      if (contradicted.has(id)) skipped.add(id);
      continue;
    }
    const xr = xOf(source.to);
    const dir = Math.sign(xOf(source.from) - xr) || -1;
    arrivals.push({
      id,
      from: source.from,
      to: source.to,
      x: xr,
      y: y(source.at),
      dx: dir * TICK_LENGTH,
      arrivedAt: source.at,
      outcome: source.outcome,
      tone:
        focus === null || cursor === null
          ? toneOf(source.outcome, source.at, null)
          : focusTone(
              source.to === focus || source.from === focus,
              source.outcome !== "received" && source.at <= cursor,
              source.outcome === "received" && source.to === focus && source.at <= cursor,
            ),
      dotted: source.outcome !== "received",
    });
  }

  function buildSignal(send: SentEvent, outcome: Settled | undefined): Signal {
    const x1 = xOf(send.sender);
    const xr = xOf(send.recipient);
    const dir = Math.sign(xr - x1) || 1;
    const y1 = y(send.simTime);
    const arrivedAt = outcome === undefined ? null : outcome.simTime;
    let x2f: number;
    let y2f: number;
    if (outcome === undefined) {
      x2f = xr - dir * Math.max(VIEW.gap, Math.abs(xr - x1) / 2);
      y2f = Math.min(y1 + VIEW.stub, time.bottom);
    } else {
      x2f = outcome.outcome === "received" ? xr : xr - dir * VIEW.gap;
      y2f = y(outcome.simTime);
    }
    const settledFate: "received" | Lost | "never-arrived" = outcome === undefined ? "never-arrived" : outcome.outcome;
    let fate: Fate = settledFate;
    let x2 = x2f;
    let y2 = y2f;
    let open = false;
    if (cursor !== null) {
      const notYetSent = send.simTime > cursor;
      const settled = outcome !== undefined && outcome.simTime <= cursor;
      if (notYetSent) {
        fate = outcome === undefined ? "in-transit" : outcome.outcome;
      } else if (!settled) {
        fate = "in-transit";
        open = true;
        y2 = Math.min(y(cursor), y2f);
        const span = y2f - y1;
        const f = span > 0 ? (y2 - y1) / span : 1;
        x2 = x1 + (x2f - x1) * f;
      }
    }
    const lost = fate === "garbled" || fate === "collision" || fate === "never-arrived";
    let tone: Tone =
      fate === "in-transit" && !open
        ? "faded"
        : toneOf(settledFate, open ? null : arrivedAt, send.simTime);
    if (focus !== null && cursor !== null) {
      const sentByT = send.simTime <= cursor;
      tone = focusTone(
        send.sender === focus || send.recipient === focus,
        !open && arrivedAt !== null && arrivedAt <= cursor && (fate === "garbled" || fate === "collision"),
        // Nothing settles before its send (the ledger ignores that), so a receipt by the
        // cursor already implies the send was by the cursor.
        sentByT &&
          (send.sender === focus ||
            (send.recipient === focus && settledFate === "received" && arrivedAt !== null && arrivedAt <= cursor)),
      );
    }
    return {
      id: send.messageId,
      from: send.sender,
      to: send.recipient,
      x1,
      y1,
      x2,
      y2,
      fate,
      sentAt: send.simTime,
      arrivedAt,
      spanIsDelay: outcome !== undefined && !open,
      open,
      tone,
      dotted: lost,
    };
  }

  signals.sort((a, b) => a.sentAt - b.sentAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  arrivals.sort((a, b) => a.arrivedAt - b.arrivedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Facts, one mark per participant and fact (the earliest).
  const knowledge: KnowledgeMark[] = [];
  const learnedSeen = new Set<string>();
  for (const e of ledger.events) {
    if (e.kind !== "learned") continue;
    const k = `${e.participant}\u0000${e.factId}`;
    if (learnedSeen.has(k)) continue;
    learnedSeen.add(k);
    knowledge.push({
      id: e.factId,
      participant: e.participant,
      x: xOf(e.participant),
      y: y(e.simTime),
      simTime: e.simTime,
      label: names[e.factId] ?? e.factId,
      tone:
        cursor !== null && (e.simTime > cursor || (focus !== null && e.participant !== focus)) ? "faded" : "ink",
    });
  }

  // Decisions, with labels spread per line.
  const decisions: DecisionNode[] = [];
  const lastIndex = participants.length - 1;
  const groups = new Map<ParticipantId, DecisionNode[]>();
  for (const e of decisionEvents) {
    const actor = e.actor as ParticipantId;
    const side: "left" | "right" = participants.length > 1 && byId.get(actor) === participants[lastIndex] ? "left" : "right";
    const x = xOf(actor);
    const node: DecisionNode = {
      id: e.id,
      actor,
      simTime: e.simTime,
      x,
      y: y(e.simTime),
      side,
      labelX: side === "right" ? x + LABEL_OFFSET : x - LABEL_OFFSET,
      labelY: y(e.simTime),
      label: decisionEvents.length > MAX_TEXT_LABELS ? String(decisions.length + 1) : e.title,
      selected: false,
    };
    decisions.push(node);
    push(groups, actor, node);
  }
  for (const group of groups.values()) {
    const spread = spreadLabels(
      group.map((n) => n.labelY),
      VIEW.minLabelGap,
      time.top,
      time.bottom,
    );
    group.forEach((n, i) => {
      n.labelY = spread[i] as number;
    });
  }

  // Limits: one notice for the arrivals-only participants that have arrivals.
  const limited = participants.filter(
    (p) => p.history === "arrivals-only" && arrivals.some((a) => a.from === p.id),
  );
  const limits: KnowledgeLimit[] = [];
  if (limited.length > 0) {
    const notes: string[] = [];
    for (const p of limited) if (p.limitNote !== undefined && !notes.includes(p.limitNote)) notes.push(p.limitNote);
    limits.push({
      participants: limited.map((p) => p.id),
      text: [
        formatLimit(limited.map((p) => p.label)),
        ...(options.clearLine === true ? [formatClearLineLimit(limited.map((p) => p.label))] : []),
        ...notes,
      ].join(" "),
    });
  }

  // Lines.
  let roleIndex = 0;
  const lines: Worldline[] = participants.map((p) => {
    const style = styleFor(p.kind, roleIndex);
    if (p.kind === "role") roleIndex++;
    const marks =
      decisions.filter((d) => d.actor === p.id).length +
      knowledge.filter((k) => k.participant === p.id).length +
      arrivals.filter((a) => a.to === p.id).length +
      signals.filter((s) => s.from === p.id || s.to === p.id).length;
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      history: p.history,
      x: xOf(p.id),
      yTop: time.top,
      yBottom: time.bottom,
      style,
      marks,
    };
  });

  // Legend: only what is on the page.
  const legend: LegendKey[] = [];
  if (signals.some((s) => !s.dotted)) {
    legend.push({ id: "signal", text: "A line from sender to receiver. Its vertical length is the delay." });
  }
  const neverArrived = signals.some((s) => s.fate === "never-arrived");
  if (signals.some((s) => s.dotted) || arrivals.some((a) => a.dotted)) {
    legend.push({
      id: "lost",
      text:
        "A dotted line did not arrive and stops short of the receiver." +
        (neverArrived ? " The length of a never-arrived line is not a delay." : ""),
    });
  }
  if (arrivals.length > 0) {
    legend.push({ id: "arrival", text: "A tick on a line marks something that arrived. When it was sent is not known." });
  }
  if (decisions.length > 0) legend.push({ id: "decision", text: "A square marks a decision." });
  if (knowledge.length > 0) legend.push({ id: "fact", text: "A circle marks a fact learned." });

  return {
    view: { width: VIEW.width, height: VIEW.height },
    time,
    lines,
    signals,
    arrivals,
    knowledge,
    decisions,
    limits,
    legend,
    skipped: [...skipped].sort(),
  };
}
