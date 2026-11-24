/**
 * Entry: the first screen of the shell (consoles 11.1, Req 1.1 and 1.3).
 *
 * Three ways in, one sentence each. Solo and Two tabs resolve their transport
 * directly. Two devices by sound goes through `selectTransport`; if the
 * microphone cannot be used, the reason is shown as plain text and Solo stays
 * available. The parent receives the choice through `onStart`.
 */
import { useEffect, useRef, useState } from "react";
import { selectTransport, type MediaDevicesLike } from "../../transport/select";
import type { Transport } from "../../transport/types";
import type { PlayMode } from "./types";
import { createDefaultAcoustic, createDefaultLoopback, createDefaultScripted } from "./factories";
import "./entry.css";

export interface EntryStart {
  mode: PlayMode;
  transport: Transport;
  /** Set when the run is solo because the microphone could not be used. */
  reason?: string;
}

export interface EntryProps {
  onStart: (start: EntryStart) => void;
  /** Defaults to `navigator.mediaDevices`. Pass `undefined` explicitly to simulate none. */
  mediaDevices?: MediaDevicesLike | undefined;
  /** Defaults to `window.isSecureContext`. */
  isSecureContext?: boolean;
  createScripted?: () => Transport;
  createLoopback?: () => Transport;
  createAcoustic?: () => Promise<Transport> | Transport;
  /** Called when the mute control changes. */
  onMutedChange?: (muted: boolean) => void;
  /** Starting state of the mute control, when a parent already holds it. */
  initialMuted?: boolean;
}

export const DRILL_MARKER = "Fiction. Practice drill.";

const MODES: { id: PlayMode; name: string; sentence: string }[] = [
  { id: "solo", name: "Solo", sentence: "Play against a scripted partner on this device." },
  { id: "loopback", name: "Two tabs", sentence: "Open a second tab on this device and play across the two." },
  { id: "acoustic", name: "Two devices by sound", sentence: "Two devices talk through speaker and microphone, with no network." },
];

export function Entry(props: EntryProps) {
  const { onStart, onMutedChange } = props;
  const createScripted = props.createScripted ?? createDefaultScripted;
  const createLoopback = props.createLoopback ?? createDefaultLoopback;
  const createAcoustic = props.createAcoustic ?? createDefaultAcoustic;

  const [muted, setMuted] = useState(props.initialMuted ?? false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState<string | undefined>(undefined);
  const starting = useRef(false);
  /** The pending microphone attempt, if any. Aborting it makes the attempt stale. */
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, []);

  /** Drop any pending microphone attempt: it will release its stream and never call onStart. */
  function cancelPending() {
    if (!pending.current) return;
    pending.current.abort();
    pending.current = null;
    starting.current = false;
    setBusy(false);
    setStatus("");
  }

  function toggleMute() {
    // No side effect inside the state updater: it runs during render.
    const next = !muted;
    setMuted(next);
    onMutedChange?.(next);
  }

  async function choose(mode: PlayMode) {
    if (mode === "solo") {
      cancelPending();
      onStart({ mode, transport: createScripted(), ...(reason ? { reason } : {}) });
      return;
    }
    if (mode === "loopback") {
      cancelPending();
      onStart({ mode, transport: createLoopback() });
      return;
    }
    if (starting.current) return;
    starting.current = true;
    const attempt = new AbortController();
    pending.current = attempt;
    setBusy(true);
    setReason(undefined);
    setStatus("Asking for the microphone.");
    try {
      const mediaDevices =
        "mediaDevices" in props ? props.mediaDevices : typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
      const isSecureContext =
        "isSecureContext" in props ? props.isSecureContext : typeof window === "undefined" ? undefined : window.isSecureContext;
      const picked = await selectTransport({ mediaDevices, isSecureContext, createAcoustic, createScripted, signal: attempt.signal });
      if (picked.kind === "cancelled" || attempt.signal.aborted) {
        if (picked.kind !== "cancelled") picked.transport.close();
        return;
      }
      if (picked.kind === "acoustic") {
        setStatus("");
        onStart({ mode: "acoustic", transport: picked.transport });
      } else {
        // The fallback transport was only built to satisfy the selector. Solo builds its own.
        picked.transport.close();
        setReason(picked.reason);
        setStatus(picked.reason);
      }
    } finally {
      if (pending.current === attempt) {
        pending.current = null;
        starting.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <main className="entry" aria-labelledby="entry-title">
      <header className="entry-bar">
        <p className="entry-marker">{DRILL_MARKER}</p>
        <button type="button" className="entry-btn entry-mute" aria-pressed={muted} onClick={toggleMute}>
          Mute
        </button>
      </header>

      <h1 id="entry-title" className="entry-title">Dead air</h1>
      <p className="entry-lede">A two-person drill where the only link between you is sound, and a replay of what each of you knew when you decided.</p>

      <ul className="entry-modes">
        {MODES.map((m) => (
          <li key={m.id} className="entry-mode">
            <button
              type="button"
              className="entry-btn"
              aria-describedby={`entry-${m.id}-sentence`}
              disabled={busy && m.id === "acoustic"}
              onClick={() => void choose(m.id)}
            >
              {m.name}
            </button>
            <p id={`entry-${m.id}-sentence`} className="entry-sentence">{m.sentence}</p>
          </li>
        ))}
      </ul>

      <p role="status" className={reason ? "entry-status entry-loss" : "entry-status"}>{status}</p>
    </main>
  );
}
