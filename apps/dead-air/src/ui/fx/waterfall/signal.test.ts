import { describe, expect, it } from "vitest";
import { shapeReceiveMetadata, type ReceiveMetadata } from "../../../transport/acoustic-metadata";
import { signalIndicator, TEXT_NOT_MEASURED, TEXT_NO_MESSAGE } from "./signal";

const meta = (dbfs: number): ReceiveMetadata => ({ airtimeMs: 420, rms: 0.125, dbfs, peak: 0.3 });

describe("signalIndicator", () => {
  it("is unavailable in solo and loopback, even if a measurement is passed", () => {
    expect(signalIndicator("solo")).toEqual({ kind: "unavailable", text: TEXT_NOT_MEASURED });
    expect(signalIndicator("loopback", meta(-18))).toEqual({ kind: "unavailable", text: TEXT_NOT_MEASURED });
  });

  it("is unavailable in acoustic mode before any message is heard", () => {
    expect(signalIndicator("acoustic")).toEqual({ kind: "unavailable", text: TEXT_NO_MESSAGE });
  });

  it("reports a measurement with its text and fields", () => {
    const m = signalIndicator("acoustic", meta(-18));
    expect(m).toMatchObject({ kind: "measured", dbfs: -18, rms: 0.125, peak: 0.3, airtimeMs: 420 });
    expect(m.text).toBe("Last message: \u221218 dBFS, 420 ms.");
    expect(m.kind === "measured" && m.bar).toBeCloseTo(0.7);
  });

  it("clamps the bar at the floor and above full scale", () => {
    const low = signalIndicator("acoustic", meta(-120));
    const high = signalIndicator("acoustic", meta(3));
    expect(low.kind === "measured" && low.bar).toBe(0);
    expect(high.kind === "measured" && high.bar).toBe(1);
  });

  it("never prints NaN, even for non-finite metadata", () => {
    const m = signalIndicator("acoustic", { airtimeMs: NaN, rms: 0, dbfs: -Infinity, peak: 0 });
    expect(m.text).not.toContain("NaN");
    expect(m.kind === "measured" && m.bar).toBe(0);
  });

  it("gives no NaN for a silent burst", () => {
    const silent = shapeReceiveMetadata(new Float32Array(441), 44100);
    const m = signalIndicator("acoustic", silent);
    expect(m.kind).toBe("measured");
    if (m.kind === "measured") {
      expect(Number.isNaN(m.bar)).toBe(false);
      expect(m.bar).toBe(0);
      expect(m.text).toBe("Last message: \u2212120 dBFS, 10 ms.");
    }
  });
});
