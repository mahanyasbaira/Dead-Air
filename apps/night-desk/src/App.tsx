// Screen state machine: start -> night -> document, with a picker. The log is the only game state.
//
// Saved nights (developer override, 2026-11-23). A saved night that cannot be used is kept as it
// is: `clear()` is called from two places only, the "Discard the saved night" button and "Play it
// again" (below), and never for an unusable save. While an
// unusable save exists the new night is held in memory and not saved. If Storage throws, the night
// continues in memory with one line saying so.
//
// Replay navigation (task 4.3). "Play it again" is an explicit action on the visitor's own finished
// night, so it may clear that one night's saved log, and nothing else: never an unusable save
// (the new night is then held in memory) and never the completed-night records. On a page opened
// from a `#r=` link, "Play it again" and "Choose another night" touch no storage. Storage is first
// read when the visitor takes their first action in the night they started (see `settle`).
import { useState } from "react";
import type { ReactElement } from "react";
import { decodeLog } from "./model/codec";
import { applyAction, foldNight } from "./model/night";
import {
  DISCARDED_LINE,
  HELD_LINE,
  UNSAVED_LINE,
  clear,
  completed,
  loadSaved,
  markCompleted,
  save,
  unusableSentence,
  type Saved,
  type StorageLike,
} from "./model/storage";
import type { NightLog } from "./model/types";
import { findNight, nights } from "./nights";
import type { Night as NightDef } from "./nights";
import { Document } from "./screens/Document";
import { Night } from "./screens/Night";
import { Picker } from "./screens/Picker";
import { Start } from "./screens/Start";

type Screen = "start" | "picker" | "night" | "document";
/** on: saving. held: an unusable save is kept, so this night is not saved. memory: Storage failed. */
type Persist = "on" | "held" | "memory";

export const LINK_UNREADABLE = "This link could not be read, so this is a new night.";
export const LINK_OLDER = "This link was made for an older version of this night, so this is a new night.";

type Shared = { kind: "none" } | { kind: "ok"; log: NightLog } | { kind: "bad"; sentence: string };

/** Read a `#r=<token>` fragment. Pure: it touches no storage and makes no request. */
export function readShared(hash: string): Shared {
  if (!hash.startsWith("#r=")) return { kind: "none" };
  const decoded = decodeLog(hash.slice(3));
  if (!decoded.ok) return { kind: "bad", sentence: LINK_UNREADABLE };
  const log = decoded.value;
  const script = findNight(log.scenarioId)?.script;
  if (script === undefined) return { kind: "bad", sentence: LINK_UNREADABLE };
  if (log.rev !== script.rev || log.seed !== script.seed) return { kind: "bad", sentence: LINK_OLDER };
  let folded;
  try {
    folded = foldNight(script, log);
  } catch {
    return { kind: "bad", sentence: LINK_UNREADABLE };
  }
  if (!folded.ok || !folded.value.ended) return { kind: "bad", sentence: LINK_UNREADABLE };
  return { kind: "ok", log };
}

function defaultHash(): string {
  try {
    return window.location.hash;
  } catch {
    return "";
  }
}

export interface AppProps {
  /** The URL fragment to read a shared link from. Defaults to `window.location.hash`. */
  hash?: string;
  /** The Storage to use. Defaults to `window.localStorage`; null means none. */
  storage?: StorageLike | null;
}

function emptyLog(night: NightDef): NightLog {
  const { id, rev, seed } = night.script;
  return { v: 1, scenarioId: id, rev, seed, entries: [] };
}

function defaultStorage(): StorageLike | undefined {
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function SavedNotice(props: {
  persist: Persist;
  discarded: boolean;
  onDiscard: () => void;
}): ReactElement | null {
  const { persist, discarded, onDiscard } = props;
  if (persist === "held") {
    return (
      <div className="saved-notice" role="group" aria-label="Saved night">
        <p className="note">{HELD_LINE}</p>
        <button type="button" onClick={onDiscard}>
          Discard the saved night
        </button>
      </div>
    );
  }
  if (persist === "memory") {
    return (
      <div className="saved-notice" role="group" aria-label="Saved night">
        <p className="note">{UNSAVED_LINE}</p>
      </div>
    );
  }
  if (discarded) {
    return (
      <div className="saved-notice" role="group" aria-label="Saved night">
        <p className="note">{DISCARDED_LINE}</p>
      </div>
    );
  }
  return null;
}

export function App({ storage: given, hash }: AppProps = {}): ReactElement {
  const [shared] = useState<Shared>(() => readShared(hash ?? defaultHash()));
  const [storage] = useState<StorageLike | undefined>(() => (given === undefined ? defaultStorage() : given ?? undefined));
  // A valid link wins over storage and storage is not even read. A bad link shows its sentence and
  // the start screen; a saved night that exists is then kept and the new night is held in memory.
  const [boot] = useState<Saved>(() =>
    shared.kind === "ok" ? { kind: "none" } : loadSaved(storage, (id) => findNight(id)?.script),
  );
  const open = shared.kind === "ok" ? shared.log : boot.kind === "resume" && shared.kind === "none" ? boot.log : null;
  const [screen, setScreen] = useState<Screen>(
    shared.kind === "ok"
      ? "document"
      : shared.kind === "none" && boot.kind === "resume"
        ? boot.ended
          ? "document"
          : "night"
        : "start",
  );
  const [log, setLog] = useState<NightLog | null>(open);
  const [persist, setPersist] = useState<Persist>(
    boot.kind === "unusable" || (shared.kind === "bad" && boot.kind === "resume")
      ? "held"
      : boot.kind === "storage-error"
        ? "memory"
        : "on",
  );
  const [discarded, setDiscarded] = useState(false);
  // True on a page opened from a `#r=` link until the visitor takes an action in a night of their own.
  const [pending, setPending] = useState(shared.kind === "ok");
  const night = log === null ? undefined : findNight(log.scenarioId);

  const saveOrHold = (next: NightLog): void => {
    if (!save(storage, next)) setPersist("memory");
  };

  const discard = (): void => {
    clear(storage);
    setPersist("on");
    setDiscarded(true);
    if (log !== null && log.entries.length > 0) saveOrHold(log);
  };

  const notice = <SavedNotice persist={persist} discarded={discarded} onDiscard={discard} />;

  const begin = (n: NightDef): void => {
    setLog(emptyLog(n));
    setScreen("night");
  };

  // Start opens the guided night until it is in `completed`, and the picker afterwards.
  const start = (): void => {
    const first = nights.find((n) => n.script.guided === true) ?? nights[0];
    if (first !== undefined && !completed(storage).includes(first.id)) begin(first);
    else setScreen("picker");
  };

  // Clears only this night's own saved log, and only when saving is on for a visitor's own night.
  // An unusable save is never cleared: the new night is then held in memory like any other.
  const playAgain = (): void => {
    if (night === undefined) return;
    if (persist === "on" && !pending) {
      const saved = loadSaved(storage, (id) => findNight(id)?.script);
      if (saved.kind === "resume" && saved.log.scenarioId === night.id) clear(storage);
      else if (saved.kind === "unusable") setPersist("held");
    }
    begin(night);
  };

  // The first action of a night begun from a shared link: read the visitor's own save for the first
  // time and decide, without writing, whether this night can be saved.
  const settle = (): Persist => {
    const saved = loadSaved(storage, (id) => findNight(id)?.script);
    setPending(false);
    const mode: Persist =
      saved.kind === "storage-error" ? "memory" : saved.kind === "unusable" || (saved.kind === "resume" && !saved.ended) ? "held" : "on";
    setPersist(mode);
    return mode;
  };

  if (screen === "picker") {
    return <Picker nights={nights} onChoose={begin} notice={notice} />;
  }

  if (screen === "start" || log === null || night === undefined) {
    const sentence =
      shared.kind === "bad"
        ? shared.sentence
        : boot.kind === "unusable" && persist === "held"
          ? unusableSentence(boot.reason)
          : null;
    return (
      <Start
        onStart={start}
        notice={
          sentence === null && persist === "on" && !discarded ? null : (
            <>
              {sentence !== null && <p className="note">{sentence}</p>}
              {notice}
            </>
          )
        }
      />
    );
  }

  const folded = foldNight(night.script, log);
  if (!folded.ok) {
    return <Start onStart={() => begin(night)} notice={notice} />;
  }
  const state = folded.value;

  if (screen === "document") {
    return (
      <>
        <Document
          night={night}
          log={log}
          state={state}
          onPlayAgain={playAgain}
          onChooseAnother={() => setScreen("picker")}
        />
        {notice}
      </>
    );
  }

  return (
    <Night
      night={night}
      state={state}
      notice={notice}
      onAction={(actionId, opts) => {
        const next = applyAction(night.script, log, actionId, opts);
        if (!next.ok) return;
        setLog(next.value);
        const mode = pending ? settle() : persist;
        if (mode === "on") saveOrHold(next.value);
        const after = foldNight(night.script, next.value);
        if (after.ok && after.value.ended) {
          markCompleted(storage, night.id);
          setScreen("document");
        }
      }}
    />
  );
}
