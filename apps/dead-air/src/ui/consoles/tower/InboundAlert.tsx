/**
 * InboundAlert: on each arrival, one cue (the existing "received" chirp, played
 * by whoever owns audio), one lamp state, one visible text line.
 *
 * No Web Audio here: the cue goes out through `onCue`. The line carries the
 * chirp's text twin from `statusText`. It is plain text, not a live region, so
 * the Shell's StatusLine stays the only announcer.
 *
 * The lamp is words plus weight and line style. Only loss uses the accent.
 * A restored run (events present at mount) does not cue.
 */
import { useEffect, useRef } from "react";
import { statusText, type Sound } from "../../fx/audio";
import { carrierText } from "../../shell/StatusLine";
import { UNREADABLE_LINE } from "./PagerDisplay";
import type { LampState, Outcome } from "./types";

const RECEIVED_CHIRP: Sound = { kind: "chirp", direction: "received" };

export interface InboundAlertProps {
  readonly outcomes: readonly Outcome[];
  /** Number of outcomes the reader has acknowledged; the lamp clears when it catches up. */
  readonly acknowledged: number;
  readonly onCue?: (sound: Sound) => void;
}

export function lampFor(outcomes: readonly Outcome[], acknowledged: number): LampState {
  const unseen = outcomes.slice(acknowledged);
  if (unseen.length === 0) return "idle";
  return unseen.some((o) => o.kind === "collision") ? "lost" : "new";
}

const LAMP_TEXT: Record<LampState, string> = {
  idle: "Lamp: off.",
  new: "Lamp: lit, new message.",
  lost: "Lamp: lit, something was lost.",
};

function alertLine(o: Outcome | undefined): string {
  if (!o) return "Nothing new.";
  if (o.kind === "collision") return carrierText("COLLISION");
  const twin = statusText(RECEIVED_CHIRP);
  return o.kind === "garbled"
    ? `${twin} ${UNREADABLE_LINE}`
    : `${twin} New message from ${o.sender}.`;
}

export function InboundAlert({ outcomes, acknowledged, onCue }: InboundAlertProps) {
  const seen = useRef(outcomes.length);
  const cue = useRef(onCue);
  cue.current = onCue;

  useEffect(() => {
    for (let i = seen.current; i < outcomes.length; i++) {
      if (outcomes[i].kind !== "collision") cue.current?.(RECEIVED_CHIRP);
    }
    seen.current = outcomes.length;
  }, [outcomes]);

  const lamp = lampFor(outcomes, acknowledged);
  const latest = outcomes[outcomes.length - 1];
  return (
    <div className="tower-alert">
      <p className={`tower-lamp tower-lamp-${lamp}`}>{LAMP_TEXT[lamp]}</p>
      <p className={"tower-line" + (latest?.kind === "garbled" || latest?.kind === "collision" ? " tower-lost" : "")}>
        {alertLine(latest)}
      </p>
    </div>
  );
}
