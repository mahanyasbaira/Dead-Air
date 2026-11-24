// Text for one moment: what a participant had, and what was missing, at sim-time t.
// Pure. Plain facts only; no sentence says what should have been done.
import type { ParticipantId } from "../engine/types";
import { buildLedger, inTransitAt, knownAt, lostAt } from "../ledger/ledger";
import type { Ledger } from "../ledger/ledger";
import { resolveParticipants } from "./participants";
import type { WorldlineInput } from "./types";

export interface Missing {
  /** Addressed to the participant, sent by t, no outcome by t. */
  inTransit: readonly string[];
  /** Addressed to the participant, garbled or collided by t. */
  lost: readonly string[];
  /** Known to another participant by t, not to this one. Its own sends are left out. */
  elsewhere: readonly string[];
}

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

export function missingAt(l: Ledger, f: ParticipantId, t: number): Missing {
  const ledger = buildLedger(l.events);
  const known = knownAt(ledger, f, t);
  const inTransit = sorted(inTransitAt(ledger, f, t));
  const lost = sorted(lostAt(ledger, f, t));
  const own = new Set<string>();
  const others = new Set<ParticipantId>();
  for (const e of ledger.events) {
    if (e.kind === "sent" && e.sender === f) own.add(e.messageId);
    if (e.kind === "learned") others.add(e.participant);
    else if (e.kind === "sent" || e.kind === "arrival") others.add(e.recipient);
  }
  others.delete(f);
  const taken = new Set<string>([...known, ...inTransit, ...lost, ...own]);
  const elsewhere = new Set<string>();
  for (const p of others) for (const id of knownAt(ledger, p, t)) if (!taken.has(id)) elsewhere.add(id);
  return { inTransit, lost, elsewhere: sorted(elsewhere) };
}

/**
 * Plain sentences for participant `f` at time `t`. For a message whose sender has an
 * arrivals-only history, no "not yet arrived" claim is made: its sends are not known.
 */
export function momentSentences(
  input: WorldlineInput,
  f: ParticipantId,
  t: number,
  fmt: (t: number) => string,
): string[] {
  const ledger = buildLedger(input.ledger.events);
  const participants = resolveParticipants(ledger, input.scenario, input.participants);
  const label = participants.find((p) => p.id === f)?.label ?? f;
  const names = input.names ?? {};
  const name = (id: string): string => names[id] ?? id;
  const list = (ids: readonly string[]): string => ids.map(name).join(", ");

  const limited = new Set(participants.filter((p) => p.history === "arrivals-only").map((p) => p.id));
  const senderOf = new Map<string, ParticipantId>();
  for (const e of ledger.events) if (e.kind === "sent" && !senderOf.has(e.messageId)) senderOf.set(e.messageId, e.sender);

  const known = sorted(knownAt(ledger, f, t));
  const missing = missingAt(ledger, f, t);
  const inTransit = missing.inTransit.filter((id) => !limited.has(senderOf.get(id) as ParticipantId));

  const out: string[] = [];
  out.push(
    known.length === 0
      ? `At ${fmt(t)}, ${label} had nothing yet.`
      : `At ${fmt(t)}, ${label} had ${known.length} ${known.length === 1 ? "thing" : "things"}: ${list(known)}.`,
  );
  if (inTransit.length > 0) out.push(`Not yet arrived: ${list(inTransit)}.`);
  if (missing.lost.length > 0) out.push(`Lost on the way: ${list(missing.lost)}.`);
  if (missing.elsewhere.length > 0) out.push(`Known elsewhere: ${list(missing.elsewhere)}.`);
  return out;
}
