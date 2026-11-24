import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import { ReplayView } from "hindsight/replay";
import { encodeLog } from "../model/codec";
import { formatClock } from "../model/clock-format";
import { habitRows, habits } from "../model/habits";
import { narrate } from "../model/narrate";
import { toLedger, toNames, toParticipants, toReplayScenario } from "../model/replay-input";
import type { NightLog, NightState } from "../model/types";
import type { Night } from "../nights";

export interface DocumentProps {
  night: Night;
  log: NightLog;
  state: NightState;
  onPlayAgain: () => void;
  onChooseAnother: () => void;
}


/** `<origin><base>#r=<token>`. The fragment is never sent to a server. */
export function shareLink(log: NightLog): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#r=${encodeLog(log)}`;
}

export function Document({ night, log, state, onPlayAgain, onChooseAnother }: DocumentProps): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const ledger = useMemo(() => toLedger(night.script, log), [night, log]);
  const scenario = useMemo(() => toReplayScenario(night.scenario, night.script, state), [night, state]);
  const text = useMemo(
    () => narrate(night.scenario, night.script, log, state, ledger),
    [night, log, state, ledger],
  );
  const shareUrl = useMemo(() => shareLink(log), [log]);
  const rows = useMemo(() => habitRows(habits(night.script, state)), [night, state]);
  return (
    <main className="document">
      <h1 ref={heading} tabIndex={-1}>
        The night is over
      </h1>
      <section aria-labelledby="doc-summary">
        <h2 id="doc-summary">The night in brief</h2>
        <p className="lead">{text.summary}</p>
      </section>
      <section aria-labelledby="doc-replay">
        <h2 id="doc-replay">What reached you, and when</h2>
        <ReplayView
          ledger={ledger}
          scenario={scenario}
          participants={toParticipants(night.scenario)}
          names={toNames(night.scenario, state)}
          formatTime={(t) => formatClock(night.script.startClock + t)}
          sections={{ summary: false, prompts: false, habits: false }}
          shareUrl={shareUrl}
        />
      </section>
      <section aria-labelledby="doc-choices">
        <h2 id="doc-choices">Each choice</h2>
        <ol className="decisions" aria-labelledby="doc-choices">
          {text.decisions.map((sentence, n) => (
            <li key={n}>{sentence}</li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="doc-habits">
        <h2 id="doc-habits">Three habits</h2>
        <dl className="habits">
          {rows.map((row) => (
            <div key={row.id} className="habit">
              <dt>{row.label}</dt>
              <dd>{row.figure}</dd>
              <dd className="why">{row.why}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="doc-next">
        <h2 id="doc-next">What next</h2>
        <ul className="doc-actions">
          <li>
            <button type="button" onClick={onPlayAgain}>
              Play it again
            </button>
          </li>
          <li>
            <button type="button" onClick={onChooseAnother}>
              Choose another night
            </button>
          </li>
        </ul>
      </section>
    </main>
  );
}
