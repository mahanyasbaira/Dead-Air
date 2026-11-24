import { describe, expect, it } from "vitest";
import { currentStep } from "./guide";
import { applyAction, foldNight } from "./night";
import { emptyLog, fixtureScript, unguidedScript } from "./fixtures";

function stateAfter(ids: string[], script = fixtureScript) {
  let log = emptyLog(script);
  for (const id of ids) {
    const r = applyAction(script, log, id);
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  const s = foldNight(script, log);
  if (!s.ok) throw new Error(s.error.message);
  return s.value;
}

describe("currentStep", () => {
  it("returns the first step, one at a time", () => {
    expect(currentStep(fixtureScript, stateAfter([]))?.id).toBe("g1");
  });

  it("moves to the next step once the action is taken", () => {
    expect(currentStep(fixtureScript, stateAfter(["read"]))?.id).toBe("g2");
  });

  it("matches a step by action kind", () => {
    expect(currentStep(fixtureScript, stateAfter(["board", "wait"]))?.id).toBe("g1");
    expect(currentStep(fixtureScript, stateAfter(["read", "wait"]))).toBeNull();
  });

  it("returns null when the script is not guided", () => {
    expect(currentStep(unguidedScript, stateAfter([], unguidedScript))).toBeNull();
  });
});
