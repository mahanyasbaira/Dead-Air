/**
 * ShareGate: the entry point. A valid `#s=` link opens a replay-only page and
 * RunHost is never mounted, so no storage is read or written, no transport is
 * built and no microphone is asked for. A bad link shows one sentence above the
 * normal entry (RunHost, which still resumes a saved run if there is one).
 */
import { useState } from "react";
import { ReplayView } from "hindsight/replay";
import { formatSimTime } from "./DecisionPrompt";
import { ConsoleFrame } from "./ConsoleFrame";
import { RunHost, type RunHostProps } from "./RunHost";
import { namesFromLedger, openShared, type Shared } from "./share";

export function ShareGate(props: RunHostProps & { hash?: string }) {
  const { hash, ...host } = props;
  const [shared] = useState<Shared>(() => openShared(hash ?? window.location.hash));
  const [started, setStarted] = useState(false);
  // This page makes no sound; the control is here so mute is always visible.
  const [muted, setMuted] = useState(false);

  if (shared.kind === "ok" && !started) {
    const { scenario, ledger, participants } = shared;
    const start = () => {
      // Drop the fragment so a reload opens the app, not the link. Storage is not touched.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setStarted(true);
    };
    return (
      <div className="run">
        <ConsoleFrame title={scenario.title} statusMessages={[]} muted={muted} onToggleMute={() => setMuted((m) => !m)}>
          <section className="run-end" aria-labelledby="shared-title">
            <h2 id="shared-title" className="run-h">A shared replay</h2>
            <p className="run-sentence">This is what reached each role, and when, as they chose. Nothing here is running.</p>
            <ReplayView
              ledger={ledger}
              scenario={scenario}
              participants={participants}
              names={namesFromLedger(ledger, participants, formatSimTime)}
              formatTime={formatSimTime}
            />
            <p className="run-actions">
              <button type="button" className="run-btn" onClick={start}>Start a drill</button>
            </p>
          </section>
        </ConsoleFrame>
      </div>
    );
  }
  return (
    <>
      {shared.kind === "bad" && !started ? (
        <p className="run-sentence" role="status">{shared.sentence}</p>
      ) : null}
      <RunHost {...host} />
    </>
  );
}
