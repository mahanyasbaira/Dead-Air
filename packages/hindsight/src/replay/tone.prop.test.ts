import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildLedger, knownAt } from "../ledger/ledger";
import { cursorArb, worldlineInputArb } from "./arbitraries";
import { layoutWorldlines } from "./worldlines";

const focusedArb = fc.constantFrom("p1", "p2", "p3");

// Feature: seance-replay, Property 8: What is drawn in ink is what the role knew
describe("focus tone", () => {
  // A message id with conflicting senders or recipients is skipped by the layout (see
  // worldlines.test.ts), so the property holds for every mark that is drawn.
  it("ink is what the focus knew, what it knew is ink, and loss was settled by the cursor", () => {
    // **Validates: Requirements 2.2, 2.3**
    fc.assert(
      fc.property(
        worldlineInputArb,
        cursorArb.filter((a) => a !== null),
        focusedArb,
        (input, at, focus) => {
          const layout = layoutWorldlines(input, { at, focus });
          const { time } = layout;
          // No time span: the record is closed and no focus applies.
          if (time.end <= time.start) return;
          const t = Math.max(at as number, time.start);
          const known = knownAt(buildLedger(input.ledger.events), focus, t);

          for (const s of layout.signals) {
            if (s.tone === "ink") {
              expect(known.has(s.id) || (s.from === focus && s.sentAt <= t)).toBe(true);
            }
            if (known.has(s.id)) expect(s.tone).toBe("ink");
            if (s.tone === "loss") {
              expect(s.arrivedAt).not.toBeNull();
              expect(s.arrivedAt as number).toBeLessThanOrEqual(t);
              expect(s.open).toBe(false);
            }
          }
          for (const a of layout.arrivals) {
            if (a.tone === "ink") expect(known.has(a.id)).toBe(true);
            if (known.has(a.id)) expect(a.tone).toBe("ink");
            if (a.tone === "loss") expect(a.arrivedAt).toBeLessThanOrEqual(t);
          }
          for (const k of layout.knowledge) {
            expect(k.tone).not.toBe("loss");
            if (k.tone === "ink") {
              expect(k.participant).toBe(focus);
              expect(known.has(k.id)).toBe(true);
            }
            if (k.participant === focus && known.has(k.id)) expect(k.tone).toBe("ink");
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("applies no fade when the cursor is null", () => {
    // **Validates: Requirements 2.2, 2.3**
    fc.assert(
      fc.property(worldlineInputArb, focusedArb, (input, focus) => {
        const layout = layoutWorldlines(input, { at: null, focus });
        for (const m of [...layout.signals, ...layout.arrivals, ...layout.knowledge]) {
          expect(m.tone).not.toBe("faded");
        }
      }),
      { numRuns: 100 },
    );
  });
});
