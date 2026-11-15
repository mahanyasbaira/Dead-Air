// Pure engine types. No React, no DOM, no I/O.
// Everything here is plain data so the simulation can be replayed deterministically.

export type RoleId = "dispatch" | "field";

/** Who a piece of information is visible to. "all" means both roles + facilitator. */
export type Audience = RoleId | "all";

export interface Role {
  id: RoleId;
  /** Fictional label shown in the UI. */
  name: string;
  /** Plain-text description of what this role is responsible for. */
  blurb: string;
}

/**
 * Kinds of scripted events on the shared timeline.
 * - info:     a piece of information becomes visible to an audience at a sim-time.
 * - message_created: a role composes a message (visible to the sender) at a sim-time.
 * - message_delivered: the same message reaches its recipient at a later sim-time.
 *                      The gap between created and delivered is the "dead air".
 * - decision: a role records one choice at a sim-time.
 * - debrief:  marks the end of the scripted scenario.
 */
export type EventType =
  | "info"
  | "message_created"
  | "message_delivered"
  | "decision"
  | "debrief";

export interface SimEvent {
  /** Stable, human-readable id. Ordering is by (simTime, then this id). */
  id: string;
  type: EventType;
  /** Scripted integer sim-time (e.g. minutes). Deterministic, not wall-clock. */
  simTime: number;
  /** Who can see this event. */
  audience: Audience;
  /** Short title shown in logs. */
  title: string;
  /** Longer fictional body text. */
  body: string;
  /**
   * For message_delivered: the id of the matching message_created event.
   * For decision: the id of the role that made it is in `actor`.
   */
  linkedTo?: string;
  /** For decision events: which role recorded the choice. */
  actor?: RoleId;
}

/** A choice a role can record. Fictional, discussion-only — never real-world advice. */
export interface DecisionOption {
  id: string;
  label: string;
}

export interface Scenario {
  id: string;
  title: string;
  /** Always shown; reinforces that this is fictional. */
  simulationNotice: string;
  summary: string;
  roles: Role[];
  /** The scripted, ordered timeline. This is the single source of truth. */
  events: SimEvent[];
  /** The one decision each role is asked to record in this slice. */
  decisionPrompts: Record<RoleId, { prompt: string; options: DecisionOption[] }>;
  /** Facilitator discussion prompts for the debrief. Not safety advice. */
  discussionPrompts: string[];
}

/** A decision actually recorded by a participant during a play-through. */
export interface RecordedDecision {
  role: RoleId;
  optionId: string;
  /** Sim-time at which it was recorded (the sim-time the participant had reached). */
  recordedAtSimTime: number;
}

/** The replayable log: the scripted scenario plus participant decisions. */
export interface PlayLog {
  scenarioId: string;
  decisions: RecordedDecision[];
}

/** Derived state produced by the reducer. Pure function of (scenario, log, cursor). */
export interface SimState {
  scenario: Scenario;
  /** How far along the scripted timeline the play-through has advanced. */
  cursorSimTime: number;
  decisions: RecordedDecision[];
}
