import { orderEvents } from "./audience";
import type {
  PlayLog,
  RecordedDecision,
  Scenario,
  SimEvent,
  SimState,
} from "./types";

/** Actions the UI dispatches. Everything stays a pure function of state + action. */
export type Action =
  | { type: "advance" }
  | { type: "jumpTo"; simTime: number }
  | { type: "recordDecision"; decision: RecordedDecision }
  | { type: "reset" };

/** The distinct, ordered sim-times present in a scenario's timeline. */
export function timelineSteps(scenario: Scenario): number[] {
  const times = new Set<number>();
  for (const e of scenario.events) times.add(e.simTime);
  return [...times].sort((a, b) => a - b);
}

/** Fresh state at the start of a play-through: nothing seen, no decisions. */
export function initialState(scenario: Scenario): SimState {
  const steps = timelineSteps(scenario);
  return {
    scenario,
    cursorSimTime: steps.length > 0 ? steps[0] : 0,
    decisions: [],
  };
}

/** The next sim-time after the cursor, or the cursor itself if already at the end. */
export function nextSimTime(scenario: Scenario, current: number): number {
  const steps = timelineSteps(scenario);
  const next = steps.find((t) => t > current);
  return next ?? current;
}

/**
 * Pure reducer. Deterministic: same state + same action => same next state.
 * Recording a decision for a role twice replaces the earlier one (one choice per role
 * in this slice), keeping the decision list stable and order-independent.
 */
export function reduce(state: SimState, action: Action): SimState {
  switch (action.type) {
    case "advance":
      return { ...state, cursorSimTime: nextSimTime(state.scenario, state.cursorSimTime) };
    case "jumpTo":
      return { ...state, cursorSimTime: action.simTime };
    case "recordDecision": {
      const decisions = [
        ...state.decisions.filter((d) => d.role !== action.decision.role),
        action.decision,
      ].sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
      return { ...state, decisions };
    }
    case "reset":
      return initialState(state.scenario);
    default:
      return state;
  }
}

/**
 * Deterministic replay: rebuild final state from a scenario and a decision log.
 * Given the same scenario and log, this always yields identical state.
 */
export function replay(scenario: Scenario, log: PlayLog): SimState {
  let state = initialState(scenario);
  // Advance to the end of the timeline.
  const steps = timelineSteps(scenario);
  if (steps.length > 0) state = reduce(state, { type: "jumpTo", simTime: steps[steps.length - 1] });
  // Apply decisions in a stable, sorted order so replay is order-independent.
  const ordered = [...log.decisions].sort((a, b) =>
    a.role < b.role ? -1 : a.role > b.role ? 1 : 0,
  );
  for (const decision of ordered) {
    state = reduce(state, { type: "recordDecision", decision });
  }
  return state;
}

export interface MessageTiming {
  messageId: string;
  title: string;
  createdAtSimTime: number;
  deliveredAtSimTime: number | null;
  /** The dead-air gap, or null if never delivered. */
  gapSimTime: number | null;
}

/** Pair message_created with message_delivered to expose the dead-air gap. */
export function messageTimings(scenario: Scenario): MessageTiming[] {
  const created = scenario.events.filter((e) => e.type === "message_created");
  return created.map((c) => {
    const delivered = scenario.events.find(
      (e) => e.type === "message_delivered" && e.linkedTo === c.id,
    );
    return {
      messageId: c.id,
      title: c.title,
      createdAtSimTime: c.simTime,
      deliveredAtSimTime: delivered ? delivered.simTime : null,
      gapSimTime: delivered ? delivered.simTime - c.simTime : null,
    };
  });
}

export interface DebriefRow {
  role: RecordedDecision["role"];
  optionId: string;
  optionLabel: string;
  recordedAtSimTime: number;
}

export interface Debrief {
  scenarioId: string;
  orderedEvents: SimEvent[];
  messageTimings: MessageTiming[];
  decisions: DebriefRow[];
  discussionPrompts: string[];
}

/**
 * Build the debrief: the full ordered timeline, the message gaps, and each
 * recorded decision with the sim-time it was recorded. Pure function of state.
 */
export function buildDebrief(state: SimState): Debrief {
  const { scenario } = state;
  const decisions: DebriefRow[] = state.decisions.map((d) => {
    const prompt = scenario.decisionPrompts[d.role];
    const option = prompt?.options.find((o) => o.id === d.optionId);
    return {
      role: d.role,
      optionId: d.optionId,
      optionLabel: option ? option.label : d.optionId,
      recordedAtSimTime: d.recordedAtSimTime,
    };
  });
  return {
    scenarioId: scenario.id,
    orderedEvents: orderEvents(scenario.events),
    messageTimings: messageTimings(scenario),
    decisions,
    discussionPrompts: scenario.discussionPrompts,
  };
}
