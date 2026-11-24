/**
 * Teleprinter: every received line is shown at once, with its airtime as a mono
 * number. No character-by-character animation (design language: state changes
 * are instant). Losses are text in the accent colour and are never hidden.
 */
import { estimateAirtimeSeconds } from "./composer";
import { toPrintLine } from "./garbled";
import type { PrintGlyph, TransportEvent } from "../../shell/types";

/** A transport outcome, plus the byte positions reported undecodable, if known. */
export type BoothEvent = TransportEvent & { undecodable?: readonly number[] };

export const GARBLED_LINE = "A message arrived but could not be read.";
export const COLLISION_LINE = "Collision: both messages were lost.";

export interface TeleprinterProps {
  events: readonly BoothEvent[];
}

/** Group glyphs into runs of readable text and single marked glyphs. */
function runs(glyphs: readonly PrintGlyph[]): { text: string; lost: boolean }[] {
  const out: { text: string; lost: boolean }[] = [];
  for (const g of glyphs) {
    const lost = g.garbled || g.invalid;
    const last = out[out.length - 1];
    if (last && !lost && !last.lost) last.text += g.ch;
    else out.push({ text: g.ch, lost });
  }
  return out;
}

function Line({ event }: { event: BoothEvent }) {
  if (event.kind === "collision") {
    return <p className="booth-line booth-loss">{COLLISION_LINE}</p>;
  }
  if (!event.payload) {
    // A garbled event carries no payload and no positions: say so, never hide it.
    return <p className="booth-line booth-loss">{GARBLED_LINE}</p>;
  }
  const line = toPrintLine(event.payload, event.undecodable ?? []);
  const airtime = estimateAirtimeSeconds(event.payload.length).toFixed(2);
  return (
    <>
      <p className="booth-line booth-text">
        {runs(line.glyphs).map((r, i) =>
          r.lost ? (
            <span key={i} className="booth-loss">
              {r.text}
            </span>
          ) : (
            r.text
          ),
        )}
      </p>
      <p className="booth-meta">
        <span className="booth-num">{airtime} s on air.</span> {line.label}
      </p>
    </>
  );
}

export function Teleprinter({ events }: TeleprinterProps) {
  return (
    <section className="booth-printer" aria-label="Teleprinter">
      {events.length === 0 ? (
        <p className="booth-meta">Nothing has arrived yet.</p>
      ) : (
        <ol className="booth-lines">
          {events.map((e, i) => (
            <li key={i} className="booth-entry">
              <p className="booth-from">From {e.sender}</p>
              <Line event={e} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
