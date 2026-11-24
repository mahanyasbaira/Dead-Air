// Types for the worldline layout. Plain data only: no React, no DOM.
import type { ParticipantId, Scenario } from "../engine/types";
import type { Ledger } from "../ledger/ledger";

/**
 * "complete": every send by this participant is in the ledger, so a send with no
 * outcome really never arrived.
 * "arrivals-only": only what reached someone is known. Send times and losses on
 * the way from this participant are not in the log.
 */
export type HistoryKnowledge = "complete" | "arrivals-only";

export interface ReplayParticipant {
  id: ParticipantId;
  label: string;
  /** "role" is a person who decides; "source" only sends. Default "role". */
  kind?: "role" | "source";
  /** Default "complete". */
  history?: HistoryKnowledge;
  /** Optional sentence saying why the history is missing. */
  limitNote?: string;
}

export interface WorldlineInput {
  ledger: Ledger;
  scenario: Scenario;
  /** Default: `scenario.roles` as complete roles, then senders found in the ledger. */
  participants?: readonly ReplayParticipant[];
  /** Optional id -> label for facts and messages. */
  names?: Readonly<Record<string, string>>;
}

export interface LayoutOptions {
  /** Cursor in sim-time. null, or at or past the last event, means the closed record. */
  at?: number | null;
  /** With a cursor, tones follow what this participant knew at that time. */
  focus?: ParticipantId | null;
  /** Lay out the record as it would have been on a line that loses and delays nothing. */
  clearLine?: boolean;
}

export const VIEW = {
  width: 840,
  height: 560,
  top: 56,
  bottom: 24,
  left: 64,
  right: 24,
  gap: 12,
  stub: 32,
  minLabelGap: 16,
} as const;

export type Fate = "received" | "garbled" | "collision" | "never-arrived" | "in-transit";
export type Tone = "ink" | "loss" | "faded";

export interface ParticipantStyle {
  strokeWidth: number;
  labelWeight: 400 | 500;
  /** SVG stroke-dasharray; "" is solid. */
  dash: string;
  colour: "ink" | "grey-1";
}

export interface Worldline {
  id: ParticipantId;
  label: string;
  kind: "role" | "source";
  history: HistoryKnowledge;
  x: number;
  yTop: number;
  yBottom: number;
  style: ParticipantStyle;
  /** Decisions, facts, arrival marks to this line and signals from or to it. */
  marks: number;
}

export interface Signal {
  id: string;
  from: ParticipantId;
  to: ParticipantId;
  /** y2 is clipped to the cursor while the signal is open. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fate: Fate;
  sentAt: number;
  arrivedAt: number | null;
  /** True when the vertical span is the delay. False for stubs and for cut lines. */
  spanIsDelay: boolean;
  /** Ends at the cursor, not at an arrival. */
  open: boolean;
  tone: Tone;
  dotted: boolean;
}

/** Something arrived and its send time is not known: a tick on the receiver's line. */
export interface ArrivalMark {
  id: string;
  from: ParticipantId;
  to: ParticipantId;
  /** On the receiver's line. */
  x: number;
  y: number;
  /** Signed tick length, pointing toward the sender's side. */
  dx: number;
  arrivedAt: number;
  outcome: "received" | "garbled" | "collision";
  tone: Tone;
  dotted: boolean;
}

export interface KnowledgeMark {
  id: string;
  participant: ParticipantId;
  x: number;
  y: number;
  simTime: number;
  label: string;
  tone: Tone;
}

export interface DecisionNode {
  id: string;
  actor: ParticipantId;
  simTime: number;
  x: number;
  y: number;
  side: "left" | "right";
  labelX: number;
  labelY: number;
  label: string;
  selected: boolean;
}

export interface KnowledgeLimit {
  participants: ParticipantId[];
  text: string;
}

export interface LegendKey {
  id: "signal" | "lost" | "arrival" | "decision" | "fact";
  text: string;
}

export interface TimeAxis {
  start: number;
  end: number;
  top: number;
  bottom: number;
  ticks: readonly number[];
}

export interface WorldlineLayout {
  view: { width: number; height: number };
  time: TimeAxis;
  lines: readonly Worldline[];
  signals: readonly Signal[];
  arrivals: readonly ArrivalMark[];
  knowledge: readonly KnowledgeMark[];
  decisions: readonly DecisionNode[];
  limits: readonly KnowledgeLimit[];
  legend: readonly LegendKey[];
  /** Message ids left out of the geometry because the log contradicts itself. */
  skipped: readonly string[];
}
