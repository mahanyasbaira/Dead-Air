/**
 * RunHost (consoles 11.2, Req 1.1 to 1.3 and 6.1): owns one run from Entry to the
 * replay.
 *
 * Flow: Entry, role choice, console (with DecisionPrompt), replay (RunEnd).
 *
 * Log and state. One reducer holds the append-only log and the engine state
 * derived from it (`applyEntry` is the kit reducer behind the decision lock).
 * Each transport outcome is appended unchanged with `appendWire`. The scripted
 * transport re-emits its whole batch on every `resolve()`, so in Solo an outcome
 * already in the log is not appended twice. Other modes append every outcome.
 *
 * Sim time is the scenario timeline, never a clock. A send is stamped with the
 * cursor, or by the end of this device's own previous send if that is later, so
 * two sends never collide with each other. The cursor moves only when an outcome arrives (see log.ts). A burst
 * heard by the microphone is stamped with the next beat. Solo, Two tabs and Two
 * devices therefore replay the same way for the same seed and choices.
 *
 * Transport ownership. Entry builds the transport inside a click handler and
 * hands it over; from then on RunHost owns it (`ownedRef`). The subscription is
 * an effect (subscribe on mount, unsubscribe on cleanup), so StrictMode's extra
 * mount cycle subscribes, unsubscribes and subscribes again: one live
 * subscription. The effect never closes the transport. Close happens in
 * `release()` (Run again, Back to the start) and on final unmount, where the
 * close waits one microtask and is dropped if the component mounted again, which
 * is what StrictMode's simulated unmount does.
 *
 * Sends. Every send, from either console, gets a stable id (`<role>-<n>`, n
 * counted from the sends already in the log, so a resumed run continues the
 * count) and is recorded as a `send` entry. A transport that returns a promise
 * (acoustic) is recorded when that resolves, because a send that rejected never
 * went out. In Solo the partner's scheduled sends are recorded when the role is
 * chosen. The ids ride on the frames, so outcomes come back carrying them.
 *
 * Link status. A transport may report that it ended or faulted. RunHost adds one
 * plain sentence to the status line and carries on: decisions and the replay
 * still work, and the mode is never switched for the player.
 *
 * Sound. One audio bus lives as long as this component, across "Run again", and
 * is closed on final unmount only, by the same deferred check as the transport.
 *
 * Carrier lamp. `transport.mode` is not reactive. After a send RunHost re-renders,
 * and again when the airtime has passed (an injected scheduler, or the promise an
 * acoustic send returns). At that point it also ends the transmit on a loopback
 * transport and resolves a scripted one.
 *
 * Saved runs. See `Saved` below. A saved run that cannot be used is kept as it
 * is. `clear()` is called from exactly one place, the "Discard the saved run"
 * button. While an unreadable save exists, the fresh run is held in memory only.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { nextSimTime } from "hindsight";
import type { AudioBus, AudioBusOptions, Synth } from "../fx/audio";
import { createAudioBus, createWebAudioSynth } from "../fx/audio";
import { BoothConsole } from "../consoles/booth";
import { estimateAirtimeSeconds } from "../consoles/booth/composer";
import { TowerConsole } from "../consoles/tower";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import type { ReceiveMetadata } from "../../transport/acoustic-metadata";
import { NOMINAL_AIRTIME } from "../../transport/scripted";
import type { MediaDevicesLike } from "../../transport/select";
import { ConsoleFrame } from "./ConsoleFrame";
import { DecisionPrompt } from "./DecisionPrompt";
import { Entry, type EntryStart } from "./Entry";
import { RoleChoice } from "./RoleChoice";
import { RunEnd } from "./RunEnd";
import {
  DISCARDED_LINE,
  HELD_LINE,
  ROLE_KEY,
  UNSAVED_LINE,
  briefingFor,
  consoleFor,
  hasWire,
  isFinished,
  lastStep,
  partnerOf,
  partnerSchedule,
  scheduledSends,
  statusSentence,
  unreadableSentence,
  wireFor,
} from "./RunHost.model";
import {
  createDefaultAcoustic,
  createDefaultLoopback,
  createDefaultScripted,
  defaultLink,
  type LinkSettings,
} from "./factories";
import { appendSend, appendWire, applyEntry, deriveState, type ConsoleLog } from "./log";
import { clear, load, save, type RestoreResult } from "./persist";
import type { StatusMessage } from "./StatusLine";
import type {
  ConsoleLogEntry,
  PersistedRun,
  PlayMode,
  RoleId,
  Scenario,
  SendRecord,
  SimState,
  Transport,
  TransportEvent,
  TransportFrame,
} from "./types";
import "./run.css";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface RunHostProps {
  scenario?: Scenario;
  seed?: number;
  /** Defaults to `localStorage`. */
  storage?: StorageLike;
  createScripted?: (link: LinkSettings) => Transport;
  createLoopback?: (link: LinkSettings) => Transport;
  createAcoustic?: (link: LinkSettings) => Promise<Transport> | Transport;
  mediaDevices?: MediaDevicesLike | undefined;
  isSecureContext?: boolean;
  createBus?: (options: AudioBusOptions) => AudioBus;
  createSynth?: () => Synth;
  /** Runs `fn` after `ms` and returns a cancel function. Defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

// ---- saved run -------------------------------------------------------------

/**
 * What was found in storage when RunHost mounted.
 * - none: nothing stored.
 * - valid: a usable run (resumes; acoustic waits at Entry for the microphone).
 * - unreadable: kept untouched, never overwritten; the fresh run is not saved.
 * - storage-error: storage is unavailable; the run continues in memory.
 */
type Saved =
  | { kind: "none" }
  | { kind: "valid"; run: PersistedRun; state: SimState; role: RoleId | null }
  | { kind: "unreadable"; sentence: string }
  | { kind: "storage-error" };

function readSaved(storage: StorageLike | undefined, scenario: Scenario): Saved {
  if (!storage) return { kind: "storage-error" };
  const result: RestoreResult = load(storage);
  if (result.ok) {
    if (result.run.scenarioId !== scenario.id) {
      return { kind: "unreadable", sentence: unreadableSentence("unknown-scenario") };
    }
    let role: string | null = null;
    try {
      role = storage.getItem(ROLE_KEY);
    } catch {
      role = null;
    }
    const known = scenario.roles.some((r) => r.id === role);
    return { kind: "valid", run: result.run, state: result.state, role: known ? role : null };
  }
  if (result.reason === "empty") return { kind: "none" };
  if (result.reason === "storage-error") return { kind: "storage-error" };
  return { kind: "unreadable", sentence: unreadableSentence(result.reason) };
}

function defaultStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// ---- run state -------------------------------------------------------------

interface RunState {
  log: ConsoleLogEntry[];
  sim: SimState;
}
type RunAction =
  | { type: "wire"; event: TransportEvent; dedupe: boolean }
  | { type: "send"; sends: SendRecord[] }
  | { type: "decision"; log: ConsoleLogEntry[] }
  | { type: "load"; log: ConsoleLogEntry[] }
  | { type: "reset" };

function runReducer(scenario: Scenario) {
  return (state: RunState, action: RunAction): RunState => {
    switch (action.type) {
      case "wire": {
        if (action.dedupe && hasWire(state.log, action.event)) return state;
        const log = appendWire(state.log, action.event);
        return { log, sim: applyEntry(state.sim, log[log.length - 1]) };
      }
      case "send": {
        const log = action.sends.reduce<ConsoleLogEntry[]>((l, send) => appendSend(l, send), state.log);
        return { log, sim: state.sim };
      }
      case "decision":
      case "load":
        return { log: action.log, sim: deriveState(scenario, action.log) };
      case "reset":
        return { log: [], sim: deriveState(scenario, []) };
    }
  };
}

type Persist = "on" | "held" | "memory";
type Phase = "entry" | "role" | "run";

const STATUS_KEEP = 20;
const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" && v !== null && typeof (v as { then?: unknown }).then === "function";

export function RunHost(props: RunHostProps) {
  const scenario = props.scenario ?? staticOnChannel9;
  const seed = props.seed ?? 9;
  const storage = useMemo(() => props.storage ?? defaultStorage(), [props.storage]);

  // Read once. Pure: it only reads storage.
  const [boot] = useState(() => {
    const saved = readSaved(storage, scenario);
    const resume = saved.kind === "valid" && saved.run.mode !== "acoustic" && saved.role !== null ? saved : null;
    return { saved, resume };
  });
  const { saved, resume } = boot;

  const reducer = useMemo(() => runReducer(scenario), [scenario]);
  const [run, dispatch] = useReducer(reducer, undefined, (): RunState =>
    resume ? { log: resume.run.log, sim: resume.state } : { log: [], sim: deriveState(scenario, []) },
  );

  const [phase, setPhase] = useState<Phase>(resume ? "run" : "entry");
  const [mode, setMode] = useState<PlayMode | null>(resume ? resume.run.mode : null);
  const [role, setRole] = useState<RoleId | null>(resume ? resume.role : null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [entryKey, setEntryKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [, setTick] = useState(0);
  const [statuses, setStatuses] = useState<StatusMessage[]>([]);
  const [persist, setPersist] = useState<Persist>(
    saved.kind === "unreadable" ? "held" : saved.kind === "storage-error" ? "memory" : "on",
  );
  const [discarded, setDiscarded] = useState(false);
  const [waitingForMic, setWaitingForMic] = useState(saved.kind === "valid" && saved.run.mode === "acoustic");

  // Refs read by callbacks that must not go stale.
  const aliveRef = useRef(false);
  const ownedRef = useRef<Transport | null>(null);
  const cancelsRef = useRef(new Set<() => void>());
  const keyRef = useRef(0);
  const cursorRef = useRef(run.sim.cursorSimTime);
  cursorRef.current = run.sim.cursorSimTime;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const roleRef = useRef(role);
  roleRef.current = role;
  const pendingRef = useRef<Saved>(saved.kind === "valid" && saved.run.mode === "acoustic" ? saved : { kind: "none" });
  const linkRef = useRef<LinkSettings | null>(null);
  if (!linkRef.current) {
    linkRef.current = defaultLink();
    linkRef.current.seed = resume ? resume.run.seed : seed;
  }
  const logRef = useRef(run.log);
  logRef.current = run.log;
  /** Own sends made so far by this role in this run, or null until counted from the log. */
  const sendCountRef = useRef<number | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const resumedNoted = useRef(false);
  /** Sim-time until which this device's own last send still occupies the line. */
  const busyUntilRef = useRef(0);
  /** A send is stamped with the cursor, or later if the line is still busy with our last send. */
  const sendClock = useCallback(() => Math.max(cursorRef.current, busyUntilRef.current), []);

  const addStatus = useCallback((text: string, loss?: boolean) => {
    if (!aliveRef.current) return;
    setStatuses((s) => [...s, { key: keyRef.current++, text, ...(loss ? { loss: true } : {}) }].slice(-STATUS_KEEP));
  }, []);

  const busRef = useRef<AudioBus | null>(null);
  if (!busRef.current) {
    busRef.current = (props.createBus ?? createAudioBus)({
      onStatus: (text) => addStatus(text),
      createSynth: props.createSynth ?? createWebAudioSynth,
    });
  }
  const bus = busRef.current;
  const schedule = props.schedule ?? defaultSchedule;

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const cancelAll = useCallback(() => {
    for (const cancel of cancelsRef.current) cancel();
    cancelsRef.current.clear();
  }, []);

  /** Close the owned transport once. */
  const release = useCallback(() => {
    cancelAll();
    const t = ownedRef.current;
    ownedRef.current = null;
    if (t) t.close();
  }, [cancelAll]);

  // Alive flag, mute sync, and the final-unmount close.
  useEffect(() => {
    aliveRef.current = true;
    bus.setMuted(mutedRef.current);
    return () => {
      aliveRef.current = false;
      cancelAll();
      bus.setMuted(true); // silences a carrier that is still on
      queueMicrotask(() => {
        if (!aliveRef.current) {
          release();
          bus.close();
        }
      });
    };
  }, [bus, cancelAll, release]);

  // Resume a saved Solo or Two tabs run: rebuild the transport with the same factory.
  useEffect(() => {
    if (!resume) return;
    const link = linkRef.current as LinkSettings;
    configureLink(link, scenario, resume.role as RoleId, resume.run.seed, cursorRef);
    const make = resume.run.mode === "loopback" ? props.createLoopback ?? createDefaultLoopback : props.createScripted ?? createDefaultScripted;
    const t = make(link);
    ownedRef.current = t;
    setTransport(t);
    if (!resumedNoted.current) {
      resumedNoted.current = true;
      addStatus("Resumed your saved run.");
    }
    return () => {
      if (ownedRef.current === t) ownedRef.current = null;
      t.close();
    };
    // Runs once per mount; the props are factories read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One subscription per transport. The effect never closes the transport.
  useEffect(() => {
    if (!transport) return;
    const offStatus = transport.onStatus?.((status) => {
      // A transport being closed by us (Run again, Back to the start) is not news.
      if (ownedRef.current !== transport) return;
      addStatus(statusSentence(modeRef.current, status), true);
    });
    const off = transport.on((event) => {
      const r = roleRef.current;
      dispatch({ type: "wire", event, dedupe: modeRef.current === "solo" });
      if (r && event.kind === "received" && event.recipient === r && consoleFor(scenario, r) === "booth") {
        bus.play({ kind: "chirp", direction: "received" });
      }
      bump();
    });
    return () => {
      off();
      offStatus?.();
    };
  }, [transport, scenario, bus, bump, addStatus]);

  // Save on every append and decision, unless the stored run is being kept.
  useEffect(() => {
    if (phase !== "run" || persist !== "on" || !storage || !mode || !role) return;
    const result = save(storage, { version: 1, scenarioId: scenario.id, seed: linkRef.current?.seed ?? seed, mode, log: run.log });
    let ok = result.ok;
    if (ok) {
      try {
        storage.setItem(ROLE_KEY, role);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      setPersist("memory");
      addStatus(UNSAVED_LINE, true);
    }
  }, [run.log, persist, phase, mode, role, storage, scenario.id, seed, addStatus]);

  // ---- actions -------------------------------------------------------------

  function applyMuted(next: boolean) {
    setMuted(next);
    bus.setMuted(next);
  }

  function leave() {
    release();
    busyUntilRef.current = 0;
    sendCountRef.current = null;
    setTransport(null);
    setMode(null);
    setRole(null);
    setShowEnd(false);
    dispatch({ type: "reset" });
    linkRef.current = { ...defaultLink(), seed };
    setPhase("entry");
    setEntryKey((k) => k + 1);
  }

  function onStart(start: EntryStart) {
    release();
    ownedRef.current = start.transport;
    setTransport(start.transport);
    setMode(start.mode);
    setShowEnd(false);
    busyUntilRef.current = 0;
    sendCountRef.current = null;
    if (start.reason) addStatus(start.reason, true);
    const pending = pendingRef.current;
    if (pending.kind === "valid" && pending.run.mode === start.mode) {
      // The two-device run that was waiting for the microphone continues.
      pendingRef.current = { kind: "none" };
      setWaitingForMic(false);
      dispatch({ type: "load", log: pending.run.log });
      if (pending.role) {
        configureLink(linkRef.current as LinkSettings, scenario, pending.role, pending.run.seed, cursorRef);
        setRole(pending.role);
        setPhase("run");
        addStatus("Resumed your saved run.");
        return;
      }
      (linkRef.current as LinkSettings).seed = pending.run.seed;
    } else {
      pendingRef.current = { kind: "none" };
      setWaitingForMic(false);
      dispatch({ type: "reset" });
    }
    setRole(null);
    setPhase("role");
  }

  function chooseRole(next: RoleId) {
    configureLink(linkRef.current as LinkSettings, scenario, next, linkRef.current?.seed ?? seed, cursorRef);
    setRole(next);
    setPhase("run");
    if (modeRef.current === "solo") {
      // The partner's sends are known from its schedule, so they are logged now.
      dispatch({ type: "send", sends: scheduledSends(partnerSchedule(scenario, next)) });
    }
    addStatus("Time moves when a message arrives.");
  }

  function discardSaved() {
    clear(storage as StorageLike);
    setPersist("on");
    setDiscarded(true);
  }

  /** Every send, from either console, goes through here. */
  const sendFrame = useCallback(
    (plain: TransportFrame) => {
      const t = ownedRef.current;
      if (!t) return;
      if (sendCountRef.current === null) {
        sendCountRef.current = logRef.current.filter((e) => e.kind === "send" && e.send.sender === plain.sender).length;
      }
      const id = plain.id ?? `${plain.sender}-${sendCountRef.current++}`;
      const frame: TransportFrame = { ...plain, id };
      // Airtime is recorded only where the value is known: the frame's own, or in Solo
      // and Two tabs the nominal value the transport used for this frame. By sound the
      // measured length stays inside the transport, so it is left unrecorded.
      const airtime = frame.airtime ?? (modeRef.current === "acoustic" ? undefined : NOMINAL_AIRTIME);
      const record = () => {
        if (aliveRef.current && ownedRef.current === t) {
          dispatch({
            type: "send",
            sends: [
              {
                id,
                sender: frame.sender,
                recipient: frame.recipient,
                sendTime: frame.sendTime,
                bytes: frame.payload.length,
                ...(airtime === undefined ? {} : { airtime }),
              },
            ],
          });
        }
      };
      busyUntilRef.current = frame.sendTime + (frame.airtime ?? NOMINAL_AIRTIME);
      const fail = () => addStatus("The line failed while sending. Nothing was sent.", true);
      let result: unknown;
      try {
        result = t.send(frame);
      } catch {
        fail();
        return;
      }
      if (!isThenable(result)) record();
      bus.play({ kind: "carrier", state: "on" });
      bus.play({ kind: "chirp", direction: "sent" });
      bump();
      let cancel: () => void = () => {};
      const done = () => {
        cancelsRef.current.delete(cancel);
        if (!aliveRef.current || ownedRef.current !== t) return;
        const x = t as Partial<{ endTransmit(): void; resolve(): unknown }>;
        x.endTransmit?.();
        x.resolve?.();
        bus.play({ kind: "carrier", state: "off" });
        bump();
      };
      if (isThenable(result)) {
        result.then(() => {
          record();
          done();
        }, () => {
          fail();
          done();
        });
      } else {
        cancel = schedule(done, Math.round(estimateAirtimeSeconds(frame.payload.length) * 1000));
        cancelsRef.current.add(cancel);
      }
    },
    [addStatus, bump, bus, schedule],
  );

  // A transport the consoles can read and send through. `send` is the one real send.
  const consoleLink = useMemo<Transport | null>(
    () =>
      transport && {
        send: sendFrame,
        on: (l) => transport.on(l),
        get mode() {
          return transport.mode;
        },
        close: () => transport.close(),
      },
    [transport, sendFrame],
  );

  // ---- render --------------------------------------------------------------

  const gesture = () => bus.gesture();
  const cursor = run.sim.cursorSimTime;
  const finished = isFinished(run.sim);

  const notice = (
    <>
      {persist === "held" && saved.kind === "unreadable" && (
        <section className="run-notice" aria-label="Saved run">
          <p>{saved.sentence}</p>
          <p>{HELD_LINE}</p>
          <button type="button" className="run-btn" onClick={discardSaved}>Discard the saved run</button>
        </section>
      )}
      {persist === "memory" && saved.kind === "storage-error" && (
        <section className="run-notice" aria-label="Saved run"><p>{UNSAVED_LINE}</p></section>
      )}
      {discarded && persist === "on" && (
        <section className="run-notice" aria-label="Saved run"><p>{DISCARDED_LINE}</p></section>
      )}
      {waitingForMic && phase === "entry" && (
        <section className="run-notice" aria-label="Saved run">
          <p>A saved run used two devices by sound. Choose Two devices by sound to continue it. Any other choice starts a new run.</p>
        </section>
      )}
    </>
  );

  const frameProps = {
    title: scenario.title,
    statusMessages: statuses,
    muted,
    onToggleMute: () => applyMuted(!muted),
  };

  let body: JSX.Element;
  if (phase === "entry") {
    const l = linkRef.current as LinkSettings;
    body = (
      <Entry
        key={entryKey}
        onStart={onStart}
        initialMuted={muted}
        onMutedChange={applyMuted}
        createScripted={() => (props.createScripted ?? createDefaultScripted)(l)}
        createLoopback={() => (props.createLoopback ?? createDefaultLoopback)(l)}
        createAcoustic={() => (props.createAcoustic ?? createDefaultAcoustic)(l)}
        {...("mediaDevices" in props ? { mediaDevices: props.mediaDevices } : {})}
        {...("isSecureContext" in props ? { isSecureContext: props.isSecureContext } : {})}
      />
    );
  } else if (phase === "role" || !role || !consoleLink) {
    body = (
      <ConsoleFrame {...frameProps}>
        <RoleChoice scenario={scenario} onChoose={chooseRole} />
        <p className="run-actions"><button type="button" className="run-btn" onClick={leave}>Back to the start</button></p>
      </ConsoleFrame>
    );
  } else if (showEnd) {
    body = (
      <ConsoleFrame {...frameProps}>
        <RunEnd
          scenario={scenario}
          log={run.log}
          state={run.sim}
          mode={mode as PlayMode}
          localRole={role as RoleId}
          onRunAgain={leave}
        />
      </ConsoleFrame>
    );
  } else {
    const partner = partnerOf(scenario, role);
    const events = wireFor(run.log, role);
    const meta = (events[events.length - 1] as { meta?: ReceiveMetadata } | undefined)?.meta;
    body = (
      <ConsoleFrame {...frameProps}>
        <section className="run-brief" aria-labelledby="run-brief-title">
          <h2 id="run-brief-title" className="run-h">What you know</h2>
          <ol className="run-list">
            {briefingFor(scenario, role, cursor).map((e) => (
              <li key={e.id} className="run-row">
                <span className="run-time">sim-minute {e.simTime}</span> {e.title}. {e.body}
              </li>
            ))}
          </ol>
        </section>
        {consoleFor(scenario, role) === "booth" ? (
          <BoothConsole
            events={events}
            transport={consoleLink}
            mode={mode as PlayMode}
            self={role}
            partner={partner}
            now={sendClock}
            {...(meta ? { lastMeasurement: meta } : {})}
          />
        ) : (
          <TowerConsole
            events={events}
            onCue={(sound) => bus.play(sound)}
            onSend={(_text, payload) =>
              sendFrame({ sender: role, recipient: partner, payload, sendTime: sendClock() })
            }
          />
        )}
        <DecisionPrompt scenario={scenario} role={role} log={run.log as ConsoleLog} onRecord={(log) => dispatch({ type: "decision", log })} />
        <p className="run-progress">
          {finished
            ? "The drill has reached its last beat."
            : `Sim-minute ${cursor} of ${lastStep(scenario)}. Time moves when a message arrives.`}
        </p>
        <p className="run-actions">
          <button type="button" className="run-btn" onClick={() => setShowEnd(true)}>See the replay</button>
          <button type="button" className="run-btn run-quiet" onClick={leave}>Back to the start</button>
        </p>
      </ConsoleFrame>
    );
  }

  return (
    <div className="run" onClickCapture={gesture} onKeyDownCapture={gesture}>
      {notice}
      {body}
    </div>
  );
}

function defaultSchedule(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** Fill in what the run decides after Entry has built the transport. */
function configureLink(
  link: LinkSettings,
  scenario: Scenario,
  role: RoleId,
  seed: number,
  cursor: { current: number },
): void {
  link.localId = role;
  link.remoteId = partnerOf(scenario, role);
  link.seed = seed;
  link.schedule = partnerSchedule(scenario, role);
  link.now = () => nextSimTime(scenario, cursor.current);
}
