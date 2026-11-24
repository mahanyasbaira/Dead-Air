/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { Scenario } from "hindsight";
import type { DeskScript, NightLog } from "../../src/model/types";
import { applyAction, foldNight } from "../../src/model/night";
import { findNight, nights } from "../../src/nights";

const deskFiles = import.meta.glob(["./*.ts", "!./*.test.ts", "!./banned-words.ts"], { eager: true }) as Record<
  string,
  { default?: DeskScript }
>;
const scenarioFiles = import.meta.glob(["../*.ts", "!../*.test.ts"], { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const scenarios = new Map<string, Scenario>();
for (const mod of Object.values(scenarioFiles)) {
  for (const v of Object.values(mod)) scenarios.set((v as Scenario).id, v as Scenario);
}

describe("desk files", () => {
  it("finds at least one desk file, so the glob is working", () => {
    expect(Object.keys(deskFiles).length).toBeGreaterThan(0);
  });

  for (const [path, mod] of Object.entries(deskFiles)) {
    describe(path, () => {
      const script = mod.default as DeskScript;
      const scenario = scenarios.get(script?.id);

      it("default-exports a script with the same id as a scenario", () => {
        expect(script).toBeDefined();
        expect(scenario).toBeDefined();
      });

      it("has item ids that are message_created events", () => {
        const created = new Set(scenario!.events.filter((e) => e.type === "message_created").map((e) => e.id));
        for (const item of script.items) expect(created.has(item.id), item.id).toBe(true);
      });

      it("has distinct integer arrival minutes below endsAt", () => {
        const minutes = script.items.map((i) => i.at);
        for (const m of minutes) {
          expect(Number.isInteger(m)).toBe(true);
          expect(m).toBeGreaterThanOrEqual(0);
          expect(m).toBeLessThan(script.endsAt);
        }
        expect(new Set(minutes).size).toBe(minutes.length);
        expect(new Set(script.items.map((i) => i.id)).size).toBe(script.items.length);
      });

      it("has unique single-character keys and integer costs of at least 1", () => {
        const keys = script.actions.map((a) => a.key);
        for (const k of keys) expect(k).toHaveLength(1);
        expect(new Set(keys.map((k) => k.toLowerCase())).size).toBe(keys.length);
        expect(new Set(script.actions.map((a) => a.id)).size).toBe(script.actions.length);
        for (const a of script.actions) {
          expect(Number.isInteger(a.cost)).toBe(true);
          expect(a.cost).toBeGreaterThanOrEqual(1);
        }
      });

      it("has a callStaff action with no requires", () => {
        expect(script.actions.some((a) => a.kind === "callStaff" && a.requires === undefined)).toBe(true);
      });

      it("references only items and actions that exist", () => {
        const itemIds = new Set(script.items.map((i) => i.id));
        const actionIds = new Set(script.actions.map((a) => a.id));
        for (const a of script.actions) {
          if (a.requires !== undefined) expect(itemIds.has(a.requires), a.id).toBe(true);
        }
        for (const g of script.guide ?? []) {
          if (g.done.actionId !== undefined) expect(actionIds.has(g.done.actionId), g.id).toBe(true);
          if (g.done.kind !== undefined) {
            expect(script.actions.some((a) => a.kind === g.done.kind), g.id).toBe(true);
          }
        }
      });

      it("lists every action id as an option of the player's decision prompt", () => {
        const ids = new Set(scenario!.decisionPrompts.ra?.options.map((o) => o.id));
        for (const a of script.actions) expect(ids.has(a.id), a.id).toBe(true);
      });
    });
  }
});

describe("registry", () => {
  it("joins every desk file to a scenario, guided first", () => {
    expect(nights.length).toBe(Object.keys(deskFiles).length);
    expect(nights[0]?.script.guided).toBe(true);
    expect(findNight("guided-first-night")?.scenario.id).toBe("guided-first-night");
    expect(findNight("no-such-night")).toBeUndefined();
  });
});

describe("guided first night, played", () => {
  it("queues the chat message that arrives during the first action, then ends", () => {
    const script = findNight("guided-first-night")!.script;
    let log: NightLog = { v: 1 as const, scenarioId: script.id, rev: script.rev, seed: script.seed, entries: [] };
    for (const id of ["read-text", "reply-chat", "wait", "wait", "answer-door", "wait", "wait", "wait"]) {
      const r = applyAction(script, log, id);
      expect(r.ok, id).toBe(true);
      if (r.ok) log = r.value;
    }
    const state = foldNight(script, log);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const chat = state.value.delivered.find((d) => d.id === "i2");
    expect(chat).toMatchObject({ sentAt: 3, deliveredAt: 5 });
    expect(state.value.missed).toEqual([]);
    expect(state.value.ended).toBe(true);
  });
});
