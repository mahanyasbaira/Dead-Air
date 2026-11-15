import type { Debrief as DebriefData } from "../engine/reducer";
import type { Scenario } from "../engine/types";

const roleName = (scenario: Scenario, id: string) =>
  scenario.roles.find((r) => r.id === id)?.name ?? id;

export interface DebriefProps {
  debrief: DebriefData;
  scenario: Scenario;
}

export function Debrief({ debrief, scenario }: DebriefProps) {
  return (
    <div>
      <div className="panel">
        <h3>Delayed messages (the "dead air")</h3>
        {debrief.messageTimings.length === 0 && (
          <p className="muted">No delayed messages in this scenario.</p>
        )}
        <table>
          <thead>
            <tr>
              <th scope="col">Message</th>
              <th scope="col">Created (sim-min)</th>
              <th scope="col">Delivered (sim-min)</th>
              <th scope="col">Gap</th>
            </tr>
          </thead>
          <tbody>
            {debrief.messageTimings.map((m) => (
              <tr key={m.messageId}>
                <td>{m.title}</td>
                <td>{m.createdAtSimTime}</td>
                <td>{m.deliveredAtSimTime ?? "never"}</td>
                <td>
                  {m.gapSimTime === null ? (
                    "—"
                  ) : (
                    <span className="deadair">{m.gapSimTime} sim-minutes of dead air</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Recorded decisions</h3>
        {debrief.decisions.length === 0 ? (
          <p className="muted">No decisions were recorded in this play-through.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Choice</th>
                <th scope="col">Recorded at (sim-min)</th>
              </tr>
            </thead>
            <tbody>
              {debrief.decisions.map((d) => (
                <tr key={d.role}>
                  <td>{roleName(scenario, d.role)}</td>
                  <td>{d.optionLabel}</td>
                  <td>{d.recordedAtSimTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">
          Compare each decision's sim-minute against when the delayed message was
          delivered above. A choice recorded before delivery was made without that note.
        </p>
      </div>

      <div className="panel">
        <h3>Full shared timeline</h3>
        <ol aria-label="Full ordered timeline">
          {debrief.orderedEvents.map((e) => (
            <li key={e.id} className="event">
              <span className="time">sim-minute {e.simTime}</span>{" "}
              <strong>{e.title}</strong>
              <div className="muted">
                Audience: {e.audience === "all" ? "everyone" : roleName(scenario, e.audience)}
              </div>
              <div>{e.body}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="panel">
        <h3>Discussion prompts (facilitator)</h3>
        <ul>
          {debrief.discussionPrompts.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <p className="muted">
          These are conversation starters for a fictional exercise. They are not
          real-world safety guidance.
        </p>
      </div>
    </div>
  );
}
