// Pure replay layout: one row per participant, ticks in sim-time order.
// Imports only from the ledger and the engine. No React, no DOM.
import type { ParticipantId, Scenario } from "../engine/types";
import { contradictsSend, sentTimes } from "../ledger/ledger";
import type { Ledger } from "../ledger/ledger";

export type ReplayTickKind = "decision" | "knowledge";

export interface ReplayTick {
  kind: ReplayTickKind;
  simTime: number;
  /** Decision event id, fact id or message id. Opaque. */
  id: string;
  label: string;
}

export interface ReplayRow {
  participant: ParticipantId;
  label: string;
  ticks: readonly ReplayTick[];
}

export interface ReplayLayout {
  rows: readonly ReplayRow[];
  start: number;
  end: number;
}

const KIND_ORDER: Record<ReplayTickKind, number> = { decision: 0, knowledge: 1 };

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Rows follow `scenario.roles`; participants seen only in the log are appended in first-seen order. */
export function layoutReplay(ledger: Ledger, scenario: Scenario): ReplayLayout {
  const labels = new Map<ParticipantId, string>();
  const ticks = new Map<ParticipantId, ReplayTick[]>();
  const add = (p: ParticipantId, label: string): ReplayTick[] => {
    if (!labels.has(p)) {
      labels.set(p, label);
      ticks.set(p, []);
    }
    return ticks.get(p) as ReplayTick[];
  };
  for (const r of scenario.roles) add(r.id, r.name);

  for (const e of scenario.events) {
    if (e.type === "decision" && e.actor !== undefined) {
      add(e.actor, e.actor).push({ kind: "decision", simTime: e.simTime, id: e.id, label: e.title });
    }
  }
  const recipients = new Map<string, ParticipantId>();
  for (const e of ledger.events) if (e.kind === "sent") recipients.set(e.messageId, e.recipient);
  const firstSend = sentTimes(ledger);
  for (const e of ledger.events) {
    if (e.kind === "outcome" && contradictsSend(e, firstSend.get(e.messageId))) continue;
    if (e.kind === "learned") {
      add(e.participant, e.participant).push({
        kind: "knowledge",
        simTime: e.simTime,
        id: e.factId,
        label: e.factId,
      });
    } else if (e.kind === "outcome" && e.outcome === "received") {
      const to = recipients.get(e.messageId);
      if (to !== undefined) {
        add(to, to).push({ kind: "knowledge", simTime: e.simTime, id: e.messageId, label: e.messageId });
      }
    }
  }

  const rows: ReplayRow[] = [];
  let start = Infinity;
  let end = -Infinity;
  for (const [participant, list] of ticks) {
    const sorted = [...list].sort(
      (a, b) => a.simTime - b.simTime || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(a.id, b.id),
    );
    for (const t of sorted) {
      start = Math.min(start, t.simTime);
      end = Math.max(end, t.simTime);
    }
    rows.push({ participant, label: labels.get(participant) as string, ticks: sorted });
  }
  if (start === Infinity) {
    start = 0;
    end = 0;
  }
  return { rows, start, end };
}
