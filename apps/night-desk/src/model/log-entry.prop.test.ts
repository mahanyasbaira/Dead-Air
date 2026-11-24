import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nights } from "../nights";
import { emptyLog, fixtureScript } from "./fixtures";
import { applyAction, availableActions, foldNight } from "./night";
import type { DeskScript, NightLog, NightState } from "./types";

const scripts: DeskScript[] = [...nights.map((n) => n.script), fixtureScript];

/** Walk a script by choosing among the available actions; every prefix is a reachable state. */
function reach(script: DeskScript, picks: readonly number[]): { log: NightLog; state: NightState } {
  let log = emptyLog(script);
  let folded = foldNight(script, log);
  if (!folded.ok) throw new Error(folded.error.message);
  for (const pick of picks) {
    const options = availableActions(script, folded.value);
    if (options.length === 0) break;
    const next = applyAction(script, log, options[pick % options.length].id);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
    folded = foldNight(script, log);
    if (!folded.ok) throw new Error(folded.error.message);
  }
  return { log, state: folded.value };
}

const picks = fc.array(fc.nat(50), { maxLength: 40 });

describe("log entry", () => {
  // Feature: night-desk, Property 5: A log entry records known facts and the current time
  it("Property 5: any subset of delivered items is recorded at the current clock; any unknown fact is rejected", () => {
    // **Validates: Requirements 2.5**
    fc.assert(
      fc.property(
        fc.constantFrom(...scripts),
        picks,
        fc.array(fc.boolean(), { maxLength: 30 }),
        fc.array(fc.string({ maxLength: 6 }), { maxLength: 3 }),
        (script, walk, mask, noise) => {
          const { log, state } = reach(script, walk);
          const before = JSON.stringify(log);
          const logAction = script.actions.find((a) => a.kind === "log");
          expect(logAction).toBeDefined();
          if (logAction === undefined) return;

          if (state.ended) {
            // Nothing can be written once the night is over.
            const r = applyAction(script, log, logAction.id, { facts: [] });
            expect(r.ok).toBe(false);
            expect(JSON.stringify(log)).toBe(before);
            return;
          }

          const known = state.delivered.map((d) => d.id);
          const subset = known.filter((_, i) => mask[i] === true);
          const ok = applyAction(script, log, logAction.id, { facts: subset });
          expect(ok.ok).toBe(true);
          if (ok.ok) {
            const entry = ok.value.entries[ok.value.entries.length - 1];
            expect(ok.value.entries).toHaveLength(log.entries.length + 1);
            expect(entry.at).toBe(state.now);
            expect(entry.actionId).toBe(logAction.id);
            expect(entry.facts).toEqual(subset);
            const refolded = foldNight(script, ok.value);
            expect(refolded.ok).toBe(true);
            if (refolded.ok) expect(refolded.value.now).toBe(state.now + logAction.cost);
          }

          // A fact that has not reached the player: an item still to come, a missed one, or noise.
          const unknown = [
            ...script.items.map((i) => i.id).filter((id) => !known.includes(id)),
            ...noise.filter((s) => !known.includes(s)),
          ];
          for (const bad of unknown) {
            const r = applyAction(script, log, logAction.id, { facts: [...subset, bad] });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error.kind).toBe("unknown-fact");
            expect(JSON.stringify(log)).toBe(before);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
