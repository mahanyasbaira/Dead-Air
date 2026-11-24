// Knowledge ledger: who knew what at sim-time t.
// Imports only from the engine. Pure: no clock, no randomness, no DOM.

import type { ParticipantId } from "../engine/types";

export type LedgerEvent =
  | { kind: "learned"; participant: ParticipantId; factId: string; simTime: number }
  | {
      kind: "sent";
      messageId: string;
      sender: ParticipantId;
      recipient: ParticipantId;
      simTime: number;
      /** Size of the message, when the caller knows it. */
      bytes?: number;
      /** Time the message occupied the line, in sim-time units, when known. */
      airtime?: number;
    }
  | {
      kind: "outcome";
      messageId: string;
      outcome: "received" | "garbled" | "collision";
      simTime: number;
    }
  | {
      /** Something reached `recipient` and the time it was sent is not in the log. */
      kind: "arrival";
      messageId: string;
      sender: ParticipantId;
      recipient: ParticipantId;
      outcome: "received" | "garbled" | "collision";
      simTime: number;
    }
  | { kind: "readback"; participant: ParticipantId; messageId: string; simTime: number };

export interface Ledger {
  readonly events: readonly LedgerEvent[];
}

const KIND_ORDER: Record<LedgerEvent["kind"], number> = {
  sent: 0,
  learned: 1,
  outcome: 2,
  arrival: 2,
  readback: 3,
};

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function key(e: LedgerEvent): string {
  switch (e.kind) {
    case "learned":
      return `${e.participant}\u0000${e.factId}`;
    case "sent":
      return `${e.messageId}\u0000${e.sender}\u0000${e.recipient}`;
    case "outcome":
      return `${e.messageId}\u0000${e.outcome}`;
    case "arrival":
      return `${e.messageId}\u0000${e.sender}\u0000${e.recipient}\u0000${e.outcome}`;
    case "readback":
      return `${e.participant}\u0000${e.messageId}`;
  }
}

/** Sort into a canonical order (simTime, kind, key) so input order never matters. */
export function buildLedger(events: readonly LedgerEvent[]): Ledger {
  const sorted = events
    .map((e) => ({ ...e }))
    .sort(
      (a, b) =>
        a.simTime - b.simTime || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(key(a), key(b)),
    );
  return { events: sorted };
}

function recipientsOf(l: Ledger): Map<string, ParticipantId> {
  const recipients = new Map<string, ParticipantId>();
  for (const e of l.events) if (e.kind === "sent") recipients.set(e.messageId, e.recipient);
  return recipients;
}

/**
 * Time of the first `sent` event for each message id. The events are sorted, so the first
 * one seen is the earliest. An outcome or arrival earlier than this time contradicts the
 * log (see `contradictsSend`) and is ignored, as `layoutWorldlines` does.
 */
export function sentTimes(l: Ledger): Map<string, number> {
  const times = new Map<string, number>();
  for (const e of l.events) {
    if (e.kind !== "sent") continue;
    const prior = times.get(e.messageId);
    if (prior === undefined || e.simTime < prior) times.set(e.messageId, e.simTime);
  }
  return times;
}

/**
 * The one well-formedness rule (design.md, 2026-11-23). An `outcome` or `arrival` for a
 * message that has a `sent` event, earlier than the first of them, is contradictory:
 * a message never reaches anyone before it leaves. Every query and the layout ignore it.
 * An `arrival` for an id with no `sent` at all is valid (the arrivals-only case).
 */
export function contradictsSend(e: LedgerEvent, sentAt: number | undefined): boolean {
  return (e.kind === "outcome" || e.kind === "arrival") && sentAt !== undefined && e.simTime < sentAt;
}

/** Ids that have at least one contradictory outcome or arrival (see `contradictsSend`). */
export function contradictedIds(l: Ledger): ReadonlySet<string> {
  const sentAt = sentTimes(l);
  const ids = new Set<string>();
  for (const e of l.events) {
    if ((e.kind === "outcome" || e.kind === "arrival") && contradictsSend(e, sentAt.get(e.messageId))) ids.add(e.messageId);
  }
  return ids;
}

/** How a message reached its recipient, and when. */
export interface Settled {
  outcome: "received" | "garbled" | "collision";
  simTime: number;
}

/**
 * The one rule for when a message settled for `recipient`. Candidates are the outcomes
 * (for a message with a `sent` event addressed to `recipient`) and the arrivals addressed
 * to `recipient`, both at or after the first send when there is one. The events are sorted, so the first match is
 * the earliest. Everything that places a message in time goes through this.
 */
function settledEvents(l: Ledger, id: string, recipient: ParticipantId, received: boolean): Settled | undefined {
  const recipients = recipientsOf(l);
  const sentAt = sentTimes(l).get(id);
  for (const e of l.events) {
    if (e.kind === "outcome") {
      if (e.messageId !== id || sentAt === undefined || contradictsSend(e, sentAt)) continue;
      if (recipients.get(id) !== recipient) continue;
    } else if (e.kind === "arrival") {
      if (e.messageId !== id || e.recipient !== recipient || contradictsSend(e, sentAt)) continue;
    } else continue;
    if ((e.outcome === "received") === received) return { outcome: e.outcome, simTime: e.simTime };
  }
  return undefined;
}

/** Earliest valid time message `id` was received intact by `recipient`, or undefined. */
export function receivedAt(l: Ledger, id: string, recipient: ParticipantId): number | undefined {
  return settledEvents(l, id, recipient, true)?.simTime;
}

/** Earliest valid garbled or collided outcome or arrival of `id` for `recipient`, or undefined. */
export function firstLoss(l: Ledger, id: string, recipient: ParticipantId): Settled | undefined {
  return settledEvents(l, id, recipient, false);
}

/** Facts and intact messages participant `p` held at time `t` (inclusive). */
export function knownAt(l: Ledger, p: ParticipantId, t: number): ReadonlySet<string> {
  const known = new Set<string>();
  const ids = new Set<string>();
  for (const e of l.events) {
    if (e.simTime > t) continue;
    if (e.kind === "learned" && e.participant === p) known.add(e.factId);
    else if (e.kind === "outcome" || e.kind === "arrival") ids.add(e.messageId);
  }
  for (const id of ids) {
    const r = receivedAt(l, id, p);
    if (r !== undefined && r <= t) known.add(id);
  }
  return known;
}

/**
 * Messages addressed to `p`, sent at or before `t`, with no outcome at or before `t`.
 * A dropped message has no outcome at all, so it stays in transit.
 * A message `p` already holds (`knownAt`, including one received through an
 * `arrival`) is not on its way to `p`, so it is excluded. So is a message that
 * reached `p` damaged through an `arrival` (`lostAt`).
 */
export function inTransitAt(l: Ledger, p: ParticipantId, t: number): ReadonlySet<string> {
  const sent = new Set<string>();
  for (const e of l.events) if (e.kind === "sent" && e.recipient === p && e.simTime <= t) sent.add(e.messageId);
  for (const id of [...sent]) {
    const r = receivedAt(l, id, p);
    const loss = firstLoss(l, id, p);
    if ((r !== undefined && r <= t) || (loss !== undefined && loss.simTime <= t)) sent.delete(id);
  }
  for (const id of knownAt(l, p, t)) sent.delete(id);
  for (const id of lostAt(l, p, t)) sent.delete(id);
  return sent;
}

/**
 * Messages addressed to `p` that were garbled or collided at or before `t` and
 * had not been received intact by then. Disjoint from `knownAt` and `inTransitAt`.
 */
export function lostAt(l: Ledger, p: ParticipantId, t: number): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const e of l.events) {
    if (e.simTime > t) continue;
    if (e.kind === "outcome" || e.kind === "arrival") ids.add(e.messageId);
  }
  const lost = new Set<string>();
  for (const id of ids) {
    const loss = firstLoss(l, id, p);
    if (loss === undefined || loss.simTime > t) continue;
    const r = receivedAt(l, id, p);
    if (r === undefined || r > t) lost.add(id);
  }
  return lost;
}

export type ClosedFate = "received" | "garbled" | "collision" | "never-arrived";

/**
 * The settled fate of every message that has a `sent` event, for a record that is
 * closed. A message with no outcome never arrived. If it has several outcomes,
 * `received` wins; otherwise the earliest one stands. An outcome earlier than its
 * send is ignored. Arrivals have no send and are not listed.
 */
export function closedFates(l: Ledger): ReadonlyMap<string, ClosedFate> {
  const fates = new Map<string, ClosedFate>();
  const recipients = recipientsOf(l);
  for (const id of sentTimes(l).keys()) {
    const to = recipients.get(id) as ParticipantId;
    if (receivedAt(l, id, to) !== undefined) fates.set(id, "received");
    else fates.set(id, firstLoss(l, id, to)?.outcome ?? "never-arrived");
  }
  return fates;
}

/** Number of outcome events whose message has no `sent` event. They are never known. */
export function orphanOutcomes(l: Ledger): number {
  const sent = new Set<string>();
  for (const e of l.events) if (e.kind === "sent") sent.add(e.messageId);
  let n = 0;
  for (const e of l.events) if (e.kind === "outcome" && !sent.has(e.messageId)) n++;
  return n;
}
