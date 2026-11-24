/**
 * DecisionPrompt (consoles 10.1, Req 4.1 and 4.2). Presentational: it shows the
 * options from `scenario.decisionPrompts[role]`, and on a choice calls
 * `onRecord(nextLog)` with the log returned by `recordDecision` at the current
 * cursor sim-time. The owner keeps the log; this component keeps none.
 *
 * Lock: the gate is `isLocked` / `recordDecision` in `log.ts`. Once the cursor
 * reaches the next beat the options are disabled and one plain sentence says
 * the decision is fixed. A rejected attempt (`reason: "locked"`) shows the
 * sentence from `log.ts` and the original choice stays on screen.
 *
 * No correctness affordance: options are plain text buttons, the chosen one is
 * marked only by `aria-pressed` and a heavier weight, never by colour, icon or
 * score. Number keys 1..n choose an option unless focus is in a text field.
 */
import { useEffect, useMemo, useState } from "react";
import { decisionFor, deriveState, isLocked, recordDecision, type ConsoleLog } from "./log";
import type { ConsoleLogEntry, RoleId, Scenario } from "./types";
import "./decision.css";

export interface DecisionPromptProps {
  readonly scenario: Scenario;
  readonly role: RoleId;
  readonly log: ConsoleLog;
  readonly onRecord: (nextLog: ConsoleLogEntry[]) => void;
}

export const FIXED_SENTENCE = "This decision is fixed. The next beat has already begun.";

/** Sim-time is whole sim-minutes in this scenario format. */
export function formatSimTime(simTime: number): string {
  return `sim-minute ${simTime}`;
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function DecisionPrompt({ scenario, role, log, onRecord }: DecisionPromptProps) {
  const prompt = Object.prototype.hasOwnProperty.call(scenario.decisionPrompts, role)
    ? scenario.decisionPrompts[role]
    : undefined;
  const state = useMemo(() => deriveState(scenario, log), [scenario, log]);
  const decision = decisionFor(state, role);
  const locked = decision !== undefined && isLocked(state, decision);
  const [notice, setNotice] = useState<string | null>(null);

  const choose = (optionId: string) => {
    if (locked) return;
    if (decision?.optionId === optionId) return;
    const result = recordDecision(scenario, log, {
      role,
      optionId,
      recordedAtSimTime: state.cursorSimTime,
    });
    if (result.ok) {
      setNotice(null);
      onRecord(result.log);
    } else {
      setNotice(result.message);
    }
  };

  useEffect(() => {
    if (!prompt || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const option = prompt.options[Number(e.key) - 1];
      if (option) choose(option.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!prompt) return null;
  const chosen = decision && prompt.options.find((o) => o.id === decision.optionId);
  const headingId = `decision-prompt-${role}`;

  return (
    <section className="decision" aria-labelledby={headingId}>
      <p className="decision-prompt" id={headingId}>
        {prompt.prompt}
      </p>
      <ul className="decision-options">
        {prompt.options.map((o, i) => (
          <li key={o.id}>
            <button
              type="button"
              className="decision-option"
              disabled={locked}
              aria-pressed={decision?.optionId === o.id}
              aria-keyshortcuts={String(i + 1)}
              onClick={() => choose(o.id)}
            >
              <span className="decision-key" aria-hidden="true">
                {i + 1}
              </span>
              <span>{o.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {decision && chosen && (
        <p className="decision-chosen">
          You chose: {chosen.label} at <span className="decision-time">{formatSimTime(decision.recordedAtSimTime)}</span>.
        </p>
      )}
      {locked ? (
        <p className="decision-note">{notice ?? FIXED_SENTENCE}</p>
      ) : (
        notice && <p className="decision-note">{notice}</p>
      )}
    </section>
  );
}
