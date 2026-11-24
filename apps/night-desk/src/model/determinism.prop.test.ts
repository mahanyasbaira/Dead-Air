import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { layoutReplay, layoutWorldlines } from "hindsight/replay";
import type { Scenario } from "hindsight";
import { nights } from "../nights";
import { emptyLog, fixtureScenario, fixtureScript } from "./fixtures";
import { applyAction, availableActions, foldNight } from "./night";
import { toLedger, toParticipants, toReplayScenario } from "./replay-input";
import type { DeskScript, NightLog, NightState } from "./types";

interface Case {
  script: DeskScript;
  scenario: Scenario;
}

const cases: Case[] = [
  ...nights.map((n) => ({ script: n.script, scenario: n.scenario })),
  { script: fixtureScript, scenario: fixtureScenario },
];

function must<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** Build a log by repeatedly choosing among the available actions with the given choice numbers. */
function walk(script: DeskScript, picks: readonly number[]): NightLog {
  let log = emptyLog(script);
  let state = must(foldNight(script, log));
  for (const c of picks) {
    const options = availableActions(script, state);
    if (options.length === 0) break;
    log = must(applyAction(script, log, options[c % options.length].id));
    state = must(foldNight(script, log));
  }
  return log;
}

/** The same choices again, entry by entry, through applyAction. */
function rebuild(script: DeskScript, log: NightLog): NightLog {
  let out = emptyLog(script);
  for (const e of log.entries) {
    out = must(applyAction(script, out, e.actionId, { itemId: e.itemId, facts: e.facts }));
  }
  return out;
}

function views(c: Case, log: NightLog, state: NightState) {
  const ledger = toLedger(c.script, log);
  const scenario = toReplayScenario(c.scenario, c.script, state);
  return {
    ledger,
    replay: layoutReplay(ledger, scenario),
    worldlines: layoutWorldlines({ ledger, scenario, participants: toParticipants(c.scenario) }),
    worldlinesAt: layoutWorldlines({ ledger, scenario, participants: toParticipants(c.scenario) }, { at: 12 }),
  };
}

const picksArb = fc.array(fc.nat(50), { maxLength: 40 });

describe("determinism", () => {
  // Feature: night-desk, Property 6: Same scenario and same choices give the same replay
  it("Property 6: two folds, and a log rebuilt through applyAction, give equal state, ledger and layouts", () => {
    fc.assert(
      fc.property(fc.constantFrom(...cases), picksArb, (c, picks) => {
        const log = walk(c.script, picks);
        const rebuilt = rebuild(c.script, log);
        const clone: NightLog = JSON.parse(JSON.stringify(log));

        const a = must(foldNight(c.script, log));
        const b = must(foldNight(c.script, log));
        const r = must(foldNight(c.script, rebuilt));
        const k = must(foldNight(c.script, clone));
        expect(b).toEqual(a);
        expect(r).toEqual(a);
        expect(k).toEqual(a);
        expect(rebuilt).toEqual(log);

        const va = views(c, log, a);
        const vb = views(c, log, b);
        const vr = views(c, rebuilt, r);
        expect(vb).toEqual(va);
        expect(vr).toEqual(va);
      }),
      { numRuns: 150 },
    );
  });

  // Feature: night-desk, Property 6: the seed is used (example)
  it("different seeds can give different missed sets when a busy player may lapse", () => {
    // The shipped fixture has lapse: 1 on i6, which drops it for every seed, so this
    // variant uses a fractional lapse on a copy. The fixture itself is unchanged.
    const lapsing = (seed: number): DeskScript => ({
      ...fixtureScript,
      seed,
      items: fixtureScript.items.map((i) => (i.id === "i6" ? { ...i, lapse: 0.5 } : i)),
    });
    // Eight "log" actions of 2 minutes each: the one at minute 16 is busy over (16, 18), covering i6 at 17.
    const missedFor = (seed: number): string => {
      const script = lapsing(seed);
      let log = emptyLog(script);
      for (let n = 0; n < 9; n++) log = must(applyAction(script, log, "log"));
      return JSON.stringify(must(foldNight(script, log)).missed.map((m) => m.id));
    };
    const sets = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) sets.add(missedFor(seed));
    expect(sets.size).toBeGreaterThan(1);
    // And the same seed twice gives the same set.
    expect(missedFor(7)).toBe(missedFor(7));
  });

  it("the fixture's lapse item has lapse 1, so its outcome does not depend on the seed", () => {
    expect(fixtureScript.items.find((i) => i.lapse !== undefined)?.lapse).toBe(1);
  });
});
