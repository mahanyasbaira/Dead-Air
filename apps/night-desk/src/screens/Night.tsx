import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { formatClock } from "../model/clock-format";
import { currentStep } from "../model/guide";
import { availableActions } from "../model/night";
import type { ActionDef, NightState } from "../model/types";
import type { Night as NightDef } from "../nights";
import { audioClipFactory, createVoice } from "../voice/voice";
import type { ClipFactory, Voice } from "../voice/voice";

export interface NightProps {
  night: NightDef;
  state: NightState;
  onAction: (actionId: string, opts?: { facts?: string[] }) => void;
  /** A line about saving, shown under the title when there is one. */
  notice?: ReactNode;
  /** Builds a clip when one is played. Defaults to an audio element; tests inject a fake. */
  voiceFactory?: ClipFactory;
}

const STAFF_LINE = "The staff member on call is a phone call away.";
/** The sound control's key. It is bound only when no action of the night uses it. */
const SOUND_KEY = "m";

export function Night({ night, state, onAction, notice, voiceFactory }: NightProps): ReactElement {
  const { script, scenario } = night;
  const actions = availableActions(script, state);
  const step = currentStep(script, state);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLFieldSetElement>(null);
  // UI choice only: whether the log panel is open and which facts are ticked. Not game state.
  const [logOpen, setLogOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // Sound is off until the visitor turns it on. UI choice only, not game state.
  const [sound, setSound] = useState(false);
  const voice = useRef<Voice | null>(null);
  const factory = useRef(voiceFactory);
  factory.current = voiceFactory;
  // Items already on screen at mount, and any already handled, never play: a clip only goes with an
  // item that arrives while the visitor is here. The ref survives StrictMode's second mount.
  const handled = useRef<Set<string> | null>(null);
  if (handled.current === null) handled.current = new Set(state.delivered.map((d) => d.id));
  const soundKeyFree = !script.actions.some((a) => a.key.toLowerCase() === SOUND_KEY);
  const logAction = actions.find((a) => a.kind === "log");
  const titleOf = (id: string): string => scenario.events.find((e) => e.id === id)?.title ?? id;
  const known = state.delivered.map((d) => d.id);
  const close = (): void => {
    setLogOpen(false);
    heading.current?.focus();
  };
  const run = (a: ActionDef): void => {
    if (a.kind === "log") {
      setPicked([]);
      setLogOpen(true);
    } else onAction(a.id);
  };
  const confirm = (): void => {
    if (logAction === undefined) return;
    onAction(logAction.id, { facts: known.filter((id) => picked.includes(id)) });
    setLogOpen(false);
  };
  const toggle = (id: string): void =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const clock = (minute: number): string => formatClock(script.startClock + minute);
  const needsProfessional = (id: string): boolean =>
    script.items.some((i) => i.id === id && i.needsProfessional === true);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  // One voice per mount, closed on unmount. Nothing is built here beyond the closure: the factory
  // runs only when a clip plays. Capture phase, so the gesture is seen before any key handler.
  useEffect(() => {
    const v = createVoice((file) => (factory.current ?? audioClipFactory(import.meta.env.BASE_URL))(file));
    voice.current = v;
    const gesture = (): void => v.gesture();
    window.addEventListener("pointerdown", gesture, true);
    window.addEventListener("keydown", gesture, true);
    return () => {
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("keydown", gesture, true);
      v.close();
      voice.current = null;
    };
  }, []);

  useEffect(() => {
    voice.current?.setSound(sound);
  }, [sound]);

  useEffect(() => {
    for (const d of state.delivered) {
      if (handled.current?.has(d.id)) continue;
      handled.current?.add(d.id);
      const def = script.items.find((i) => i.id === d.id);
      if (def !== undefined) voice.current?.play(def);
    }
  }, [state.delivered, script.items]);

  useEffect(() => {
    if (logOpen) panel.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, [logOpen]);

  // Action keys. Modified keys are left to the browser. While the log panel is open it owns the
  // keys: 1 to 9 tick a fact, Enter records, Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (logOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          confirm();
        } else if (/^[1-9]$/.test(e.key) && known[Number(e.key) - 1] !== undefined) {
          e.preventDefault();
          toggle(known[Number(e.key) - 1]);
        }
        return;
      }
      if (soundKeyFree && e.key.toLowerCase() === SOUND_KEY) {
        e.preventDefault();
        setSound((on) => !on);
        return;
      }
      const hit = actions.find((a) => a.key.toLowerCase() === e.key.toLowerCase());
      if (hit === undefined) return;
      e.preventDefault();
      run(hit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const logEntries = state.entries.filter(
    (e) => script.actions.find((a) => a.id === e.actionId)?.kind === "log",
  );
  const total = script.guide?.length ?? 0;
  const done = total === 0 ? 0 : step === null ? total : (script.guide ?? []).findIndex((s) => s.id === step.id);
  const shown = [...state.delivered].sort((a, b) => b.deliveredAt - a.deliveredAt || (a.id < b.id ? 1 : -1));

  return (
    <main className="night">
      {script.guided === true && total > 0 && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Guide progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <header>
        <h1 ref={heading} tabIndex={-1}>
          <time>{clock(state.now)}</time>
        </h1>
        <p className="note">{scenario.title}</p>
        {notice}
        <p>
          <button type="button" aria-keyshortcuts={soundKeyFree ? SOUND_KEY : undefined} onClick={() => setSound((on) => !on)}>
            {soundKeyFree && <kbd>{SOUND_KEY.toUpperCase()}</kbd>}
            <span>{sound ? "Sound on" : "Sound off"}</span>
          </button>
        </p>
      </header>
      <section aria-labelledby="items-h">
        <h2 id="items-h">Reached you</h2>
        <ol className="items">
          {shown.map((d) => {
            const event = scenario.events.find((e) => e.id === d.id);
            const role = scenario.roles.find((r) => r.id === d.source);
            return (
              <li key={d.id}>
                <p className="meta">
                  {role?.name ?? d.source}, sent <time>{clock(d.sentAt)}</time>
                  {d.deliveredAt !== d.sentAt && (
                    <>
                      , reached you <time>{clock(d.deliveredAt)}</time>
                    </>
                  )}
                </p>
                <p>{event?.body}</p>
                {needsProfessional(d.id) && <p className="note">{STAFF_LINE}</p>}
              </li>
            );
          })}
        </ol>
        {state.missed.length > 0 && (
          <ul className="missed-list" aria-label="Missed">
            {state.missed.map((m) => {
              const role = scenario.roles.find((r) => r.id === m.source);
              const def = script.items.find((i) => i.id === m.id);
              // A message that expired has no time in its line; the source line below still carries it.
              const line = def?.kind === "message" ? m.label : `${m.label} at ${clock(m.sentAt)}`;
              return (
                <li key={m.id}>
                  <p className="missed">{line}</p>
                  <p className="meta">
                    {role?.name ?? m.source}, sent <time>{clock(m.sentAt)}</time>
                  </p>
                  {needsProfessional(m.id) && <p className="note">{STAFF_LINE}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="actions-h">
        <h2 id="actions-h">What do you do?</h2>
        {step !== null && <p className="guide">{step.text}</p>}
        {logOpen && logAction !== undefined ? (
          <fieldset ref={panel} className="log-panel">
            <legend>Write a log entry at {clock(state.now)}</legend>
            {known.length === 0 ? (
              <p className="note">Nothing has reached you yet.</p>
            ) : (
              <ul className="actions-list">
                {known.map((id, i) => (
                  <li key={id}>
                    <label>
                      <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} />
                      {i < 9 && <kbd>{i + 1}</kbd>}
                      <span>{titleOf(id)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <button type="button" onClick={confirm}>
                <span>Record entry</span>
                <span className="cost">{logAction.cost} min</span>
              </button>{" "}
              <button type="button" onClick={close}>
                <span>Cancel</span>
              </button>
            </p>
            <p className="note">1 to 9 tick a fact. Enter records. Escape cancels.</p>
          </fieldset>
        ) : (
        <ul className="actions-list">
          {actions.map((a) => (
            <li key={a.id}>
              <button type="button" aria-keyshortcuts={a.key} onClick={() => run(a)}>
                <kbd>{a.key.toUpperCase()}</kbd>
                <span>{a.label}</span>
                <span className="cost">{a.cost} min</span>
              </button>
            </li>
          ))}
        </ul>
        )}
      </section>
      {logEntries.length > 0 && (
        <section aria-labelledby="log-h">
          <h2 id="log-h">Your log</h2>
          <ol className="items">
            {logEntries.map((e) => (
              <li key={e.at}>
                <p className="meta">
                  <time>{clock(e.at)}</time>
                </p>
                <p>{(e.facts ?? []).length === 0 ? "Nothing noted." : (e.facts ?? []).map(titleOf).join(", ")}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
