import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Scenario } from "hindsight";
import { nights } from "../nights";
import { intervalsFromLog } from "./attention";
import { emptyLog, fixtureScenario, fixtureScript } from "./fixtures";
import { applyAction, availableActions, foldNight } from "./night";
import type { ActionDef, DeskScript, NightLog, NightState } from "./types";

interface Subject {
  script: DeskScript;
  scenario: Scenario;
}

const subjects: Subject[] = [
  ...nights.map((n) => ({ script: n.script, scenario: n.scenario })),
  { script: fixtureScript, scenario: fixtureScenario },
];

/** One generated step: which available action, and which delivered facts a log action records. */
const step = fc.record({ pick: fc.nat(50), mask: fc.array(fc.boolean(), { maxLength: 30 }) });
const steps = fc.array(step, { maxLength: 60 });

interface Walk {
  log: NightLog;
  /** states[0] is the empty night; states[i] is the state after i actions. */
  states: NightState[];
  actions: ActionDef[];
}

/** Choose among `availableActions` each step; log actions get a valid subset of delivered items. */
function walk(script: DeskScript, plan: ReadonlyArray<{ pick: number; mask: boolean[] }>): Walk {
  let log = emptyLog(script);
  const first = foldNight(script, log);
  if (!first.ok) throw new Error(first.error.message);
  const states = [first.value];
  const actions: ActionDef[] = [];
  for (const { pick, mask } of plan) {
    const state = states[states.length - 1];
    const options = availableActions(script, state);
    if (options.length === 0) break;
    const action = options[pick % options.length];
    const facts =
      action.kind === "log" ? state.delivered.map((d) => d.id).filter((_, i) => mask[i] === true) : undefined;
    const next = applyAction(script, log, action.id, facts === undefined ? {} : { facts });
    if (!next.ok) throw new Error(`${script.id}: ${next.error.message}`);
    log = next.value;
    const folded = foldNight(script, log);
    if (!folded.ok) throw new Error(folded.error.message);
    states.push(folded.value);
    actions.push(action);
  }
  return { log, states, actions };
}

const costOf = (script: DeskScript, actionId: string): number =>
  (script.actions.find((a) => a.id === actionId) as ActionDef).cost;

describe("night model properties", () => {
  it("covers every shipped night and the fixture", () => {
    expect(subjects.length).toBeGreaterThanOrEqual(2);
    expect(subjects.some((s) => s.script === fixtureScript)).toBe(true);
  });

  // Feature: night-desk, Property 1: Time never goes backwards
  it("Property 1: the clock adds each cost, each entry records the clock before it, a wrong `at` is rejected", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(
        fc.constantFrom(...subjects),
        steps,
        fc.nat(50),
        fc.integer({ min: 1, max: 40 }),
        fc.boolean(),
        (subject, plan, whichEntry, delta, backwards) => {
          const { script } = subject;
          const { log, states, actions } = walk(script, plan);
          expect(states[0].now).toBe(0);
          for (let i = 0; i < log.entries.length; i++) {
            expect(log.entries[i].at).toBe(states[i].now);
            expect(states[i + 1].now).toBe(states[i].now + actions[i].cost);
            expect(states[i + 1].now).toBeGreaterThan(states[i].now);
            if (i > 0) expect(log.entries[i].at).toBeGreaterThan(log.entries[i - 1].at);
          }
          if (log.entries.length === 0) return;
          const k = whichEntry % log.entries.length;
          const entries = log.entries.map((e, i) => (i === k ? { ...e, at: e.at + (backwards ? -delta : delta) } : e));
          const bad = foldNight(script, { ...log, entries });
          expect(bad.ok).toBe(false);
          if (!bad.ok) {
            expect(bad.error.kind).toBe("clock-mismatch");
            expect(bad.error.index).toBe(k);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: night-desk, Property 2: An item is delivered at most once, and only when the rules allow
  it("Property 2: delivered once, no earlier than sent, queued to the action's end, expired never, each arrived item in exactly one list", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(fc.constantFrom(...subjects), steps, (subject, plan) => {
        const { script } = subject;
        const { log, states } = walk(script, plan);
        for (const state of states) {
          const intervals = intervalsFromLog(script, { entries: log.entries.slice(0, state.entries.length) });
          const ids = state.delivered.map((d) => d.id);
          expect(new Set(ids).size).toBe(ids.length);
          const missedIds = state.missed.map((m) => m.id);
          expect(new Set(missedIds).size).toBe(missedIds.length);
          expect(ids.filter((id) => missedIds.includes(id))).toEqual([]);

          const arrived = script.items.filter((i) => i.at <= state.now).map((i) => i.id).sort();
          expect([...ids, ...missedIds].sort()).toEqual(arrived);

          for (const d of state.delivered) {
            const item = script.items.find((i) => i.id === d.id)!;
            expect(d.sentAt).toBe(item.at);
            expect(d.deliveredAt).toBeGreaterThanOrEqual(d.sentAt);
            expect(d.deliveredAt).toBeLessThanOrEqual(state.now);
            const cover = intervals.find((iv) => iv.start < item.at && item.at < iv.end);
            if (cover === undefined || cover.attention === "desk") {
              expect(d.deliveredAt).toBe(d.sentAt);
            } else {
              expect(d.deliveredAt).toBe(cover.end);
              if (item.expiresAfter !== undefined) {
                expect(cover.end - item.at).toBeLessThanOrEqual(item.expiresAfter);
              }
            }
          }
          // Expired items are never delivered, and are reported as missed.
          for (const item of script.items) {
            if (item.at > state.now || item.expiresAfter === undefined) continue;
            const cover = intervals.find((iv) => iv.start < item.at && item.at < iv.end);
            if (cover === undefined || cover.attention === "desk") continue;
            if (cover.end - item.at > item.expiresAfter) {
              expect(ids).not.toContain(item.id);
              expect(missedIds).toContain(item.id);
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  // Feature: night-desk, Property 3: Away blocks the phone and the door, and a missed item shows time, not content
  it("Property 3: phone and door items inside an away action are missed with their time, and no missed field holds body text", () => {
    // **Validates: Requirements 2.3**
    fc.assert(
      fc.property(fc.constantFrom(...subjects), steps, (subject, plan) => {
        const { script, scenario } = subject;
        const { log, states } = walk(script, plan);
        const end = states[states.length - 1];
        const away = intervalsFromLog(script, log).filter((iv) => iv.attention === "away");
        for (const item of script.items) {
          if (item.at > end.now) continue;
          if (item.source !== "phone" && item.source !== "door") continue;
          if (!away.some((iv) => iv.start < item.at && item.at < iv.end)) continue;
          expect(end.delivered.map((d) => d.id)).not.toContain(item.id);
          const miss = end.missed.find((m) => m.id === item.id);
          expect(miss).toBeDefined();
          expect(miss?.reason).toBe("away");
          expect(miss?.sentAt).toBe(item.at);
          expect(miss?.label.length).toBeGreaterThan(0);
        }
        // No state, however early, leaks body text through a missed item.
        const bodies = scenario.events
          .filter((e) => e.type === "message_created")
          .map((e) => (e as { body?: string }).body ?? "")
          .filter((b) => b.length > 0);
        for (const state of states) {
          for (const m of state.missed) {
            for (const value of Object.values(m)) {
              if (typeof value !== "string") continue;
              for (const body of bodies) {
                expect(value).not.toBe(body);
                expect(value.includes(body)).toBe(false);
              }
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("a walk reaches the end of every night, so the properties see finished states", () => {
    for (const { script } of subjects) {
      const { states } = walk(script, Array.from({ length: 80 }, () => ({ pick: 0, mask: [] })));
      expect(states[states.length - 1].ended).toBe(true);
      expect(costOf(script, script.actions[0].id)).toBeGreaterThanOrEqual(1);
    }
  });
});
