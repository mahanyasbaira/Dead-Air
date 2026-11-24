import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nights } from "../nights";
import { emptyLog, fixtureScript } from "./fixtures";
import { habits } from "./habits";
import { applyAction, availableActions, foldNight } from "./night";
import type { DeskScript, NightLog, NightState } from "./types";

const base: DeskScript[] = [...nights.map((n) => n.script), fixtureScript];

/** A base script with a random subset of its items marked, or unmarked. */
const scriptArb = fc
  .tuple(fc.constantFrom(...base), fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }))
  .map(([script, marks]): DeskScript => ({
    ...script,
    items: script.items.map((item, i) => {
      const { needsProfessional: _drop, ...rest } = item;
      return marks[i % marks.length] ? { ...rest, needsProfessional: true as const } : rest;
    }),
  }));

const picks = fc.array(
  fc.record({ action: fc.nat(50), item: fc.nat(50), facts: fc.array(fc.nat(50), { maxLength: 4 }), useItem: fc.boolean() }),
  { maxLength: 40 },
);

function walk(script: DeskScript, steps: readonly { action: number; item: number; facts: number[]; useItem: boolean }[]): {
  log: NightLog;
  state: NightState;
} {
  let log = emptyLog(script);
  let folded = foldNight(script, log);
  if (!folded.ok) throw new Error(folded.error.message);
  for (const s of steps) {
    const state = folded.value;
    const options = availableActions(script, state);
    if (options.length === 0) break;
    const opts: { itemId?: string; facts?: string[] } = {};
    if (state.delivered.length > 0) {
      if (s.useItem) opts.itemId = state.delivered[s.item % state.delivered.length].id;
      if (s.facts.length > 0) opts.facts = s.facts.map((f) => state.delivered[f % state.delivered.length].id);
    }
    const next = applyAction(script, log, options[s.action % options.length].id, opts);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
    folded = foldNight(script, log);
    if (!folded.ok) throw new Error(folded.error.message);
  }
  return { log, state: folded.value };
}

const isMinute = (n: number | null): boolean => n === null || (Number.isInteger(n) && n >= 0);

describe("habits properties", () => {
  // Feature: night-desk, Property 8: Habit figures are a pure function of the log and are never negative
  it("Property 8: pure, never negative, bounded, and null when no call was made", () => {
    fc.assert(
      fc.property(scriptArb, picks, (script, steps) => {
        const { state } = walk(script, steps);
        const a = habits(script, state);
        expect(habits(script, state)).toEqual(a);
        expect(isMinute(a.acknowledgement.meanMinutes)).toBe(true);
        expect(isMinute(a.acknowledgement.longestMinutes)).toBe(true);
        expect(isMinute(a.professional.minutes)).toBe(true);
        expect(a.acknowledgement.unacknowledged).toBeGreaterThanOrEqual(0);
        expect(a.acknowledgement.unacknowledged).toBeLessThanOrEqual(state.delivered.length);
        expect(a.written.known).toBe(state.delivered.length);
        expect(a.written.written).toBeLessThanOrEqual(a.written.known);
        expect(a.written.unwritten.length).toBe(a.written.known - a.written.written);
        const marked = script.items.some((i) => i.needsProfessional === true);
        const called = state.entries.some((e) => script.actions.find((x) => x.id === e.actionId)?.kind === "callStaff");
        expect(a.professional.moments > 0).toBe(marked);
        if (marked && !called) {
          expect(a.professional.minutes).toBeNull();
          expect(a.professional.moments).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });
});
