import { describe, expect, it } from "vitest";
import {
  SILENCE_DBFS,
  airtimeMs,
  shapeReceiveMetadata,
  toDbfs,
} from "./acoustic-metadata";

/** Validates: Requirement 4.3 (airtime and signal level as event metadata). */
describe("shapeReceiveMetadata", () => {
  it("derives airtime from sample count and sample rate", () => {
    const m = shapeReceiveMetadata(new Float32Array(44100), 44100);
    expect(m.airtimeMs).toBeCloseTo(1000, 9);
    expect(airtimeMs(24000, 48000)).toBeCloseTo(500, 9);
  });

  it("reports a full-scale square wave as 1.0 rms and 0 dBFS", () => {
    const s = new Float32Array(100).fill(1);
    s.forEach((_, i) => (s[i] = i % 2 ? 1 : -1));
    const m = shapeReceiveMetadata(s, 48000);
    expect(m.rms).toBeCloseTo(1, 6);
    expect(m.dbfs).toBeCloseTo(0, 6);
    expect(m.peak).toBe(1);
  });

  it("reports a half-scale constant as about -6.02 dBFS", () => {
    const m = shapeReceiveMetadata(new Float32Array(10).fill(0.5), 8000);
    expect(m.dbfs).toBeCloseTo(-6.0206, 3);
  });

  it("reports a sine of amplitude 0.75 as rms 0.75/sqrt(2)", () => {
    const n = 4800;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = 0.75 * Math.sin((2 * Math.PI * 1200 * i) / 48000);
    const m = shapeReceiveMetadata(s, 48000);
    expect(m.rms).toBeCloseTo(0.75 / Math.SQRT2, 4);
    expect(m.peak).toBeCloseTo(0.75, 3);
  });

  it("handles empty and silent input without NaN", () => {
    const empty = shapeReceiveMetadata(new Float32Array(0), 44100);
    expect(empty).toEqual({ airtimeMs: 0, rms: 0, dbfs: SILENCE_DBFS, peak: 0 });
    expect(shapeReceiveMetadata(new Float32Array(50), 44100).dbfs).toBe(SILENCE_DBFS);
    expect(airtimeMs(100, 0)).toBe(0);
    expect(toDbfs(1e-12)).toBe(SILENCE_DBFS);
  });
});
