/**
 * UI-only models for the consoles (consoles design, "Data Models").
 *
 * Engine types come from the kit (`hindsight`) and transport types from
 * `../../transport/types`; both are re-exported here, never redefined, so the
 * import chain stays one-way: ui -> transport -> engine.
 */
import type { RecordedDecision } from "hindsight";
import type { TransportEvent } from "../../transport/types";

export type {
  Scenario,
  SimEvent,
  SimState,
  RecordedDecision,
  RoleId,
} from "hindsight";
export type {
  Transport,
  TransportEvent,
  TransportFrame,
  TransportMode,
  TransportStatus,
} from "../../transport/types";

/**
 * Which link the Shell is driving (Req 1.1). "solo" runs on the scripted
 * transport, "loopback" is two tabs, "acoustic" is two devices by sound.
 * `selectTransport` returns "acoustic" or "scripted"; "scripted" maps to "solo".
 */
export type PlayMode = "solo" | "loopback" | "acoustic";

/** Carrier lamp state shown on the Booth (Req 2.1). */
export type CarrierState = "IDLE" | "SENDING" | "RECEIVING" | "COLLISION";

/**
 * A message put on the line. `id` is stable and matches the `id` of the outcome
 * that later reports what became of it. `bytes` is the payload length; the text
 * is not kept.
 */
export interface SendRecord {
  id: string;
  sender: string;
  recipient: string;
  sendTime: number;
  bytes: number;
  /**
   * Sim-time units the send occupied the line, when the transport knows it.
   * Optional: a save from before this field existed has none, and a send whose
   * airtime was not measured leaves it out. Never written as 0 for "unknown".
   */
  airtime?: number;
}

/**
 * One entry of the append-only log the Shell persists: a wire outcome
 * (exactly a TransportEvent), a recorded decision, or a send. A send changes no
 * engine state; it exists so the replay can show time in transit and messages
 * that never arrived.
 */
export type ConsoleLogEntry =
  | { kind: "wire"; event: TransportEvent }
  | { kind: "decision"; decision: RecordedDecision }
  | { kind: "send"; send: SendRecord };

/** A run as written to local storage (Req 6.1). */
export interface PersistedRun {
  version: 1;
  scenarioId: string;
  seed: number;
  mode: PlayMode;
  /** Append-only; never rewritten, only grown. */
  log: ConsoleLogEntry[];
}

/**
 * One printed character of a received payload (consoles Req 2.3).
 * `[byteStart, byteStart + byteLength)` is the payload bytes it stands for.
 */
export interface PrintGlyph {
  /** The decoded character, or a marker glyph when it could not be read. */
  ch: string;
  /** A byte in this glyph was reported undecodable (channel damage). */
  garbled: boolean;
  /** Intact bytes that are not valid UTF-8 (a different cause from damage). */
  invalid: boolean;
  /** Index of the glyph's first payload byte. */
  byteStart: number;
  /** Number of payload bytes the glyph covers (at least 1). */
  byteLength: number;
}

/**
 * A line to print on the Booth teleprinter (Req 2.3). Glyph byte spans tile
 * the payload exactly, in order: every byte belongs to exactly one glyph.
 */
export interface PrintLine {
  /** One glyph per decoded code point or per unreadable run of bytes. */
  glyphs: PrintGlyph[];
  /** Accessible summary, e.g. "12 characters, 1 could not be read." */
  label: string;
}
/** Live composer budget shown as the player types (Req 2.2). */
export interface ComposerBudget {
  /** UTF-8 encoded length. */
  usedBytes: number;
  /** 64 - usedBytes, clamped at 0. */
  remainingBytes: number;
  estimatedAirtime: number;
  /** usedBytes > 64. */
  overLimit: boolean;
}
