/**
 * TowerConsole: the pager (consoles Req 3.1, 3.2). Where the Booth is a
 * teleprinter with one running page, the Tower is a small fixed display with
 * three keys, a short list of codes and a bounded history.
 *
 * `events` are the wire outcomes already visible to this role (the Shell
 * filters them). Messages go out through `onSend`; sounds go out through
 * `onCue`. The Tower creates no audio and holds no transport.
 */
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { Sound } from "../../fx/audio";
import { buildPayload, composerBudget } from "../booth/composer";
import { toPrintLine } from "../booth/garbled";
import type { TransportEvent } from "../../shell/types";
import { foldHistory } from "./history";
import { InboundAlert } from "./InboundAlert";
import { PagerDisplay } from "./PagerDisplay";
import { PagerKeys } from "./PagerKeys";
import type { CannedCode, HistoryItem, Outcome } from "./types";
import "./tower.css";

export const DEFAULT_CODES: readonly CannedCode[] = [
  { id: "ack", label: "Received", text: "Received." },
  { id: "again", label: "Say again", text: "Say again." },
  { id: "standby", label: "Stand by", text: "Stand by." },
  { id: "decide", label: "Need a decision", text: "Need a decision." },
];

const over = (n: number): string => `${n} ${n === 1 ? "byte" : "bytes"}`;

export interface TowerConsoleProps {
  readonly events: readonly TransportEvent[];
  readonly onSend: (text: string, payload: Uint8Array) => void;
  readonly onCue?: (sound: Sound) => void;
  readonly codes?: readonly CannedCode[];
}

export function TowerConsole({ events, onSend, onCue, codes = DEFAULT_CODES }: TowerConsoleProps) {
  const ids = useId();
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(events.length);

  const outcomes = useMemo<Outcome[]>(
    () =>
      events.map((e, id) => ({
        id,
        kind: e.kind,
        sender: e.sender,
        ...(e.payload ? { payload: e.payload } : {}),
      })),
    [events],
  );

  const history = useMemo<HistoryItem[]>(
    () =>
      outcomes
        .filter((o) => o.kind !== "collision")
        .reduce<HistoryItem[]>(
          (h, o) =>
            foldHistory(h, {
              id: o.id,
              sender: o.sender,
              line: o.kind === "received" && o.payload ? toPrintLine(o.payload) : null,
            }),
          [],
        ),
    [outcomes],
  );

  const budget = composerBudget(text);
  const ack = () => setAcknowledged(outcomes.length);
  const move = (d: number) => {
    ack();
    setSelected((s) => Math.min(codes.length - 1, Math.max(0, s + d)));
  };

  function send() {
    ack();
    const free = text.trim();
    if (free !== "") {
      if (budget.overLimit) {
        setSent(null);
        setBlocked(`Not sent: ${over(budget.usedBytes - 64)} over the 64-byte limit. Shorten the text.`);
        return;
      }
      setBlocked(null);
      onSend(free, buildPayload(free));
      setSent(`Sent: ${free}`);
      setText("");
      return;
    }
    const code = codes[selected];
    if (!code) return;
    setBlocked(null);
    onSend(code.text, buildPayload(code.text));
    setSent(`Sent: ${code.label}`);
  }

  function onListKey(e: KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="tower" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="tower-title">Tower</h2>
      <InboundAlert outcomes={outcomes} acknowledged={acknowledged} onCue={onCue} />
      <div onFocus={ack}>
        <PagerDisplay history={history} />
      </div>
      <PagerKeys onUp={() => move(-1)} onDown={() => move(1)} onSend={send} />
      <section className="tower-compose" aria-label="Compose">
        <h3 className="tower-h">Canned codes</h3>
        <ul
          className="tower-codes"
          role="listbox"
          aria-label="Canned codes"
          tabIndex={0}
          aria-activedescendant={`${ids}-${selected}`}
          onKeyDown={onListKey}
        >
          {codes.map((c, i) => (
            <li
              key={c.id}
              id={`${ids}-${i}`}
              role="option"
              aria-selected={i === selected}
              className={"tower-code" + (i === selected ? " tower-code-on" : "")}
              onClick={() => setSelected(i)}
            >
              {c.label}
            </li>
          ))}
        </ul>
        <label className="tower-h" htmlFor={`${ids}-free`}>
          Free text
        </label>
        <input
          id={`${ids}-free`}
          className="tower-input"
          type="text"
          value={text}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setBlocked(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <p className="tower-meta">
          {budget.overLimit
            ? `${over(budget.usedBytes - 64)} over the limit.`
            : `${budget.remainingBytes} bytes left.`}{" "}
          Airtime {budget.estimatedAirtime.toFixed(1)} s. Send transmits the free text, or the
          selected code when the text is empty.
        </p>
        {blocked ? <p className="tower-lost tower-block">{blocked}</p> : null}
        {sent ? <p className="tower-meta">{sent}</p> : null}
      </section>
    </section>
  );
}
