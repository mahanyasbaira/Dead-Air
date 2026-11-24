// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { DecisionPrompt, FIXED_SENTENCE } from "./DecisionPrompt";
import { decisionFor, deriveState, emptyLog } from "./log";
import type { ConsoleLogEntry, RoleId } from "./types";

const scenario = staticOnChannel9;

function wire(simTime: number): ConsoleLogEntry {
  return {
    kind: "wire",
    event: { kind: "received", simTime, sender: "a", recipient: "b", payload: new Uint8Array() },
  };
}

/** Holds the log the way the run host will, and exposes it to the test. */
function setup(role: RoleId = "dispatch", start: readonly ConsoleLogEntry[] = emptyLog) {
  const box: { log: readonly ConsoleLogEntry[] } = { log: start };
  function Host() {
    const [log, setLog] = useState<readonly ConsoleLogEntry[]>(start);
    box.log = log;
    return (
      <>
        <DecisionPrompt scenario={scenario} role={role} log={log} onRecord={(l) => setLog(l)} />
        <button type="button" onClick={() => setLog((l) => [...l, wire(1)])}>
          Advance
        </button>
      </>
    );
  }
  render(<Host />);
  return box;
}

const chosen = (box: { log: readonly ConsoleLogEntry[] }, role: RoleId) =>
  decisionFor(deriveState(scenario, box.log), role);

describe("DecisionPrompt", () => {
  it("renders the options for each role from the real scenario", () => {
    for (const role of Object.keys(scenario.decisionPrompts)) {
      const { unmount } = render(
        <DecisionPrompt scenario={scenario} role={role} log={emptyLog} onRecord={() => {}} />,
      );
      for (const o of scenario.decisionPrompts[role].options) {
        expect(screen.getByRole("button", { name: o.label })).toBeTruthy();
      }
      unmount();
    }
  });

  it("records a choice at the current sim-time and says so in plain text", async () => {
    const box = setup();
    await userEvent.click(screen.getByRole("button", { name: "Suggest holding the acoustic set" }));
    expect(chosen(box, "dispatch")).toEqual({
      role: "dispatch",
      optionId: "d-hold",
      recordedAtSimTime: 0,
    });
    expect(screen.getByText(/You chose: Suggest holding the acoustic set at/).textContent).toContain(
      "sim-minute 0",
    );
  });

  it("records the cursor sim-time when the cursor has moved", async () => {
    const box = setup("field", [wire(3)]);
    await userEvent.click(screen.getByRole("button", { name: "Pause the acoustic set" }));
    expect(chosen(box, "field")?.recordedAtSimTime).toBe(3);
  });

  it("replaces the choice when changed before the lock", async () => {
    const box = setup();
    await userEvent.click(screen.getByRole("button", { name: "Suggest holding the acoustic set" }));
    await userEvent.click(screen.getByRole("button", { name: "Ask Field Lead for a status check" }));
    expect(chosen(box, "dispatch")?.optionId).toBe("d-ask");
    expect(screen.getByText(/You chose: Ask Field Lead for a status check/)).toBeTruthy();
    expect(screen.queryByText(FIXED_SENTENCE)).toBeNull();
  });

  it("disables the options after the next beat and keeps the original choice", async () => {
    const box = setup();
    await userEvent.click(screen.getByRole("button", { name: "Suggest holding the acoustic set" }));
    await userEvent.click(screen.getByRole("button", { name: "Advance" }));
    for (const o of scenario.decisionPrompts.dispatch.options) {
      expect((screen.getByRole("button", { name: o.label }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(FIXED_SENTENCE)).toBeTruthy();
    expect(screen.getByText(/You chose: Suggest holding the acoustic set/)).toBeTruthy();
    await userEvent.keyboard("2");
    expect(chosen(box, "dispatch")?.optionId).toBe("d-hold");
  });

  it("chooses by number key", async () => {
    const box = setup();
    await userEvent.keyboard("3");
    expect(chosen(box, "dispatch")?.optionId).toBe("d-ask");
  });

  it("chooses by Tab and Enter", async () => {
    const box = setup();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(chosen(box, "dispatch")?.optionId).toBe("d-continue");
  });
});

// Task 10.2: no correctness affordance for any option of any role.
describe("DecisionPrompt shows no correctness affordance", () => {
  const banned = ["correct", "incorrect", "wrong", "right answer", "score", "✓", "✗", "✔"];

  for (const role of Object.keys(scenario.decisionPrompts)) {
    const options = scenario.decisionPrompts[role].options;
    for (const o of options) {
      it(`${role}: ${o.id}`, async () => {
        const box = setup(role);
        await userEvent.click(screen.getByRole("button", { name: o.label }));
        expect(chosen(box, role)?.optionId).toBe(o.id);
        const text = (document.body.textContent ?? "").toLowerCase();
        for (const word of banned) expect(text).not.toContain(word);
        expect(screen.queryAllByRole("img")).toHaveLength(0);
      });
    }
  }
});
