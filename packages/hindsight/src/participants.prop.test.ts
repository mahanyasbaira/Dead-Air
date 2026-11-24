import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eventsForRole } from "./engine/audience";
import { buildParticipantsFixture } from "./engine/fixtures/participants";
import { validateScenario } from "./engine/scenario-schema";
import { buildDebrief, initialState, reduce, replay } from "./engine/reducer";
import type { RecordedDecision } from "./engine/types";
import { buildLedger, knownAt } from "./ledger/ledger";
import type { LedgerEvent } from "./ledger/ledger";

const adversarial = ["", "__proto__", "constructor", "toString", "hasOwnProperty", "ALL", " all", "é", "日本", "\u0000", "💥"];
const idArb = fc.oneof(fc.string({ maxLength: 6 }), fc.string({ unit: "grapheme", maxLength: 4 }), fc.constantFrom(...adversarial));
const idsArb = fc.uniqueArray(idArb.filter((s) => s !== "all"), { minLength: 1, maxLength: 12 });

describe("buildParticipantsFixture", () => {
  it('rejects a participant named "all"', () => {
    expect(() => buildParticipantsFixture(["p1", "all"])).toThrow(/reserved/);
    expect(() => buildParticipantsFixture(["all"])).toThrow(/reserved/);
  });
  it("rejects duplicate ids", () => {
    expect(() => buildParticipantsFixture(["a", "b", "a"])).toThrow(/Duplicate/);
  });
  it("buildDebrief does not resolve a missing prompt through Object.prototype", () => {
    const s = replay(buildParticipantsFixture(["p1"]), {
      scenarioId: "participants-fixture",
      decisions: [{ role: "constructor", optionId: "zz", recordedAtSimTime: 1 }],
    });
    expect(buildDebrief(s).decisions[0].optionLabel).toBe("zz");
  });
});

describe("Property 5: the kit does not care how many participants there are", () => {
  // Feature: skeleton, Property 5
  it("holds for 1 to 12 participants with arbitrary distinct ids (Feature: skeleton, Property 5)", () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        const sc = buildParticipantsFixture(ids);
        // validator: the generated scenario over these participants validates.
        expect(validateScenario(sc).ok).toBe(true);
        const visible = (id: string) => sc.events.filter((e) => e.audience === "all" || e.audience === id);

        // eventsForRole: exactly the events addressed to the participant or "all".
        for (const id of ids) {
          const got = eventsForRole(sc.events, id, 100).map((e) => e.id).sort();
          expect(got).toEqual(visible(id).map((e) => e.id).sort());
        }

        // reduce and replay: one decision per participant, none lost, sorted by id.
        let s = initialState(sc);
        const decisions: RecordedDecision[] = ids.map((id) => ({ role: id, optionId: "a", recordedAtSimTime: 1 }));
        for (const d of decisions) s = reduce(s, { type: "recordDecision", decision: d });
        expect(s.decisions.map((d) => d.role).sort()).toEqual([...ids].sort());
        const r1 = replay(sc, { scenarioId: sc.id, decisions });
        const r2 = replay(sc, { scenarioId: sc.id, decisions: [...decisions].reverse() });
        expect(r1).toEqual(r2);
        expect(r1.decisions).toHaveLength(ids.length);
        expect(buildDebrief(r1).decisions.map((d) => d.optionLabel)).toEqual(ids.map(() => "Option A"));

        // ledger: knownAt holds only facts addressed to that participant.
        const events: LedgerEvent[] = [];
        for (const e of sc.events) {
          const to = e.audience === "all" ? ids : [e.audience];
          for (const p of to) events.push({ kind: "learned", participant: p, factId: e.id, simTime: e.simTime });
        }
        const last = ids[ids.length - 1];
        events.push({ kind: "sent", messageId: "m1", sender: ids[0], recipient: last, simTime: 2 });
        events.push({ kind: "outcome", messageId: "m1", outcome: "received", simTime: 4 });
        const ledger = buildLedger(events);
        for (const id of ids) {
          const expected = new Set(visible(id).map((e) => e.id));
          if (id === last) expected.add("m1");
          expect(knownAt(ledger, id, 100)).toEqual(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});
