import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cursorArb, focusArb, worldlineInputArb } from "./arbitraries";
import { layoutWorldlines, timeToY } from "./worldlines";

const EPS = 1e-9;

// Feature: seance-replay, Property 7: A message in transit ends at the selected moment
describe("in-transit clipping", () => {
  it("nothing unsettled and not faded is drawn below the cursor; open records never show never-arrived", () => {
    // **Validates: Requirements 2.2, 2.3**
    fc.assert(
      fc.property(worldlineInputArb, cursorArb, focusArb, (input, at, focus) => {
        const layout = layoutWorldlines(input, { at, focus });
        const { time } = layout;
        // At the last time the record is closed, unless a participant is in focus.
        const closed = at === null || time.end <= time.start || (at >= time.end && (focus ?? null) === null);
        if (closed) {
          // Closed record: dropped messages are never-arrived stubs in the loss tone.
          for (const s of layout.signals) {
            if (s.arrivedAt === null) {
              expect(s.fate).toBe("never-arrived");
              expect(s.tone).toBe("loss");
              expect(s.open).toBe(false);
            }
          }
          return;
        }
        // A cursor before the first event is clamped to the start of the record.
        const cursor = Math.max(at as number, time.start);
        const yAt = timeToY(time, cursor);
        for (const s of layout.signals) {
          const settled = s.arrivedAt !== null && s.arrivedAt <= cursor && !s.open;
          if (s.open) {
            expect(s.y2).toBeLessThanOrEqual(yAt + EPS);
            expect(s.sentAt).toBeLessThanOrEqual(cursor);
          }
          if (s.sentAt > cursor) {
            expect(s.tone).toBe("faded");
            expect(s.tone).not.toBe("loss");
            expect(s.fate).not.toBe("never-arrived");
          } else if (!settled) {
            expect(s.y2).toBeLessThanOrEqual(yAt + EPS);
          }
          if (s.arrivedAt === null) {
            expect(s.fate).not.toBe("never-arrived");
            if (s.sentAt <= cursor) expect(s.fate).toBe("in-transit");
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
