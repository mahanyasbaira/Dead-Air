import type { RecordedDecision, RoleId, Scenario, SimEvent } from "hindsight";

const typeLabel: Record<SimEvent["type"], string> = {
  info: "Info",
  message_created: "Message sent",
  message_delivered: "Message received",
  decision: "Decision",
  debrief: "Debrief",
};

function eventClass(type: SimEvent["type"]): string {
  if (type === "message_created") return "event created";
  if (type === "message_delivered") return "event delivered";
  return "event";
}

export interface RoleViewProps {
  scenario: Scenario;
  role: RoleId;
  visibleEvents: SimEvent[];
  currentSimTime: number;
  decision?: RecordedDecision;
  onRecord: (optionId: string) => void;
}

export function RoleView({
  scenario,
  role,
  visibleEvents,
  currentSimTime,
  decision,
  onRecord,
}: RoleViewProps) {
  const roleInfo = scenario.roles.find((r) => r.id === role)!;
  const prompt = scenario.decisionPrompts[role];

  return (
    <div
      className="panel"
      id="role-panel"
      role="tabpanel"
      aria-labelledby={`tab-${role}`}
    >
      <p>
        <strong>{roleInfo.name}.</strong> {roleInfo.blurb}
      </p>

      <h3>What {roleInfo.name} knows so far</h3>
      {visibleEvents.length === 0 && (
        <p className="muted">Nothing has reached this role yet.</p>
      )}
      <ol aria-label={`Events visible to ${roleInfo.name}`}>
        {visibleEvents.map((e) => (
          <li key={e.id} className={eventClass(e.type)}>
            <span className="time">sim-minute {e.simTime}</span>
            <span className="tag">{typeLabel[e.type]}</span>
            <div>
              <strong>{e.title}</strong>
            </div>
            <div>{e.body}</div>
          </li>
        ))}
      </ol>

      <fieldset>
        <legend>
          Record this role's choice{" "}
          {decision ? (
            <span className="status-pill">Recorded at sim-minute {decision.recordedAtSimTime}</span>
          ) : (
            <span className="status-pill">Not recorded yet</span>
          )}
        </legend>
        <p>{prompt.prompt}</p>
        {prompt.options.map((opt) => {
          const id = `${role}-${opt.id}`;
          const checked = decision?.optionId === opt.id;
          return (
            <label className="radio-option" htmlFor={id} key={opt.id}>
              <input
                type="radio"
                id={id}
                name={`decision-${role}`}
                value={opt.id}
                checked={checked}
                onChange={() => onRecord(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
        <p className="muted" aria-live="polite">
          {decision
            ? `Choice recorded at sim-minute ${decision.recordedAtSimTime} (current sim-minute ${currentSimTime}).`
            : "No choice recorded for this role yet."}
        </p>
      </fieldset>
    </div>
  );
}
