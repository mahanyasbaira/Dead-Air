import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nights } from "../nights";
import { emptyLog, fixtureScript } from "./fixtures";
import { applyAction, availableActions, foldNight } from "./night";
import type { DeskScript, NightLog, NightState } from "./types";

const scripts: DeskScript[] = [...nights.map((n) => n.script), fixtureScript];

/** Walk a script by picking from the available actions with the given choice numbers. */
function walk(script: DeskScript, choices: readonly number[], allowStaff: boolean): { log: NightLog; states: NightState[] } {
  let log = emptyLog(script);
  const first = foldNight(script, log);
  if (!first.ok) throw new Error(first.error.message);
  const states = [first.value];
  for (const c of choices) {
    const state = states[states.length - 1];
    const options = availableActions(script, state).filter((a) => allowStaff || a.kind !== "callStaff");
    if (options.length === 0) break;
    const next = applyAction(script, log, options[c % options.length].id);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
    const folded = foldNight(script, log);
    if (!folded.ok) throw new Error(folded.error.message);
    states.push(folded.value);
  }
  return { log, states };
}

const choices = fc.array(fc.nat(50), { maxLength: 40 });

describe("availableActions", () => {
  it("covers the shipped nights and the fixture", () => {
    expect(scripts.length).toBeGreaterThanOrEqual(2);
  });

  // Feature: night-desk, Property 4: The staff member on call is always offered and never forced
  it("Property 4: a night in progress always offers the staff call, and the fold never inserts one", () => {
    fc.assert(
      fc.property(fc.constantFrom(...scripts), choices, (script, picks) => {
        const { states } = walk(script, picks, true);
        for (const s of states) {
          if (s.ended) continue;
          expect(availableActions(script, s).some((a) => a.kind === "callStaff")).toBe(true);
        }
        const noCall = walk(script, picks, false);
        for (const s of noCall.states) expect(s.staffCalledAt).toBeNull();
        expect(noCall.log.entries.some((e) => script.actions.find((a) => a.id === e.actionId)?.kind === "callStaff")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: night-desk, Property 4: A finished night offers nothing, so there is nothing to force
  it("a finished night offers no actions", () => {
    for (const script of scripts) {
      const { states } = walk(script, Array.from({ length: 60 }, () => 0), true);
      const last = states[states.length - 1];
      expect(last.ended).toBe(true);
      expect(availableActions(script, last)).toEqual([]);
    }
  });
});
