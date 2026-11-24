// The replay view: draws the worldline layout as one SVG, with the key and the
// knowledge limit under it and the same facts as plain sentences below.
// SVG only. All text is real <text>, so it stays selectable and prints.
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { Scenario } from "../engine/types";
import { gainAt } from "../ledger/clear-line";
import { computeHabits } from "../ledger/habits";
import type { HabitOptions } from "../ledger/habits";
import { HabitsTable } from "./HabitsTable";
import type { Ledger } from "../ledger/ledger";
import { layoutWorldlines, timeToY } from "./worldlines";
import { momentSentences } from "./moment";
import { summarise } from "./summary";
import { timelineText } from "./timeline";
import type { ReplayParticipant, Tone, Worldline } from "./types";
export interface ReplayViewProps {
  ledger: Ledger;
  scenario: Scenario;
  /** Who is on the page and what the log holds for each. Default: the scenario roles. */
  participants?: readonly ReplayParticipant[];
  /** Optional id -> readable name for facts and messages. */
  names?: Readonly<Record<string, string>>;
  /** Formats a sim-time for labels and sentences. Default: `String`. */
  formatTime?: (t: number) => string;
  /** Cursor in sim-time. null or absent shows the closed record. */
  at?: number | null;
  /** Optional sections. Each defaults to on. */
  sections?: { counterfactual?: boolean; prompts?: boolean; summary?: boolean; habits?: boolean };
  /** Passed to the habits computation. Only used when `sections.habits` is on. */
  habitOptions?: HabitOptions;
  /** A ready-made link to this replay. The kit never builds it. A "Copy link" button shows only when given. */
  shareUrl?: string;
}

/** Copies text with the clipboard when there is one; calls `setFallback(true)` when it cannot. */
function copyText(text: string, setFallback: (v: boolean) => void): void {
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clip === undefined || typeof clip.writeText !== "function") return setFallback(true);
  clip.writeText(text).then(
    () => setFallback(false),
    () => setFallback(true),
  );
}
const SANS = 'var(--sans, "IBM Plex Sans", system-ui, sans-serif)';
const MONO = 'var(--mono, "IBM Plex Mono", ui-monospace, monospace)';
const DOTS = "2 3";
const FONT_SIZE = 13;
/**
 * Colours are custom properties with the light values as fallbacks, so an app's
 * dark appearance applies without the kit knowing about it. Opacity is the only
 * thing that changes over time. The print block pins the light values on the
 * view (paper is white and the app's dark tokens would print pale text), draws
 * loss in ink, dotted, and keeps the figure on one page.
 */
const STYLE = `
.hs-replay { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; row-gap: 16px; }
.hs-main { grid-column: span 8; min-width: 0; }
.hs-side { grid-column: span 4; min-width: 0; font-size: 15px; line-height: 24px; }
.hs-side p { margin: 0 0 8px; max-width: 62ch; }
.hs-wide { grid-column: 1 / -1; }
@media (max-width: 720px) { .hs-main, .hs-side { grid-column: 1 / -1; } }
.hs-scrub { margin-top: 16px; font-size: 15px; line-height: 24px; }
.hs-scrub label { display: block; color: var(--grey-1, #6B6861); font-size: 13px; }
.hs-scrub input { display: block; width: 100%; margin: 8px 0; accent-color: var(--ink, #1A1916); }
.hs-scrub input:focus-visible { outline: 2px solid var(--ink, #1A1916); outline-offset: 2px; }
.hs-scrub p { margin: 0; font-family: ${MONO}; font-size: 13px; }
.hs-node-selected { fill: var(--paper, #F5F2EA); stroke: var(--ink, #1A1916); stroke-width: 2; }
.hs-decision { cursor: pointer; }
.hs-figure { margin: 0; }
.hs-figure svg { display: block; width: 100%; height: auto; overflow: visible; }
.hs-figure text { user-select: text; font-size: ${FONT_SIZE}px; }
.hs-ink { stroke: var(--ink, #1A1916); }
.hs-loss { stroke: var(--loss, #9A3B26); }
.hs-faded { stroke: var(--grey-3, #DDD9CF); }
.hs-ink, .hs-loss, .hs-faded { transition: opacity 120ms linear; }
.hs-side { transition: opacity 120ms linear; }
.hs-line-ink { stroke: var(--ink, #1A1916); }
.hs-line-grey { stroke: var(--grey-1, #6B6861); }
.hs-leader, .hs-axis { stroke: var(--grey-2, #A9A59B); stroke-width: 1; }
.hs-node { fill: var(--ink, #1A1916); }
.hs-fact { fill: var(--paper, #F5F2EA); stroke-width: 1.5; }
.hs-label { fill: var(--ink, #1A1916); font-family: ${SANS}; }
.hs-time { fill: var(--grey-1, #6B6861); font-family: ${MONO}; }
.hs-figure [tabindex]:focus-visible { outline: 2px solid var(--ink, #1A1916); outline-offset: 2px; }
.hs-figure figcaption { max-width: 62ch; margin-top: 8px; font-size: 13px; line-height: 24px; color: var(--grey-1, #6B6861); }
.hs-figure figcaption p { margin: 0; }
.hs-clear { margin-top: 16px; }
.hs-clear button { font: inherit; font-size: 15px; padding: 4px 12px; color: var(--ink, #1A1916); background: var(--paper, #F5F2EA); border: 1px solid var(--ink, #1A1916); cursor: pointer; }
.hs-clear button[aria-pressed="true"] { background: var(--ink, #1A1916); color: var(--paper, #F5F2EA); }
.hs-clear button:focus-visible { outline: 2px solid var(--ink, #1A1916); outline-offset: 2px; }
.hs-gains { margin: 8px 0 0; padding-left: 0; list-style: none; max-width: 62ch; font-size: 15px; line-height: 24px; }
.hs-gains li { margin: 0 0 8px; }
.hs-gains .hs-gain-head { display: block; font-family: ${MONO}; font-size: 13px; color: var(--grey-1, #6B6861); }
.hs-timeline { margin-top: 16px; }
.hs-timeline summary { cursor: pointer; font-size: 15px; }
.hs-timeline ol { max-width: 62ch; margin: 8px 0 0; padding-left: 24px; font-size: 15px; line-height: 24px; }
.hs-facilitate h3 { margin: 0 0 8px; font-size: 15px; font-weight: 500; }
.hs-facilitate p, .hs-facilitate ul { max-width: 62ch; margin: 0 0 8px; font-size: 15px; line-height: 24px; }
.hs-facilitate ul { padding-left: 24px; }
.hs-facilitate button { font: inherit; font-size: 15px; padding: 4px 12px; color: var(--ink, #1A1916); background: var(--paper, #F5F2EA); border: 1px solid var(--ink, #1A1916); cursor: pointer; }
.hs-facilitate button:focus-visible, .hs-facilitate textarea:focus-visible { outline: 2px solid var(--ink, #1A1916); outline-offset: 2px; }
.hs-facilitate textarea { display: block; box-sizing: border-box; width: 100%; max-width: 62ch; margin-top: 8px; font: inherit; font-size: 15px; line-height: 24px; color: var(--ink, #1A1916); background: var(--paper, #F5F2EA); border: 1px solid var(--grey-1, #6B6861); }
.hs-habits-wrap { overflow-x: auto; }
.hs-habits { border-collapse: collapse; font-size: 15px; line-height: 24px; }
.hs-habits caption { text-align: left; max-width: 62ch; padding-bottom: 8px; }
.hs-habits th, .hs-habits td { text-align: left; vertical-align: top; padding: 4px 12px 4px 0; font-weight: 400; }
.hs-habits thead th { border-bottom: 1px solid var(--ink, #1A1916); }
.hs-habits .hs-habit-why { display: block; max-width: 24ch; font-size: 13px; line-height: 20px; }
@media print {
  .hs-replay { --paper: #F5F2EA; --ink: #1A1916; --grey-1: #6B6861; --grey-2: #A9A59B; --grey-3: #DDD9CF; --loss: #9A3B26; }
  .hs-facilitate button, .hs-facilitate textarea { display: none; }
  .hs-figure { break-inside: avoid; page-break-inside: avoid; }
  .hs-figure svg { max-height: 9in; }
  .hs-loss { stroke: var(--ink, #1A1916); stroke-dasharray: ${DOTS}; }
  .hs-faded { stroke: var(--grey-2, #A9A59B); }
}
@media (prefers-reduced-motion: reduce) {
  .hs-ink, .hs-loss, .hs-faded, .hs-side { transition: none; }
}
`;
const TONE_CLASS: Record<Tone, string> = { ink: "hs-ink", loss: "hs-loss", faded: "hs-faded" };
function lineClass(line: Worldline): string {
  return line.style.colour === "ink" ? "hs-line-ink" : "hs-line-grey";
}
export function ReplayView({ ledger, scenario, participants, names, formatTime, at: initialAt, sections, shareUrl, habitOptions }: ReplayViewProps): ReactElement {
  const [at, setAt] = useState<number | null>(initialAt ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clearOn, setClearOn] = useState(false);
  const showCounterfactual = sections?.counterfactual !== false;
  const showPrompts = sections?.prompts !== false;
  const showSummary = sections?.summary !== false;
  const showHabits = sections?.habits === true;
  const [fallback, setFallback] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const [linkFallback, setLinkFallback] = useState(false);
  const linkFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const input = useMemo(
    () => ({
      ledger,
      scenario,
      ...(participants === undefined ? {} : { participants }),
      ...(names === undefined ? {} : { names }),
    }),
    [ledger, scenario, participants, names],
  );
  const layout = useMemo(() => layoutWorldlines(input, { at, focus, clearLine: showCounterfactual && clearOn }),
    [input, at, focus, showCounterfactual, clearOn],);
  const format = formatTime ?? String;
  const entries = useMemo(() => timelineText(layout, names, format), [layout, names, format]);
  const ordered = useMemo(() => [...layout.decisions].sort((a, b) => a.simTime - b.simTime), [layout.decisions]);
  const gains = useMemo(() => {
    if (!showCounterfactual || !clearOn) return [];
    const labelOf = new Map(layout.lines.map((l) => [l.id, l.label]));
    return ordered.map((d) => {
      const ids = gainAt(ledger, d.actor, d.simTime);
      const who = labelOf.get(d.actor) ?? d.actor;
      const text =
        ids.length === 0
          ? "Nothing more would have arrived."
          : `With a clear line, ${who} would also have had: ${ids.map((id) => names?.[id] ?? id).join(", ")}.`;
      return { id: d.id, head: `${format(d.simTime)}, ${d.label}`, text };
    });
  }, [showCounterfactual, clearOn, layout.lines, ordered, ledger, names, format]);
  const habitRows = useMemo(() => {
    if (!showHabits) return [];
    const rows = layout.lines.map((l) => ({ id: l.id, label: l.label, history: l.history }));
    const decisions = layout.decisions.map((d) => ({ actor: d.actor, simTime: d.simTime }));
    return computeHabits(ledger, decisions, rows, habitOptions);
  }, [showHabits, layout.lines, layout.decisions, ledger, habitOptions]);
  const summary = useMemo(() => (showSummary ? summarise(input, format) : ""), [showSummary, input, format]);
  const prompts = showPrompts ? scenario.discussionPrompts.slice(0, 3) : [];
  useEffect(() => {
    if (fallback) fieldRef.current?.select();
  }, [fallback]);
  useEffect(() => {
    if (linkFallback) linkFieldRef.current?.select();
  }, [linkFallback]);
  const copySummary = (): void => copyText(summary, setFallback);
  const copyLink = (): void => {
    if (shareUrl !== undefined) copyText(shareUrl, setLinkFallback);
  };
  const sentences = useMemo(() => {
    if (at === null) return [];
    const who = layout.lines.filter((l) => l.kind === "role" && (focus === null || l.id === focus));
    return who.flatMap((l) => momentSentences(input, l.id, at, format));
  }, [input, layout.lines, at, focus, format]);
  if (layout.lines.length === 0) {
    return (
      <figure className="hs-figure">
        <p>Nothing was recorded.</p>
      </figure>
    );
  }
  const { view, time } = layout;
  const gutter = 64 - 12;
  const clear = (): void => {
    setAt(null);
    setFocus(null);
    setSelectedId(null);
  };
  const toggle = (id: string, actor: string, simTime: number): void => {
    if (selectedId === id) return clear();
    setSelectedId(id);
    setAt(simTime);
    setFocus(actor);
  };
  const onNodeKey = (e: KeyboardEvent<SVGGElement>, id: string, actor: string, simTime: number): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id, actor, simTime);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const i = ordered.findIndex((d) => d.id === id);
      const next = ordered[Math.max(0, Math.min(ordered.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next !== undefined) nodeRefs.current.get(next.id)?.focus();
    }
  };
  const scrubText = at === null ? "End of the record" : `At ${format(at)}`;
  return (
    <div
      className="hs-replay"
      onKeyDown={(e) => {
        if (e.key === "Escape" && (at !== null || selectedId !== null)) clear();
      }}
    >
      <style>{STYLE}</style>
      <div className="hs-main">
    <figure className="hs-figure">
      <svg
        role="group"
        aria-label={`Replay: ${scenario.title}`}
        viewBox={`0 0 ${view.width} ${view.height}`}
        style={{ width: "100%", height: "auto" }}
      >
        <g aria-hidden="true">
          {time.ticks.map((t) => {
            const y = timeToY(time, t);
            return (
              <g key={`t:${t}`}>
                <line className="hs-axis" x1={gutter + 4} x2={gutter + 10} y1={y} y2={y} />
                <text className="hs-time" x={gutter} y={y + 4} textAnchor="end">
                  {format(t)}
                </text>
              </g>
            );
          })}
        </g>
        <g aria-hidden="true">
          {layout.signals.map((s) => (
            <line
              key={`s:${s.id}`}
              className={TONE_CLASS[s.tone]}
              data-fate={s.fate}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              strokeWidth={1.5}
              {...(s.dotted ? { strokeDasharray: DOTS } : {})}
            />
          ))}
          {layout.arrivals.map((a) => (
            <line
              key={`a:${a.id}`}
              className={TONE_CLASS[a.tone]}
              data-outcome={a.outcome}
              x1={a.x}
              y1={a.y}
              x2={a.x + a.dx}
              y2={a.y}
              strokeWidth={1.5}
              {...(a.dotted ? { strokeDasharray: DOTS } : {})}
            />
          ))}
        </g>
        {layout.lines.map((line) => (
          <g
            key={line.id}
            role="group"
            data-participant={line.id}
            aria-label={`${line.label}: ${line.marks} marks`}
          >
            <text
              className="hs-label"
              x={line.x}
              y={line.yTop - 24}
              textAnchor="middle"
              fontWeight={line.style.labelWeight}
            >
              {line.label}
            </text>
            <line
              className={lineClass(line)}
              x1={line.x}
              x2={line.x}
              y1={line.yTop}
              y2={line.yBottom}
              strokeWidth={line.style.strokeWidth}
              {...(line.style.dash === "" ? {} : { strokeDasharray: line.style.dash })}
            />
            {layout.knowledge
              .filter((k) => k.participant === line.id)
              .map((k) => (
                <circle
                  key={`k:${k.id}`}
                  className={`hs-fact ${TONE_CLASS[k.tone]}`}
                  cx={k.x}
                  cy={k.y}
                  r={4}
                >
                  <title>{k.label}</title>
                </circle>
              ))}
            {layout.decisions
              .filter((d) => d.actor === line.id)
              .map((d) => (
                <g
                  key={`d:${d.id}`}
                  className="hs-decision"
                  data-decision={d.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === d.id}
                  aria-label={`${d.label}, ${format(d.simTime)}`}
                  ref={(el) => {
                    if (el === null) nodeRefs.current.delete(d.id);
                    else nodeRefs.current.set(d.id, el);
                  }}
                  onClick={() => toggle(d.id, d.actor, d.simTime)}
                  onKeyDown={(e) => onNodeKey(e, d.id, d.actor, d.simTime)}
                >
                  {Math.abs(d.labelY - d.y) > 2 ? (
                    <line className="hs-leader" x1={d.x} y1={d.y} x2={d.labelX} y2={d.labelY} />
                  ) : null}
                  <rect className={selectedId === d.id ? "hs-node hs-node-selected" : "hs-node"} x={d.x - 4} y={d.y - 6} width={8} height={12} />
                  <text
                    className="hs-label"
                    x={d.labelX}
                    y={d.labelY + 4}
                    textAnchor={d.side === "right" ? "start" : "end"}
                  >
                    {d.label}
                  </text>
                </g>
              ))}
          </g>
        ))}
      </svg>
      <figcaption>
        {layout.legend.map((k) => (
          <p key={k.id}>{k.text}</p>
        ))}
        {layout.limits.map((l) => (
          <p key={l.participants.join("\u0000")}>{l.text}</p>
        ))}
      </figcaption>
    </figure>
      <div className="hs-scrub">
        <label htmlFor="hs-moment">Moment in the record</label>
        <input
          id="hs-moment"
          type="range"
          min={time.start}
          max={time.end}
          step={1}
          value={at ?? time.end}
          aria-valuetext={scrubText}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAt(v >= time.end ? null : v);
            setFocus(null);
            setSelectedId(null);
          }}
        />
        <p>{scrubText}</p>
      </div>
      {showCounterfactual ? (
        <div className="hs-clear">
          <button type="button" aria-pressed={clearOn} onClick={() => setClearOn((v) => !v)}>
            Clear line
          </button>
        </div>
      ) : null}
      </div>
      <div className="hs-side">
        {at === null ? (
          <p>Select a decision, or move the slider, to see what had reached each person at that moment.</p>
        ) : (
          sentences.map((t, i) => <p key={i}>{t}</p>)
        )}
      </div>
      {gains.length > 0 ? (
        <ul className="hs-gains hs-wide" aria-label="With a clear line">
          {gains.map((g) => (
            <li key={g.id}>
              <span className="hs-gain-head">{g.head}</span>
              <span>{g.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {prompts.length > 0 ? (
        <div className="hs-facilitate hs-wide">
          <h3>Discussion prompts</h3>
          <ul>
            {prompts.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {showSummary ? (
        <div className="hs-facilitate hs-wide">
          <h3>Summary</h3>
          <p>{summary}</p>
          <button type="button" onClick={copySummary}>
            Copy summary
          </button>
          {fallback ? (
            <textarea ref={fieldRef} readOnly rows={4} aria-label="Summary text" value={summary} onFocus={(e) => e.currentTarget.select()} />
          ) : null}
        </div>
      ) : null}
      {showHabits ? (
        <div className="hs-habits-wrap hs-wide">
          <HabitsTable
            habits={habitRows}
            participants={layout.lines.map((l) => ({ id: l.id, label: l.label, history: l.history }))}
          />
        </div>
      ) : null}
      {shareUrl !== undefined ? (
        <div className="hs-facilitate hs-wide">
          <button type="button" onClick={copyLink}>
            Copy link
          </button>
          {linkFallback ? (
            <textarea ref={linkFieldRef} readOnly rows={3} aria-label="Link text" value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
          ) : null}
        </div>
      ) : null}
      <details className="hs-timeline hs-wide">
        <summary>Text timeline</summary>
        <ol>
          {entries.map((e, i) => (
            <li key={`${e.kind}:${e.id}:${i}`}>{e.text}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
