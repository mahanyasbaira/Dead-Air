/**
 * Pure model for the signal indicator (consoles task 7.2).
 *
 * The only real measurement the app has is the acoustic transport's per-burst
 * metadata. Solo and loopback have none, so they report "unavailable" and
 * nothing is synthesised.
 */
import type { ReceiveMetadata } from "../../../transport/acoustic-metadata";
import type { PlayMode } from "../../shell/types";

/** Quietest level drawn on the bar, in dBFS. Anything below draws an empty bar. */
export const BAR_MIN_DBFS = -60;
/** Loudest level drawn on the bar, in dBFS. Anything above draws a full bar. */
export const BAR_MAX_DBFS = 0;

/** Text when the mode has no measurement at all. */
export const TEXT_NOT_MEASURED = "Signal level: not measured in this mode.";
/** Text when acoustic mode has not yet heard a burst. */
export const TEXT_NO_MESSAGE = "Signal level: no message heard yet.";

export interface SignalUnavailable {
  kind: "unavailable";
  text: string;
}

export interface SignalMeasured {
  kind: "measured";
  dbfs: number;
  rms: number;
  peak: number;
  airtimeMs: number;
  text: string;
  /** Fraction 0..1 of the {@link BAR_MIN_DBFS} to {@link BAR_MAX_DBFS} range, clamped. */
  bar: number;
}

export type SignalIndicatorModel = SignalUnavailable | SignalMeasured;

function barFraction(dbfs: number): number {
  if (!Number.isFinite(dbfs)) return 0;
  const f = (dbfs - BAR_MIN_DBFS) / (BAR_MAX_DBFS - BAR_MIN_DBFS);
  return Math.min(1, Math.max(0, f));
}

/** Format with a true minus sign so negative levels read cleanly. */
function formatDbfs(dbfs: number): string {
  const n = Math.round(Number.isFinite(dbfs) ? dbfs : -120);
  return n < 0 ? `\u2212${Math.abs(n)}` : String(n);
}

/**
 * What the indicator should show. Only acoustic mode with a burst heard is
 * measured; every other case says plainly that there is no level to show.
 */
export function signalIndicator(
  mode: PlayMode,
  lastMeasurement?: ReceiveMetadata,
): SignalIndicatorModel {
  if (mode !== "acoustic") return { kind: "unavailable", text: TEXT_NOT_MEASURED };
  if (!lastMeasurement) return { kind: "unavailable", text: TEXT_NO_MESSAGE };
  const { dbfs, rms, peak, airtimeMs } = lastMeasurement;
  return {
    kind: "measured",
    dbfs,
    rms,
    peak,
    airtimeMs,
    text: `Last message: ${formatDbfs(dbfs)} dBFS, ${formatMs(airtimeMs)} ms.`,
    bar: barFraction(dbfs),
  };
}

function formatMs(ms: number): string {
  return String(Math.round(Number.isFinite(ms) && ms > 0 ? ms : 0));
}
