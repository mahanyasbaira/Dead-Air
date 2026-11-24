/**
 * Share link for a finished run (seance-replay 4.5). Pure: the caller passes the
 * origin, base and hash, so nothing here reads `location`, storage or the network.
 *
 * Out: the run's ledger, participants and decisions are encoded with the kit codec
 * into `<origin><base>#s=<token>`. A fragment is never sent to a server, so the
 * service worker's cached page serves a link offline.
 *
 * In: `openShared` decodes a hash and finds the scenario by id in this app's bundle.
 * It never touches storage and never starts a transport.
 */
import { buildLedger } from "hindsight";
import type { Ledger, Scenario, SimEvent } from "hindsight";
import { decodeReplayRecord, encodeReplayRecord } from "hindsight/replay";
import type { ReplayParticipant, ReplayRecord } from "hindsight/replay";
import { scenarios } from "../../scenarios/static-on-channel-9";

export const TOO_LARGE_SENTENCE = "This run is too long to share as a link. Use Copy summary instead.";
export const BAD_LINK_SENTENCE = "This replay link could not be opened, so this is the start of a new drill.";
export const UNKNOWN_SCENARIO_SENTENCE = "This replay link is for a drill this version does not have, so this is the start of a new drill.";

/** The record of a run: its ledger, who was on it, and the decisions in `replayScenario`. */
export function toRecord(scenario: Scenario, replayScenario: Scenario, ledger: Ledger, participants: readonly ReplayParticipant[]): ReplayRecord {
  const decisions = replayScenario.events.flatMap((e) =>
    e.type === "decision" && e.actor !== undefined ? [{ id: e.id, actor: e.actor, simTime: e.simTime, title: e.title }] : [],
  );
  return { version: 1, scenarioId: scenario.id, participants: [...participants], events: [...ledger.events], decisions };
}

export type ShareLink = { ok: true; url: string } | { ok: false };

/** `<origin><base>#s=<token>`. No link when encoding fails or the origin is opaque. */
export function shareLink(record: ReplayRecord, origin: string, base: string): ShareLink {
  if (origin === "" || origin === "null") return { ok: false };
  const encoded = encodeReplayRecord(record);
  if (!encoded.ok) return { ok: false };
  return { ok: true, url: `${origin}${base}#s=${encoded.token}` };
}

/** The token in a `#s=` hash, or null when the hash is not a share fragment. */
export function tokenFromHash(hash: string): string | null {
  const m = /^#s=(.*)$/.exec(hash);
  return m ? (m[1] as string) : null;
}

/**
 * Message names rebuilt from the ledger alone, with the same wording RunEnd gives
 * from the log: "Message from {role} at {time}" for a recorded send from a complete
 * sender, "Message from {role}, arrived {time}" otherwise.
 */
export function namesFromLedger(
  ledger: Ledger,
  participants: readonly ReplayParticipant[],
  formatTime: (t: number) => string,
): Record<string, string> {
  const label = (id: string): string => participants.find((p) => p.id === id)?.label ?? id;
  const limited = new Set(participants.filter((p) => p.history === "arrivals-only").map((p) => p.id));
  const senders = new Map<string, string>();
  const names: Record<string, string> = {};
  for (const e of ledger.events) {
    if (e.kind !== "sent") continue;
    senders.set(e.messageId, e.sender);
    if (!limited.has(e.sender)) names[e.messageId] = `Message from ${label(e.sender)} at ${formatTime(e.simTime)}`;
  }
  for (const e of ledger.events) {
    if (e.kind === "arrival") names[e.messageId] = `Message from ${label(e.sender)}, arrived ${formatTime(e.simTime)}`;
    else if (e.kind === "outcome" && names[e.messageId] === undefined) {
      const sender = senders.get(e.messageId);
      if (sender !== undefined) names[e.messageId] = `Message from ${label(sender)}, arrived ${formatTime(e.simTime)}`;
    }
  }
  return names;
}

export type Shared =
  | { kind: "none" }
  | { kind: "bad"; sentence: string }
  | { kind: "ok"; scenario: Scenario; ledger: Ledger; participants: ReplayParticipant[] };

export function openShared(hash: string): Shared {
  const token = tokenFromHash(hash);
  if (token === null) return { kind: "none" };
  const decoded = decodeReplayRecord(token);
  if (!decoded.ok) return { kind: "bad", sentence: BAD_LINK_SENTENCE };
  const { record } = decoded;
  const base = Object.prototype.hasOwnProperty.call(scenarios, record.scenarioId) ? scenarios[record.scenarioId] : undefined;
  if (!base) return { kind: "bad", sentence: UNKNOWN_SCENARIO_SENTENCE };
  const decisions: SimEvent[] = record.decisions.map((d) => ({
    id: d.id,
    type: "decision",
    simTime: d.simTime,
    audience: d.actor,
    actor: d.actor,
    title: d.title,
    body: "",
  }));
  return {
    kind: "ok",
    scenario: { ...base, events: [...base.events, ...decisions] },
    ledger: buildLedger(record.events),
    participants: record.participants,
  };
}
