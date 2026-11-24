import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Scenario } from "hindsight";
import { nights } from "../nights";
import { formatClock } from "./clock-format";
import { emptyLog, fixtureScenario, fixtureScript } from "./fixtures";
import { narrate } from "./narrate";
import { applyAction, availableActions, foldNight } from "./night";
import { toLedger } from "./replay-input";
import type { DeskScript, NightLog, NightState } from "./types";

const cases: { scenario: Scenario; script: DeskScript }[] = [
  ...nights.map((n) => ({ scenario: n.scenario, script: n.script })),
  { scenario: fixtureScenario, script: fixtureScript },
];

function walk(script: DeskScript, choices: readonly number[]): { log: NightLog; state: NightState } {
  let log = emptyLog(script);
  let state = foldNight(script, log);
  if (!state.ok) throw new Error(state.error.message);
  for (const c of choices) {
    const options = availableActions(script, state.value);
    if (options.length === 0) break;
    const next = applyAction(script, log, options[c % options.length].id);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
    state = foldNight(script, log);
    if (!state.ok) throw new Error(state.error.message);
  }
  return { log, state: state.value };
}

const JUDGEMENT = /\b(should|ought|better|mistake|wrong|correct)/i;

describe("narrate properties", () => {
  it("covers the shipped nights and the fixture", () => {
    expect(cases.length).toBeGreaterThanOrEqual(2);
  });

  // Feature: night-desk, Property 9: The replay text has one sentence per decision
  it("Property 9: one sentence per decision, with its clock text, naming what had arrived and nothing later", () => {
    fc.assert(
      fc.property(fc.constantFrom(...cases), fc.array(fc.nat(50), { maxLength: 40 }), ({ scenario, script }, picks) => {
        const { log, state } = walk(script, picks);
        const out = narrate(scenario, script, log, state, toLedger(script, log));
        expect(out.decisions).toHaveLength(log.entries.length);
        const titleOf = (id: string) => scenario.events.find((e) => e.id === id && e.type === "message_created")?.title ?? "";
        out.decisions.forEach((sentence, n) => {
          const entry = log.entries[n];
          expect(sentence).toContain(formatClock(script.startClock + entry.at));
          const label = script.actions.find((a) => a.id === entry.actionId)?.label ?? "";
          const body = sentence.replace(`"${label}"`, "");
          const arrived = state.delivered.filter((d) => d.deliveredAt <= entry.at);
          const later = state.delivered.filter((d) => d.deliveredAt > entry.at);
          for (const d of arrived) expect(body).toContain(titleOf(d.id));
          const arrivedTitles = arrived.map((d) => titleOf(d.id));
          for (const d of later) {
            const t = titleOf(d.id);
            // A title that is a piece of another delivered title cannot be told apart by text.
            if (!arrivedTitles.some((a) => a.includes(t))) expect(body).not.toContain(t);
          }
          for (const m of state.missed) {
            const t = titleOf(m.id);
            if (!arrivedTitles.some((a) => a.includes(t))) expect(body).not.toContain(t);
          }
          expect(sentence).not.toMatch(JUDGEMENT);
        });
        expect(out.summary).not.toMatch(JUDGEMENT);
        for (const e of scenario.events) {
          if (e.body.length > 0) {
            expect(out.summary).not.toContain(e.body);
            for (const s of out.decisions) expect(s).not.toContain(e.body);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
