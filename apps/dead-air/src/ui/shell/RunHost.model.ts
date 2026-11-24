/**
 * Pure helpers for RunHost (consoles 11.2). No React, no DOM, no clock.
 */
import { eventsForRole, timelineSteps } from "hindsight";
import { NOMINAL_AIRTIME } from "../../transport/scripted";
import type { ScriptedSend } from "../../transport/scripted";
import { buildPayload } from "../consoles/booth/composer";
import type { DiscardReason } from "./persist";
import type {
  ConsoleLogEntry,
  PlayMode,
  RoleId,
  Scenario,
  SendRecord,
  SimEvent,
  SimState,
  TransportEvent,
  TransportStatus,
} from "./types";

export const ROLE_KEY = "dead-air:run:role";

/** The other end of the line. With more than two roles, the first other role. */
export function partnerOf(scenario: Scenario, role: RoleId): RoleId {
  return scenario.roles.find((r) => r.id !== role)?.id ?? role;
}

/**
 * Which console a role sits at: the first role in the scenario is at the Booth
 * (the base-table teleprinter), every other role has the Tower pager.
 */
export function consoleFor(scenario: Scenario, role: RoleId): "booth" | "tower" {
  return scenario.roles[0]?.id === role ? "booth" : "tower";
}

/**
 * The scripted partner's sends: one per scenario `message_created` beat that is
 * written by the partner. The text is the quoted note in the beat body, or its
 * title, cut to 64 bytes. Sent at the beat's sim-time.
 */
export function partnerSchedule(scenario: Scenario, role: RoleId): ScriptedSend[] {
  const partner = partnerOf(scenario, role);
  if (partner === role) return [];
  return scenario.events
    .filter((e) => e.type === "message_created" && e.audience === partner)
    .map((e, i) => ({
      id: `${partner}-s${i}`,
      sender: partner,
      recipient: role,
      sendTime: e.simTime,
      payload: buildPayload(/"([^"]+)"/.exec(e.body)?.[1] ?? e.title),
    }));
}

/**
 * The Solo partner's sends as log records. Known from the schedule, so they are
 * recorded when the role is chosen, whether or not they later arrive.
 */
export function scheduledSends(schedule: readonly ScriptedSend[]): SendRecord[] {
  return schedule.map((s, i) => ({
    id: s.id ?? `${s.sender}-s${i}`,
    sender: s.sender,
    recipient: s.recipient,
    sendTime: s.sendTime,
    bytes: s.payload.length,
    // The scripted transport puts exactly this on the line for collision tests.
    airtime: s.airtime ?? NOMINAL_AIRTIME,
  }));
}

/** The one plain sentence for a change in the link. Never says to switch modes. */
export function statusSentence(mode: PlayMode | null, status: TransportStatus): string {
  if (mode === "acoustic") {
    if (status.reason === "microphone-ended") return "The microphone stopped, so nothing more can be heard.";
    if (status.reason === "audio-closed") return "The sound system closed, so nothing more can be heard or sent.";
    if (status.reason === "audio-interrupted") return "Sound was interrupted, so a message may be missing.";
    return status.kind === "ended" ? "The sound link closed." : "The sound link had a fault.";
  }
  if (mode === "loopback") {
    return status.kind === "ended"
      ? "The link to the other tab closed."
      : "The link to the other tab had a fault, so a message may be missing.";
  }
  return status.kind === "ended" ? "The practice line closed." : "The practice line had a fault.";
}

/** Outcomes a role sees: addressed to it, or a collision on a line it sent. */
export function wireFor(log: readonly ConsoleLogEntry[], role: RoleId): TransportEvent[] {
  const out: TransportEvent[] = [];
  for (const entry of log) {
    if (entry.kind !== "wire") continue;
    const e = entry.event;
    if (e.recipient === role || (e.kind === "collision" && e.sender === role)) out.push(e);
  }
  return out;
}

/**
 * The scenario beats a role knows at the cursor. Delivery beats are left out:
 * whether a note arrived is decided by the wire, not by the script.
 */
export function briefingFor(scenario: Scenario, role: RoleId, cursor: number): SimEvent[] {
  return eventsForRole(scenario.events, role, cursor).filter((e) => e.type !== "message_delivered");
}

/** Finished means the cursor has reached the last step of the scenario timeline. */
export function isFinished(state: SimState): boolean {
  const steps = timelineSteps(state.scenario);
  return steps.length === 0 || state.cursorSimTime >= steps[steps.length - 1];
}

export function lastStep(scenario: Scenario): number {
  const steps = timelineSteps(scenario);
  return steps.length === 0 ? 0 : steps[steps.length - 1];
}

/** Same wire outcome already in the log (the scripted transport re-emits its whole batch). */
export function hasWire(log: readonly ConsoleLogEntry[], event: TransportEvent): boolean {
  const same = (a?: Uint8Array, b?: Uint8Array): boolean =>
    a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]));
  return log.some(
    (l) =>
      l.kind === "wire" &&
      l.event.kind === event.kind &&
      l.event.simTime === event.simTime &&
      l.event.sender === event.sender &&
      l.event.recipient === event.recipient &&
      same(l.event.payload, event.payload),
  );
}

const WHY: Record<Exclude<DiscardReason, "empty" | "storage-error">, string> = {
  "bad-json": "it is not readable data",
  "bad-shape": "it is damaged",
  "unknown-version": "it was made by a different version",
  "unknown-scenario": "it is for a drill this version does not have",
  "bad-entry": "one of its entries is not valid",
};

/** The one sentence that names why a saved run was not opened. */
export function unreadableSentence(reason: Exclude<DiscardReason, "empty" | "storage-error">): string {
  return `Your saved run could not be opened (${WHY[reason]}), so this is a new run. The saved run has been kept.`;
}

export const HELD_LINE = "This new run will not be saved while that saved run is kept.";
export const UNSAVED_LINE = "This run will not be saved on this device.";
export const DISCARDED_LINE = "The saved run was discarded. This run will be saved.";
