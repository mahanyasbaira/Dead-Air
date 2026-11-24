import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nights } from "../nights";
import { fakeStorage } from "../test-storage";
import { decodeLog, encodeLog } from "./codec";
import { emptyLog, fixtureScript } from "./fixtures";
import { applyAction, availableActions, foldNight } from "./night";
import { LOG_KEY, loadSaved, save } from "./storage";
import type { DeskScript, NightLog } from "./types";

const scripts: DeskScript[] = [...nights.map((n) => n.script), fixtureScript];
const lookup = (id: string): DeskScript | undefined => scripts.find((s) => s.id === id);

/** Build a valid log by choosing among the available actions; log actions record a subset of known facts. */
function build(script: DeskScript, picks: readonly number[], mask: readonly boolean[]): NightLog {
  let log = emptyLog(script);
  for (const pick of picks) {
    const folded = foldNight(script, log);
    if (!folded.ok) throw new Error(folded.error.message);
    const options = availableActions(script, folded.value);
    if (options.length === 0) break;
    const action = options[pick % options.length];
    const opts =
      action.kind === "log"
        ? { facts: folded.value.delivered.map((d) => d.id).filter((_, i) => mask[i % Math.max(mask.length, 1)] ?? false) }
        : {};
    const next = applyAction(script, log, action.id, opts);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
  }
  return log;
}

const picks = fc.array(fc.nat(50), { maxLength: 40 });
const mask = fc.array(fc.boolean(), { maxLength: 12 });

describe("codec and restore", () => {
  // Feature: night-desk, Property 7: The log codec round-trips and restores the same night
  it("Property 7: a log round-trips, saves, and restores to the same night; a bad token is an error, not a throw", () => {
    // **Validates: Requirements 4.4, 6.3**
    fc.assert(
      fc.property(fc.constantFrom(...scripts), picks, mask, (script, walk, facts) => {
        const log = build(script, walk, facts);
        const decoded = decodeLog(encodeLog(log));
        expect(decoded).toEqual({ ok: true, value: log });
        expect(decoded.ok && foldNight(script, decoded.value)).toEqual(foldNight(script, log));

        const storage = fakeStorage();
        expect(save(storage, log)).toBe(true);
        const saved = loadSaved(storage, lookup);
        const original = foldNight(script, log);
        expect(saved.kind).toBe("resume");
        if (saved.kind === "resume" && original.ok) {
          expect(saved.log).toEqual(log);
          expect(saved.ended).toBe(original.value.ended);
          expect(foldNight(script, saved.log)).toEqual(original);
        }
        // Reading never writes.
        expect(storage.calls.setItem).toHaveLength(1);
        expect(storage.calls.removeItem).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: night-desk, Property 7: The log codec round-trips and restores the same night
  it("Property 7: arbitrary and truncated tokens return an error and never throw", () => {
    // **Validates: Requirements 4.4, 6.3**
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.constantFrom(...scripts), picks, fc.integer({ min: 1, max: 20 }), (junk, script, walk, cut) => {
        expect(decodeLog(junk).ok).toBe(false);
        const token = encodeLog(build(script, walk, []));
        expect(decodeLog(token.slice(0, Math.max(0, token.length - cut))).ok).toBe(false);
        // The same junk in storage is "unusable", and is never removed or overwritten by loading it.
        const storage = fakeStorage({ [LOG_KEY]: junk });
        const saved = loadSaved(storage, lookup);
        expect(saved.kind === "unusable" || saved.kind === "none").toBe(true);
        expect(storage.data.get(LOG_KEY)).toBe(junk);
      }),
      { numRuns: 200 },
    );
  });
});
