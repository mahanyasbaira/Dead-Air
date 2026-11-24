/**
 * PagerDisplay: the newest message, and a scrollable history of the last 8
 * (consoles Req 3.2). Received text is shown readable (UTF-8 decoded); damaged
 * characters keep the Booth's marker and a "could not be read" count.
 */
import type { PrintLine } from "../../shell/types";
import type { HistoryItem } from "./types";

export const UNREADABLE_LINE = "Message could not be read.";

/** Contiguous readable glyphs share one text node; marked glyphs get their own span. */
function Line({ line }: { line: PrintLine }) {
  const parts: { text: string; marked: boolean }[] = [];
  for (const g of line.glyphs) {
    const marked = g.garbled || g.invalid;
    const last = parts[parts.length - 1];
    if (last && last.marked === marked && !marked) last.text += g.ch;
    else parts.push({ text: g.ch, marked });
  }
  const unreadable = line.glyphs.some((g) => g.garbled || g.invalid);
  return (
    <>
      <span className="tower-text">
        {parts.map((p, i) =>
          p.marked ? (
            <span key={i} className="tower-mark">
              {p.text}
            </span>
          ) : (
            p.text
          ),
        )}
      </span>
      {unreadable ? <span className="tower-note">{line.label}</span> : null}
    </>
  );
}

function Body({ item }: { item: HistoryItem }) {
  if (item.line === null) {
    return (
      <>
        <span className="tower-text tower-lost">{UNREADABLE_LINE}</span>
      </>
    );
  }
  return <Line line={item.line} />;
}

export interface PagerDisplayProps {
  readonly history: readonly HistoryItem[];
}

export function PagerDisplay({ history }: PagerDisplayProps) {
  const current = history[history.length - 1];
  return (
    <div className="tower-display">
      <section className="tower-current" aria-label="Current message">
        <h3 className="tower-h">Current message</h3>
        {current ? (
          <p className="tower-row">
            <span className="tower-from">From {current.sender}</span>
            <Body item={current} />
          </p>
        ) : (
          <p className="tower-empty">No message yet.</p>
        )}
      </section>
      <section className="tower-hist" aria-label="Message history" tabIndex={0}>
        <h3 className="tower-h">History, last {history.length === 0 ? "messages" : history.length}</h3>
        {history.length === 0 ? (
          <p className="tower-empty">Nothing received.</p>
        ) : (
          <ol className="tower-list" aria-label="Received messages, oldest first">
            {history.map((h) => (
              <li key={h.id} className="tower-row">
                <span className="tower-from">From {h.sender}</span>
                <Body item={h} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
