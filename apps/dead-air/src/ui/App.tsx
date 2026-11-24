import { useMemo, useReducer, useState } from "react";
import { eventsForRole } from "hindsight";
import {
  buildDebrief,
  initialState,
  nextSimTime,
  reduce,
  timelineSteps,
  type Action,
} from "hindsight";
import { staticOnChannel9 } from "../scenarios/static-on-channel-9";
import type { RoleId, SimState } from "hindsight";
import { RoleView } from "./RoleView";
import { Debrief } from "./Debrief";

type Phase = "intro" | "play" | "debrief";

function engineReducer(state: SimState, action: Action): SimState {
  return reduce(state, action);
}

export function App() {
  const scenario = staticOnChannel9;
  const [state, dispatch] = useReducer(engineReducer, scenario, initialState);
  const [phase, setPhase] = useState<Phase>("intro");
  const [role, setRole] = useState<RoleId>("dispatch");

  const steps = useMemo(() => timelineSteps(scenario), [scenario]);
  const lastStep = steps[steps.length - 1];
  const atEnd = state.cursorSimTime >= lastStep;
  const stepIndex = steps.indexOf(state.cursorSimTime);

  const visibleEvents = useMemo(
    () => eventsForRole(scenario.events, role, state.cursorSimTime),
    [scenario, role, state.cursorSimTime],
  );

  const debrief = useMemo(() => buildDebrief(state), [state]);

  function restart() {
    dispatch({ type: "reset" });
    setPhase("intro");
    setRole("dispatch");
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to main content</a>

      <div className="sim-banner" role="note" aria-label="Simulation notice">
        SIMULATION — fictional exercise, not real
        <span className="mode">
          Demo mode: all data is synthetic. No accounts, network alerts, or real advice.
        </span>
      </div>

      <header>
        <h1>{scenario.title}</h1>
        <p className="muted">{scenario.simulationNotice}</p>
      </header>

      <main id="main">
        {phase === "intro" && (
          <section className="panel" aria-labelledby="intro-h">
            <h2 id="intro-h">About this exercise</h2>
            <p>{scenario.summary}</p>
            <h2>Roles</h2>
            <ul>
              {scenario.roles.map((r) => (
                <li key={r.id}>
                  <strong>{r.name}:</strong> {r.blurb}
                </li>
              ))}
            </ul>
            <p className="muted">
              You will switch between both roles in one browser. This is a demonstration,
              not secure multi-user access control. One fictional message is delayed on
              purpose — watch for the "dead air".
            </p>
            <button className="btn primary" onClick={() => setPhase("play")}>
              Start the exercise
            </button>
          </section>
        )}

        {phase === "play" && (
          <section aria-labelledby="play-h">
            <h2 id="play-h">
              Timeline step{" "}
              <span className="progress-text">
                {stepIndex + 1} of {steps.length}
              </span>{" "}
              <span className="muted">(sim-minute {state.cursorSimTime})</span>
            </h2>

            <div className="role-tabs" role="tablist" aria-label="Choose a role to view">
              {scenario.roles.map((r) => (
                <button
                  key={r.id}
                  role="tab"
                  id={`tab-${r.id}`}
                  aria-selected={role === r.id}
                  aria-pressed={role === r.id}
                  aria-controls="role-panel"
                  className={`btn ${role === r.id ? "primary" : ""}`}
                  onClick={() => setRole(r.id)}
                >
                  View as {r.name}
                </button>
              ))}
            </div>

            <RoleView
              scenario={scenario}
              role={role}
              visibleEvents={visibleEvents}
              currentSimTime={state.cursorSimTime}
              decision={state.decisions.find((d) => d.role === role)}
              onRecord={(optionId) =>
                dispatch({
                  type: "recordDecision",
                  decision: {
                    role,
                    optionId,
                    recordedAtSimTime: state.cursorSimTime,
                  },
                })
              }
            />

            <div className="row" style={{ marginTop: "1rem" }}>
              {!atEnd && (
                <button
                  className="btn primary"
                  onClick={() =>
                    dispatch({ type: "jumpTo", simTime: nextSimTime(scenario, state.cursorSimTime) })
                  }
                >
                  Advance timeline
                </button>
              )}
              {atEnd && (
                <button className="btn primary" onClick={() => setPhase("debrief")}>
                  Go to debrief
                </button>
              )}
              <button className="btn" onClick={restart}>
                Reset demo
              </button>
            </div>
            <p className="muted" aria-live="polite">
              {atEnd
                ? "End of timeline reached. Review the debrief for who knew what, when."
                : "Advance the shared timeline, switch roles, and record each role's choice."}
            </p>
          </section>
        )}

        {phase === "debrief" && (
          <section aria-labelledby="debrief-h">
            <h2 id="debrief-h">Debrief — who knew what, when</h2>
            <Debrief debrief={debrief} scenario={scenario} />
            <div className="row" style={{ marginTop: "1rem" }}>
              <button className="btn" onClick={() => setPhase("play")}>
                Back to timeline
              </button>
              <button className="btn primary" onClick={restart}>
                Reset demo
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="muted">
        Dead Air is a fictional tabletop SIMULATION built for discussion. It is not an
        emergency product and gives no real-world advice.
      </footer>
    </div>
  );
}
