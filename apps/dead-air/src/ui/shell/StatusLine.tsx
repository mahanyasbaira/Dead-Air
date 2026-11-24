/**
 * StatusLine: the one polite live region. It shows the text twin of every sound
 * (strings from `statusText`, taken as they are) and of every lamp state
 * (`carrierText`).
 *
 * How messages are shown: a short visible history, the newest `HISTORY` lines.
 * The region uses aria-atomic="false" and aria-relevant="additions", so a screen
 * reader announces only a line that was just added, never the whole list again.
 * Each line carries a caller-supplied `key` (an injected counter, not a clock),
 * so a repeated text such as two "Chirp: message received." in a row is a new
 * node and is announced again, and several lines added in one update are queued
 * rather than the earlier ones being overwritten. A latest-only display would
 * lose the earlier line when two updates land together. Older lines stay on the
 * page as plain text for sighted readers; they are never re-announced.
 */
import type { CarrierState } from "./types";
import "./status-line.css";

export interface StatusMessage {
  /** Unique, increasing. Supplied by the owner of the log; never a timestamp. */
  readonly key: number;
  readonly text: string;
  /** True only when something was lost. Draws the accent colour. */
  readonly loss?: boolean;
}

export interface StatusLineProps {
  readonly messages: readonly StatusMessage[];
}

export const HISTORY = 3;

const CARRIER_TEXT: Readonly<Record<CarrierState, string>> = {
  IDLE: "Carrier idle.",
  SENDING: "Carrier sending.",
  RECEIVING: "Carrier receiving.",
  COLLISION: "Collision: both messages lost.",
};

/** The text twin of a carrier lamp state. */
export function carrierText(state: CarrierState): string {
  return CARRIER_TEXT[state];
}

/** Only a collision loses anything. */
export function isLossState(state: CarrierState): boolean {
  return state === "COLLISION";
}

export function StatusLine({ messages }: StatusLineProps) {
  const shown = messages.slice(-HISTORY);
  return (
    <div
      className="status-line"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {shown.map((m, i) => (
        <p
          key={m.key}
          className={
            "status-line-item" +
            (m.loss ? " status-line-loss" : "") +
            (i < shown.length - 1 ? " status-line-old" : "")
          }
        >
          {m.text}
        </p>
      ))}
    </div>
  );
}
