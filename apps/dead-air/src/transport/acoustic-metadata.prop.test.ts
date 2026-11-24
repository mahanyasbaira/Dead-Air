import fc from "fast-check";
import { describe, it } from "vitest";
import { SILENCE_DBFS, shapeReceiveMetadata } from "./acoustic-metadata";

/** Validates: Requirement 4.3. */
describe("shapeReceiveMetadata properties", () => {
  const samples = fc.float32Array({ minLength: 0, maxLength: 512, min: -1, max: 1, noNaN: true });
  const rate = fc.constantFrom(44100, 48000);

  it("keeps rms within [0, peak], dBFS within [floor, 0], airtime proportional to length", () => {
    fc.assert(
      fc.property(samples, rate, (s, sr) => {
        const m = shapeReceiveMetadata(s, sr);
        const eps = 1e-6;
        return (
          m.rms >= 0 &&
          m.rms <= m.peak + eps &&
          m.peak <= 1 &&
          m.dbfs >= SILENCE_DBFS &&
          m.dbfs <= eps &&
          Math.abs(m.airtimeMs - (s.length / sr) * 1000) < 1e-9
        );
      }),
      { numRuns: 200 },
    );
  });

  it("raises dBFS when every sample is doubled (within clipping range)", () => {
    fc.assert(
      fc.property(
        fc.float32Array({ minLength: 1, maxLength: 256, min: -0.5, max: 0.5, noNaN: true }),
        (s) => {
          const base = shapeReceiveMetadata(s, 48000);
          if (base.rms < 1e-4) return true; // near the floor the clamp hides the change
          const louder = shapeReceiveMetadata(s.map((x) => x * 2), 48000);
          return Math.abs(louder.dbfs - base.dbfs - 6.0206) < 1e-2;
        },
      ),
      { numRuns: 200 },
    );
  });
});
