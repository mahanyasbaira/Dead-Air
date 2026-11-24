/**
 * Console run log and decision lock (consoles design, "Data Models" and
 * "Decision after lock"). Pure functions over `ConsoleLogEntry[]`.
 *
 * The engine reducer (`hindsight`) holds all state transitions. It does not
 * reject a late decision: `recordDecision` there replaces the earlier choice for
 * a role. So the lock lives here, and only here, as a gate in front of the
 * reducer: a decision entry is applied only if the role's earlier decision is not
 * locked at the current cursor. Both `recordDecision` and `deriveState` use the
 * same gate, so replaying a log always agrees with applying it incrementally.
 *
 * How the cursor moves: the log has no "advance" entry, so the timeline advances
 * when a wire outcome arrives. A wire event with sim-time `t` jumps the cursor to
 * `max(cursor, t)` (the cursor never moves backwards). Wire events are stored as
 * received, with no reshaping.
 *
 * Lock rule: a decision recorded at sim-time `t` is locked once the cursor has
 * reached the first timeline step after `t` (the next beat). If `t` is at or
 * past the last step there is no next beat, so that decision never locks.
 */
import { initialState, reduce, timelineSteps } from "hindsight";
import type {
  ConsoleLogEntry,
  RecordedDecision,
  RoleId,
  Scenario,
  SendRecord,
  SimState,
  TransportEvent,
} from "./types";

export type ConsoleLog = readonly ConsoleLogEntry[];

/** Result of trying to record a decision. Rejections are values, not throws. */
export type RecordDecisionResult =
  | { ok: true; log: ConsoleLogEntry[]; state: SimState }
  | {
      ok: false;
      reason: "locked";
      /** The stored decision, unchanged. */
      kept: RecordedDecision;
      /** Plain-text explanation for the status line. */
      message: string;
    };

/** The empty log a run starts from. */
export const emptyLog: ConsoleLog = [];

/** Append one wire outcome. Returns a new array; the input is never mutated. */
export function appendWire(log: ConsoleLog, event: TransportEvent): ConsoleLogEntry[] {
  return [...log, { kind: "wire", event }];
}

/**
 * Append one send. Returns a new array. A send never moves the cursor or the
 * engine state: only outcomes advance the timeline.
 */
export function appendSend(log: ConsoleLog, send: SendRecord): ConsoleLogEntry[] {
  return [...log, { kind: "send", send }];
}

/** Sim-time at which a decision recorded at `recordedAt` locks, or Infinity. */
export function lockTime(scenario: Scenario, recordedAt: number): number {
  const next = timelineSteps(scenario).find((t) => t > recordedAt);
  return next ?? Number.POSITIVE_INFINITY;
}

/** True when `decision` can no longer be changed at the state's cursor. */
export function isLocked(state: SimState, decision: RecordedDecision): boolean {
  return state.cursorSimTime >= lockTime(state.scenario, decision.recordedAtSimTime);
}

/** The stored decision for a role, if any. */
export function decisionFor(state: SimState, role: RoleId): RecordedDecision | undefined {
  return state.decisions.find((d) => d.role === role);
}

/** Apply one entry to a state. Shared by replay and incremental use. */
export function applyEntry(state: SimState, entry: ConsoleLogEntry): SimState {
  if (entry.kind === "send") return state;
  if (entry.kind === "wire") {
    const t = entry.event.simTime;
    return t > state.cursorSimTime ? reduce(state, { type: "jumpTo", simTime: t }) : state;
  }
  const existing = decisionFor(state, entry.decision.role);
  if (existing && isLocked(state, existing)) return state;
  return reduce(state, { type: "recordDecision", decision: entry.decision });
}

/** Derive state by replaying the whole log through the engine reducer. */
export function deriveState(scenario: Scenario, log: ConsoleLog): SimState {
  return log.reduce(applyEntry, initialState(scenario));
}

/**
 * Record a decision. Accepted while the role's earlier decision is unlocked
 * (the later choice replaces it, as the reducer does). Rejected, with the stored
 * decision unchanged, once the next beat has begun.
 */
export function recordDecision(
  scenario: Scenario,
  log: ConsoleLog,
  decision: RecordedDecision,
): RecordDecisionResult {
  const state = deriveState(scenario, log);
  const existing = decisionFor(state, decision.role);
  if (existing && isLocked(state, existing)) {
    return {
      ok: false,
      reason: "locked",
      kept: existing,
      message: "That choice is locked. The next beat has already begun.",
    };
  }
  const next: ConsoleLogEntry[] = [...log, { kind: "decision", decision }];
  return { ok: true, log: next, state: applyEntry(state, next[next.length - 1]) };
}
