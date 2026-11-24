import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "./fixtures/participants";
import { checkScenario } from "./scenario-check";
import { validateScenario } from "./scenario-schema";
import type { Scenario } from "./types";

const adversarial = ["", "__proto__", "constructor", "toString", "ALL", "é", "\u0000"];
const idArb = fc.oneof(fc.string({ maxLength: 6 }), fc.constantFrom(...adversarial));
const idsArb = fc.uniqueArray(
  idArb.filter((s) => s !== "all"),
  { minLength: 1, maxLength: 8 },
);
const optionCountsArb = fc.array(fc.integer({ min: 2, max: 4 }), { minLength: 8, maxLength: 8 });

/** A valid scenario over `ids`: private events, one created/delivered pair, one debrief. */
function build(ids: string[], counts: number[]): Scenario {
  const base = buildParticipantsFixture(ids);
  const debrief = base.events[base.events.length - 1];
  const events = [
    ...base.events.slice(0, -1),
    { id: "c1", type: "message_created" as const, simTime: 2, audience: ids[0], title: "Sent", body: "Sent." },
    {
      id: "d1",
      type: "message_delivered" as const,
      simTime: 6,
      audience: ids[ids.length - 1],
      title: "Arrived",
      body: "Arrived.",
      linkedTo: "c1",
    },
    debrief,
  ];
  const decisionPrompts = Object.fromEntries(
    ids.map((id, i) => [
      id,
      {
        prompt: "Choose.",
        options: Array.from({ length: counts[i % counts.length] }, (_, j) => ({ id: `o${j}`, label: `Option ${j}` })),
      },
    ]),
  );
  return { ...base, events, decisionPrompts };
}

// JSON round trip is a faithful deep copy here, including an own "__proto__" key.
const clone = (s: Scenario): Scenario => JSON.parse(JSON.stringify(s)) as Scenario;
const failedNames = (s: Scenario) => checkScenario(s).filter((r) => !r.ok).map((r) => r.name);

describe("Property 10: scenario checks accept valid scenarios and reject each fault", () => {
  // Feature: skeleton, Property 10
  // **Validates: Requirements 5.1**
  it("accepts every generated valid scenario (Feature: skeleton, Property 10)", () => {
    fc.assert(
      fc.property(idsArb, optionCountsArb, (ids, counts) => {
        const sc = build(ids, counts);
        expect(validateScenario(sc).ok).toBe(true);
        expect(checkScenario(sc).every((r) => r.ok)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects each single injected fault and names it (Feature: skeleton, Property 10)", () => {
    const faultArb = fc.constantFrom(
      "one-option",
      "link-missing",
      "link-later",
      "after-debrief",
      "no-debrief",
      "duplicate-event-id",
      "unknown-audience",
    );
    fc.assert(
      fc.property(idsArb, optionCountsArb, faultArb, (ids, counts, fault) => {
        const sc = clone(build(ids, counts));
        const di = sc.events.findIndex((e) => e.type === "debrief");
        const li = sc.events.findIndex((e) => e.id === "d1");
        let v;
        switch (fault) {
          case "one-option":
            sc.decisionPrompts[ids[0]].options.length = 1;
            expect(failedNames(sc)).toEqual(["decisions-have-options"]);
            break;
          case "link-missing":
            sc.events[li].linkedTo = "missing-event";
            v = validateScenario(sc);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.errors.map((e) => e.path)).toContain(`events[${li}].linkedTo`);
            expect(failedNames(sc)).toContain("validates");
            break;
          case "link-later":
            sc.events[li].linkedTo = sc.events[di].id;
            v = validateScenario(sc);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.errors.map((e) => e.path)).toContain(`events[${li}].linkedTo`);
            break;
          case "after-debrief":
            sc.events.push({ id: "late", type: "info", simTime: sc.events[di].simTime + 1, audience: "all", title: "Late", body: "Late." });
            expect(failedNames(sc)).toEqual(["beats-reachable", "run-ends"]);
            break;
          case "no-debrief":
            sc.events.splice(di, 1);
            expect(failedNames(sc)).toContain("run-ends");
            expect(validateScenario(sc).ok).toBe(true);
            break;
          case "duplicate-event-id":
            sc.events.splice(di, 0, { ...sc.events[0] });
            v = validateScenario(sc);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.errors.map((e) => e.path)).toContain(`events[${di}].id`);
            break;
          case "unknown-audience":
            sc.events[0].audience = `${ids.join("")}-nobody`;
            v = validateScenario(sc);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.errors.map((e) => e.path)).toContain("events[0].audience");
            break;
        }
      }),
      { numRuns: 100 },
    );
  });

  it("never throws on arbitrary input", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const r = validateScenario(x);
        if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});
