/**
 * Adapter from a finished (or ended) run to the kit's replay inputs. Built only
 * on kit APIs; no function here mutates its input.
 *
 * Sends and outcomes. The log holds `send` entries (what was put on the line and
 * when) and `wire` outcomes (what arrived, garbled or collided). An outcome is
 * matched to its send by `id`, and only if it is not earlier than the send. A
 * matched send gives the replay time in transit, and a send with no outcome
 * stays in transit: that is a message that never arrived.
 *
 * What is recorded where: the player's own sends in every mode, and the Solo
 * partner's sends (known from its schedule). In Two tabs and Two devices the
 * partner's sends happen elsewhere and an outcome carries no send time. An
 * outcome with no matching send (these, and every run saved before send entries
 * existed) becomes an arrival: the replay draws a tick on the receiver's line
 * and never invents a send time or a diagonal. A partner message dropped on the
 * line leaves no trace here, so `toParticipants` marks that partner
 * "arrivals-only" and the replay says so once, with the note below.
 */
import { buildLedger, eventsForRole, ledgerFromChannel, replayChannelLog } from "hindsight";
import type { Ledger, Scenario, SimEvent } from "hindsight";
import type { ReplayParticipant } from "hindsight/replay";
import type { ConsoleLogEntry, PlayMode, RoleId, SimState } from "./types";

/** App-owned reason, shown after the kit's generic notice. */
export const LIMIT_NOTE = "Their sends happen elsewhere and are not recorded here.";

/** First send per id, and every wire outcome with the id the ledger will use for it. */
function classify(log: readonly ConsoleLogEntry[]) {
  const sends: { id: string; sender: string; recipient: string; sendTime: number; bytes: number; airtime?: number }[] = [];
  const sendTimes = new Map<string, number>();
  for (const e of log) {
    if (e.kind !== "send" || sendTimes.has(e.send.id)) continue;
    const { id, sender, recipient, sendTime, bytes, airtime } = e.send;
    sendTimes.set(id, sendTime);
    sends.push({ id, sender, recipient, sendTime, bytes, ...(airtime === undefined ? {} : { airtime }) });
  }
  const outcomes = log
    .flatMap((e) => (e.kind === "wire" ? [e.event] : []))
    .map((event, n) => {
      const sentAt = event.id === undefined ? undefined : sendTimes.get(event.id);
      if (sentAt !== undefined && sentAt <= event.simTime) return { event, arrival: false };
      const id = `Message ${n + 1} from ${event.sender}`;
      // No send is recorded for this outcome: the kit turns it into an arrival.
      return { event: { ...event, id }, arrival: true };
    });
  return { sends, outcomes };
}

export function toLedger(scenario: Scenario, log: readonly ConsoleLogEntry[], state: SimState): Ledger {
  const { sends, outcomes: classified } = classify(log);
  const outcomes = classified.map((o) => o.event);
  const fromWire = ledgerFromChannel(sends, replayChannelLog(outcomes));
  const learned = scenario.roles.flatMap((r) =>
    eventsForRole(scenario.events, r.id, state.cursorSimTime)
      .filter((e) => e.type === "info" || e.type === "message_created")
      .map((e) => ({ kind: "learned" as const, participant: r.id, factId: e.title, simTime: e.simTime })),
  );
  return buildLedger([...fromWire, ...learned]);
}

/**
 * Who is on the replay and what the log holds for each. The local role is
 * complete. The other role is complete only in Solo, and only if the log has a
 * send from it or no arrival from it (a save from before send entries has
 * arrivals and no sends, so it is arrivals-only). Two tabs and acoustic are
 * always arrivals-only for the partner.
 */
export function toParticipants(
  scenario: Scenario,
  log: readonly ConsoleLogEntry[],
  { mode, localRole }: { mode: PlayMode; localRole: RoleId },
): ReplayParticipant[] {
  return scenario.roles.map((r) => {
    if (r.id === localRole) return { id: r.id, label: r.name };
    const hasSend = log.some((e) => e.kind === "send" && e.send.sender === r.id);
    const hasArrival = log.some((e) => e.kind === "wire" && e.event.sender === r.id);
    if (mode === "solo" && (hasSend || !hasArrival)) return { id: r.id, label: r.name };
    return { id: r.id, label: r.name, history: "arrivals-only" as const, limitNote: LIMIT_NOTE };
  });
}

/**
 * Readable names for messages, keyed by the id the ledger uses. A message with a
 * recorded send from a complete sender is "Message from {role} at {time}". An
 * arrival (no recorded send, or a sender whose sends are not recorded) is named
 * by its arrival: "Message from {role}, arrived {time}". No send time is invented.
 */
export function toNames(
  scenario: Scenario,
  log: readonly ConsoleLogEntry[],
  participants: readonly ReplayParticipant[],
  formatTime: (t: number) => string,
): Record<string, string> {
  const role = (id: string): string => scenario.roles.find((r) => r.id === id)?.name ?? id;
  const limited = new Set(participants.filter((p) => p.history === "arrivals-only").map((p) => p.id));
  const { sends, outcomes } = classify(log);
  const names: Record<string, string> = {};
  for (const s of sends) {
    if (!limited.has(s.sender)) names[s.id] = `Message from ${role(s.sender)} at ${formatTime(s.sendTime)}`;
  }
  for (const { event, arrival } of outcomes) {
    if (event.id === undefined) continue;
    if (arrival || names[event.id] === undefined) {
      names[event.id] = `Message from ${role(event.sender)}, arrived ${formatTime(event.simTime)}`;
    }
  }
  return names;
}

/** The scenario plus one `decision` event per recorded decision. */
export function toReplayScenario(scenario: Scenario, state: SimState): Scenario {
  const decisions: SimEvent[] = state.decisions.map((d) => ({
    id: `decision-${d.role}`,
    type: "decision",
    simTime: d.recordedAtSimTime,
    audience: d.role,
    actor: d.role,
    title: scenario.decisionPrompts[d.role]?.options.find((o) => o.id === d.optionId)?.label ?? d.optionId,
    body: "",
  }));
  return { ...scenario, events: [...scenario.events, ...decisions] };
}
