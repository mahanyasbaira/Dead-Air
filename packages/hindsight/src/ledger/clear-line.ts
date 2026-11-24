// Counterfactual: the same record on a line that never loses or delays anything.
// Imports only from the ledger. Pure: no clock, no randomness, no DOM.

import type { ParticipantId } from "../engine/types";
import { buildLedger, contradictsSend, knownAt, sentTimes } from "./ledger";
import type { Ledger, LedgerEvent } from "./ledger";

/**
 * Every `sent` message arrives intact at the time it was sent. Its earlier outcomes
 * (garbled, collision, a later receipt) are replaced by that one received outcome.
 * If the message was already received at a valid time earlier than the send it is cleared
 * to (a later send to the same recipient), that earlier time stands, so a clear line never
 * removes anything that was known. An outcome or arrival earlier than the first send is
 * contradictory and ignored.
 *
 * `learned`, `arrival` and `readback` events are left as they are. An arrival has no
 * known send, so nothing is added for senders whose sends are not in the log, and
 * outcomes with no `sent` event stay as they were.
 */
export function clearLine(l: Ledger): Ledger {
  // `knownAt` credits a message to the recipient of its last `sent` event, so only
  // sends to that recipient can set the clear time.
  const recipient = new Map<string, ParticipantId>();
  for (const e of l.events) if (e.kind === "sent") recipient.set(e.messageId, e.recipient);
  const clearAt = new Map<string, number>();
  for (const e of l.events) {
    if (e.kind === "sent" && recipient.get(e.messageId) === e.recipient) {
      const current = clearAt.get(e.messageId);
      if (current === undefined || e.simTime < current) clearAt.set(e.messageId, e.simTime);
    }
  }
  const firstSend = sentTimes(l);
  for (const e of l.events) {
    // An outcome earlier than the first send is contradictory and ignored (design.md, 2026-11-23).
    if (e.kind === "outcome" && e.outcome === "received" && !contradictsSend(e, firstSend.get(e.messageId))) {
      const current = clearAt.get(e.messageId);
      if (current !== undefined && e.simTime < current) clearAt.set(e.messageId, e.simTime);
    }
  }
  const kept = l.events.filter((e) => !(e.kind === "outcome" && clearAt.has(e.messageId)));
  const added: LedgerEvent[] = [];
  for (const [messageId, simTime] of clearAt) {
    added.push({ kind: "outcome", messageId, outcome: "received", simTime });
  }
  return buildLedger([...kept, ...added]);
}

/** Ids `p` would also have known at `t` on a clear line: `knownAt(clearLine(l), p, t)` minus `knownAt(l, p, t)`. */
export function gainAt(l: Ledger, p: ParticipantId, t: number): readonly string[] {
  const before = knownAt(l, p, t);
  return [...knownAt(clearLine(l), p, t)].filter((id) => !before.has(id)).sort();
}
