/**
 * RunEnd: the replay. A heading, one sentence, the kit's ReplayView, and one
 * button. No scores. "Finished" means the cursor reached the last step of the
 * scenario timeline; a drill ended earlier says so.
 */
import { useEffect, useMemo, useRef } from "react";
import { ReplayView } from "hindsight/replay";
import { isFinished } from "./RunHost.model";
import { formatSimTime } from "./DecisionPrompt";
import { toLedger, toNames, toParticipants, toReplayScenario } from "./replay-input";
import { TOO_LARGE_SENTENCE, shareLink, toRecord } from "./share";
import type { ConsoleLogEntry, PlayMode, RoleId, Scenario, SimState } from "./types";

/** Habits on. Read-back is not recorded in Dead Air, so it reads "Not recorded". */
const HABIT_OPTIONS = { readBackRecorded: false } as const;
const SECTIONS = { habits: true } as const;

export interface RunEndProps {
  scenario: Scenario;
  log: readonly ConsoleLogEntry[];
  state: SimState;
  mode: PlayMode;
  localRole: RoleId;
  onRunAgain: () => void;
}

export function RunEnd({ scenario, log, state, mode, localRole, onRunAgain }: RunEndProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const ledger = useMemo(() => toLedger(scenario, log, state), [scenario, log, state]);
  const replayScenario = useMemo(() => toReplayScenario(scenario, state), [scenario, state]);
  const participants = useMemo(() => toParticipants(scenario, log, { mode, localRole }), [scenario, log, mode, localRole]);
  const names = useMemo(() => toNames(scenario, log, participants, formatSimTime), [scenario, log, participants]);
  const link = useMemo(
    () => shareLink(toRecord(scenario, replayScenario, ledger, participants), window.location.origin, import.meta.env.BASE_URL),
    [scenario, replayScenario, ledger, participants],
  );
  const finished = isFinished(state);
  return (
    <section className="run-end" aria-labelledby="run-end-title">
      <h2 id="run-end-title" ref={heading} tabIndex={-1} className="run-h">
        {finished ? "The drill is over" : "The drill was ended early"}
      </h2>
      <p className="run-sentence">
        {finished
          ? "This is what reached each role, and when, as they chose."
          : "You ended the drill before its last beat. This is what had reached each role by then."}
      </p>
      <ReplayView ledger={ledger} scenario={replayScenario} participants={participants} names={names} formatTime={formatSimTime} sections={SECTIONS} habitOptions={HABIT_OPTIONS} {...(link.ok ? { shareUrl: link.url } : {})} />
      {!link.ok && <p className="run-sentence">{TOO_LARGE_SENTENCE}</p>}
      <p className="run-actions">
        <button type="button" className="run-btn" onClick={onRunAgain}>Run again</button>
      </p>
    </section>
  );
}
