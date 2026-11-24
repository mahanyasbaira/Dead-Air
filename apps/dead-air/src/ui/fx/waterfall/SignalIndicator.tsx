/**
 * Static signal indicator. Draws a bar only when a real measurement exists.
 *
 * No animation, no loop, no transition: nothing moves, so
 * `prefers-reduced-motion` needs no special case. The same sentence is shown
 * as visible text and as the graphic's accessible name; the graphic adds no
 * information of its own. Ink hairlines on paper, no colour (nothing is lost
 * here, so the accent is not used).
 */
import type { ReceiveMetadata } from "../../../transport/acoustic-metadata";
import type { PlayMode } from "../../shell/types";
import { signalIndicator } from "./signal";

export interface SignalIndicatorProps {
  mode: PlayMode;
  /** Metadata of the latest received burst, if acoustic mode has heard one. */
  lastMeasurement?: ReceiveMetadata;
}

const WIDTH = 160;
const HEIGHT = 16;

export function SignalIndicator({ mode, lastMeasurement }: SignalIndicatorProps) {
  const model = signalIndicator(mode, lastMeasurement);
  if (model.kind === "unavailable") {
    return <p className="signal-indicator">{model.text}</p>;
  }
  return (
    <p className="signal-indicator">
      <svg
        role="img"
        aria-label={model.text}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ verticalAlign: "middle", marginRight: 8 }}
      >
        <rect x={0.5} y={0.5} width={WIDTH - 1} height={HEIGHT - 1} fill="none" stroke="currentColor" strokeWidth={1} />
        <rect x={1} y={1} width={(WIDTH - 2) * model.bar} height={HEIGHT - 2} fill="currentColor" />
      </svg>
      <span style={{ fontFamily: "var(--mono, 'IBM Plex Mono', monospace)", fontVariantNumeric: "tabular-nums" }}>
        {model.text}
      </span>
    </p>
  );
}
