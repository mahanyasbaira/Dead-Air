import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { layoutOptionsArb, worldlineInputArb } from "./arbitraries";
import { layoutWorldlines } from "./worldlines";
import { VIEW } from "./types";

// Feature: seance-replay, Property 5: A signal's vertical span is its delay, and a lost line never reaches the receiver
describe("signal geometry", () => {
  it("span is the scaled delay, lost lines stop short, everything is inside the view", () => {
    // **Validates: Requirements 2.1**
    fc.assert(
      fc.property(worldlineInputArb, layoutOptionsArb, (input, options) => {
        const layout = layoutWorldlines(input, options);
        const { time } = layout;
        const scale = (time.bottom - time.top) / (time.end - time.start || 1);
        const xOf = new Map(layout.lines.map((l) => [l.id, l.x]));
        for (const s of layout.signals) {
          const xr = xOf.get(s.to) as number;
          const x1 = xOf.get(s.from) as number;
          const dir = Math.sign(xr - x1) || 1;
          if (s.fate === "received" || s.fate === "garbled" || s.fate === "collision") {
            expect(s.arrivedAt).not.toBeNull();
            expect(Math.abs(s.y2 - s.y1 - scale * ((s.arrivedAt as number) - s.sentAt))).toBeLessThan(1e-9);
          }
          if (s.fate === "received") expect(Math.abs(s.x2 - xr)).toBeLessThan(1e-9);
          if (s.fate === "garbled" || s.fate === "collision" || s.fate === "never-arrived") {
            // Short of the receiver's line, measured in the direction of travel.
            expect((xr - s.x2) * dir).toBeGreaterThanOrEqual(VIEW.gap - 1e-9);
          }
          if (s.fate === "never-arrived") expect(s.spanIsDelay).toBe(false);
          for (const [x, y] of [
            [s.x1, s.y1],
            [s.x2, s.y2],
          ] as const) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(VIEW.width);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(VIEW.height);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
