import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ledgerArb, participantIds } from "./arbitraries";
import { computeHabits } from "./habits";
import type { HabitParticipant } from "./habits";
import { buildLedger, closedFates } from "./ledger";
import type { LedgerEvent } from "./ledger";

const participantsArb: fc.Arbitrary<HabitParticipant[]> = fc
  .tuple(
    fc.constantFrom("complete" as const, "arrivals-only" as const),
    fc.constantFrom("complete" as const, "arrivals-only" as const),
    fc.constantFrom("complete" as const, "arrivals-only" as const),
  )
  .map(([a, b, c]) => [
    { id: "p1", history: a },
    { id: "p2", history: b },
    { id: "p3", history: c },
  ]);

const decisionsArb = fc.array(fc.record({ actor: participantIds, simTime: fc.integer({ min: 0, max: 40 }) }), {
  maxLength: 8,
});

// Feature: seance-replay, Property 11: Habit figures are a pure function of the log, never lower with another collision, and never invented
describe("Property 11: Habit figures are a pure function of the log, never lower with another collision, and never invented", () => {
  it("is deterministic, also for a shuffled ledger, and keeps participant order", () => {
    // **Validates: Requirements 5.1, 5.2**
    fc.assert(
      fc.property(
        ledgerArb,
        decisionsArb,
        participantsArb,
        fc.boolean(),
        fc.infiniteStream(fc.nat()),
        (l, decisions, participants, readBackRecorded, noise) => {
          const options = { readBackRecorded };
          const once = computeHabits(l, decisions, participants, options);
          expect(computeHabits(l, decisions, participants, options)).toEqual(once);
          const keyed = l.events.map((e, i) => ({ e, k: noise.next().value as number, i }));
          const shuffled = keyed.sort((x, y) => x.k - y.k || x.i - y.i).map((x) => x.e);
          expect(computeHabits({ events: shuffled }, decisions, participants, options)).toEqual(once);
          expect(once.map((r) => r.participant)).toEqual(participants.map((p) => p.id));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never invents: arrivals-only rows are all null, transmissions equal the sent events, unrecorded read-back is null", () => {
    // **Validates: Requirements 5.1, 5.2**
    fc.assert(
      fc.property(ledgerArb, decisionsArb, participantsArb, (l, decisions, participants) => {
        const rows = computeHabits(l, decisions, participants);
        rows.forEach((row, i) => {
          const p = participants[i] as HabitParticipant;
          expect(row.readBack).toBeNull();
          if (p.history === "arrivals-only") {
            expect(row).toEqual({
              participant: p.id,
              transmissions: null,
              meanBytes: null,
              meanAirtime: null,
              collisionsInvolved: null,
              collisionsCaused: null,
              readBack: null,
            });
            return;
          }
          const own = l.events.filter((e) => e.kind === "sent" && e.sender === p.id);
          expect(row.transmissions).toBe(own.length);
          const sizes = own.flatMap((e) => (e.kind === "sent" && e.bytes !== undefined ? [e.bytes] : []));
          const times = own.flatMap((e) => (e.kind === "sent" && e.airtime !== undefined ? [e.airtime] : []));
          expect(row.meanBytes === null).toBe(sizes.length === 0);
          expect(row.meanAirtime === null).toBe(times.length === 0);
          if (sizes.length > 0) {
            expect(row.meanBytes as number).toBeGreaterThanOrEqual(Math.min(...sizes));
            expect(row.meanBytes as number).toBeLessThanOrEqual(Math.max(...sizes));
          }
          const ids = new Set(own.map((e) => (e.kind === "sent" ? e.messageId : "")));
          expect(row.collisionsInvolved as number).toBeLessThanOrEqual(ids.size);
          if (row.collisionsCaused !== null) expect(row.collisionsCaused).toBeLessThanOrEqual(row.collisionsInvolved as number);
        });
      }),
      { numRuns: 200 },
    );
  });

  it("read-back never exceeds what was received, and is present only when recorded", () => {
    // **Validates: Requirements 5.1, 5.2**
    fc.assert(
      fc.property(ledgerArb, decisionsArb, participantsArb, (l, decisions, participants) => {
        const rows = computeHabits(l, decisions, participants, { readBackRecorded: true });
        rows.forEach((row, i) => {
          if ((participants[i] as HabitParticipant).history === "arrivals-only") expect(row.readBack).toBeNull();
          else {
            expect(row.readBack).not.toBeNull();
            expect(row.readBack?.read).toBeLessThanOrEqual(row.readBack?.received as number);
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it("another collision never lowers a count; a figure that was unknown stays unknown", () => {
    // **Validates: Requirements 5.1, 5.2**
    fc.assert(
      fc.property(
        ledgerArb,
        decisionsArb,
        participantsArb,
        fc.nat(),
        fc.integer({ min: 0, max: 45 }),
        (l, decisions, participants, pick, at) => {
          const fates = closedFates(l);
          const open = [...fates].filter(([, f]) => f === "never-arrived").map(([id]) => id);
          fc.pre(open.length > 0);
          const id = open[pick % open.length] as string;
          const added: LedgerEvent = { kind: "outcome", messageId: id, outcome: "collision", simTime: at };
          const before = computeHabits(l, decisions, participants);
          const after = computeHabits(buildLedger([...l.events, added]), decisions, participants);
          before.forEach((b, i) => {
            const a = after[i];
            expect(a).toBeDefined();
            for (const field of ["collisionsInvolved", "collisionsCaused"] as const) {
              if (b[field] === null) expect(a?.[field]).toBeNull();
              else if (a?.[field] !== null) expect(a?.[field] as number).toBeGreaterThanOrEqual(b[field] as number);
            }
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});
