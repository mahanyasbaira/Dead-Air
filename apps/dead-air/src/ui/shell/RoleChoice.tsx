/** RoleChoice: one button per scenario role. The second interaction of a Solo run. */
import type { RoleId, Scenario } from "./types";

export interface RoleChoiceProps {
  scenario: Scenario;
  onChoose: (role: RoleId) => void;
}

export function RoleChoice({ scenario, onChoose }: RoleChoiceProps) {
  return (
    <section className="run-roles" aria-labelledby="run-roles-title">
      <h2 id="run-roles-title" className="run-h">Choose your role</h2>
      <ul className="run-list">
        {scenario.roles.map((r) => (
          <li key={r.id} className="run-row">
            <button type="button" className="run-btn" aria-describedby={`run-role-${r.id}`} onClick={() => onChoose(r.id)}>
              {r.name}
            </button>
            <p id={`run-role-${r.id}`} className="run-sentence">{r.blurb}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
