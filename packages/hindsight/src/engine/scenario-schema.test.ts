import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "./fixtures/participants";
import { threeParty } from "./fixtures/three-party";
import { checkScenario } from "./scenario-check";
import { validateScenario } from "./scenario-schema";
import type { Scenario } from "./types";

const fresh = (): Scenario => (JSON.parse(JSON.stringify(threeParty)) as Scenario);
const paths = (x: unknown): string[] => {
  const r = validateScenario(x);
  return r.ok ? [] : r.errors.map((e) => e.path);
};

describe("validateScenario", () => {
  it("accepts the three-party fixture and the generated participants fixture", () => {
    expect(validateScenario(threeParty).ok).toBe(true);
    expect(validateScenario(buildParticipantsFixture(["a", "b"])).ok).toBe(true);
  });

  it("reports a missing field with its path", () => {
    const s: Record<string, unknown> = { ...fresh() };
    delete s.title;
    expect(paths(s)).toEqual(["title"]);
  });

  it("reports a wrong type with its path", () => {
    const s = fresh() as unknown as { events: { simTime: unknown }[] };
    s.events[1].simTime = "1";
    expect(paths(s)).toEqual(["events[1].simTime"]);
  });

  it("rejects a non-integer or negative simTime", () => {
    const s = fresh();
    s.events[0].simTime = 1.5;
    s.events[1].simTime = -1;
    expect(paths(s)).toEqual(["events[0].simTime", "events[1].simTime"]);
  });

  it("rejects a duplicate participant id and the reserved id", () => {
    const s = fresh();
    s.roles[1].id = "p1";
    s.roles[2].id = "all";
    expect(paths(s)).toEqual(expect.arrayContaining(["roles[1].id", "roles[2].id"]));
  });

  it("rejects an unknown actor and an unknown decision-prompt participant", () => {
    const s = fresh();
    s.events.splice(6, 0, { id: "dec", type: "decision", simTime: 7, audience: "p1", title: "D", body: "D", actor: "ghost" });
    s.decisionPrompts["ghost"] = { prompt: "x", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] };
    expect(paths(s)).toEqual(expect.arrayContaining(["events[6].actor", 'decisionPrompts["ghost"]']));
  });

  it("returns every error, not just the first", () => {
    const r = validateScenario({ id: 1, title: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(6);
  });

  it("never throws on hostile input", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      0,
      "x",
      [],
      [null],
      () => 1,
      JSON.parse('{"__proto__":{"x":1},"events":[null,1,[]],"roles":"no","decisionPrompts":[]}'),
      JSON.parse('{"decisionPrompts":{"__proto__":{"prompt":1,"options":[null]}}}'),
      new Proxy({}, { get: () => { throw new Error("boom"); }, getOwnPropertyDescriptor: () => { throw new Error("boom"); }, ownKeys: () => { throw new Error("boom"); } }),
      { events: new Array(50000).fill(null) },
    ];
    for (const h of hostile) expect(() => validateScenario(h)).not.toThrow();
    expect(validateScenario(null)).toEqual({ ok: false, errors: [{ path: "", message: "must be an object" }] });
  });
});

describe("checkScenario", () => {
  const names = (s: Scenario) => checkScenario(s).map((r) => r.name);
  const failed = (s: Scenario) => checkScenario(s).filter((r) => !r.ok).map((r) => r.name);

  it("returns the four named checks, all passing for the fixture", () => {
    expect(names(threeParty)).toEqual(["validates", "beats-reachable", "run-ends", "decisions-have-options"]);
    expect(failed(threeParty)).toEqual([]);
  });

  it("fails a decision with fewer than two options", () => {
    const s = fresh();
    s.decisionPrompts.p1.options = [{ id: "a", label: "A" }];
    expect(failed(s)).toEqual(["decisions-have-options"]);
  });

  it("fails duplicate option ids", () => {
    const s = fresh();
    s.decisionPrompts.p2.options = [{ id: "a", label: "A" }, { id: "a", label: "B" }];
    expect(failed(s)).toEqual(["decisions-have-options"]);
  });

  it("fails an unreachable beat placed after the debrief", () => {
    const s = fresh();
    s.events.push({ id: "late", type: "info", simTime: 20, audience: "all", title: "L", body: "L" });
    expect(failed(s)).toEqual(["beats-reachable", "run-ends"]);
  });

  it("fails a delivery whose source is unreachable", () => {
    const s = fresh();
    s.events[2].simTime = 30;
    s.events[4].simTime = 31;
    const r = checkScenario(s).find((c) => c.name === "beats-reachable");
    expect(r?.ok).toBe(false);
    expect(r?.details.some((d) => d.includes('"e5"'))).toBe(true);
  });

  it("fails a missing debrief and a second debrief", () => {
    const none = fresh();
    none.events.pop();
    expect(failed(none)).toContain("run-ends");
    const two = fresh();
    two.events.push({ ...two.events[6], id: "e8" });
    expect(failed(two)).toEqual(["run-ends"]);
  });

  it("fails validates and skips the rest when the shape is wrong", () => {
    const s = fresh();
    s.events[0].audience = "nobody";
    const r = checkScenario(s);
    expect(r[0].ok).toBe(false);
    expect(r[0].details[0]).toContain("events[0].audience");
    expect(r.slice(1).every((c) => !c.ok)).toBe(true);
  });

  it("does not throw on a non-scenario value", () => {
    expect(() => checkScenario(null as unknown as Scenario)).not.toThrow();
  });
});
