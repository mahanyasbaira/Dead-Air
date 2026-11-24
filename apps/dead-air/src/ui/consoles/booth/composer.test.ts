import { describe, expect, it } from "vitest";
import { BAUD } from "../../../modem/fsk";
import { buildPayload, composerBudget } from "./composer";

describe("composerBudget", () => {
  it("handles empty input", () => {
    const b = composerBudget("");
    expect(b.usedBytes).toBe(0);
    expect(b.remainingBytes).toBe(64);
    expect(b.overLimit).toBe(false);
    expect(buildPayload("").length).toBe(0);
  });

  it("accepts exactly 64 ASCII bytes", () => {
    const b = composerBudget("a".repeat(64));
    expect(b).toMatchObject({ usedBytes: 64, remainingBytes: 0, overLimit: false });
    expect(buildPayload("a".repeat(64)).length).toBe(64);
  });

  it("flags 65 ASCII bytes and caps the payload at 64", () => {
    const b = composerBudget("a".repeat(65));
    expect(b).toMatchObject({ usedBytes: 65, remainingBytes: 0, overLimit: true });
    expect(buildPayload("a".repeat(65)).length).toBe(64);
  });

  it("counts bytes, not characters", () => {
    expect(composerBudget("é").usedBytes).toBe(2);
    expect(composerBudget("€").usedBytes).toBe(3);
    expect(composerBudget("😀").usedBytes).toBe(4);
  });

  it("never splits a multi-byte character at the boundary", () => {
    // 63 ASCII + "é" (2 bytes) = 65: the é must be dropped whole.
    const text = "a".repeat(63) + "é";
    expect(composerBudget(text).overLimit).toBe(true);
    const p = buildPayload(text);
    expect(p.length).toBe(63);
    expect(new TextDecoder("utf-8", { fatal: true }).decode(p)).toBe("a".repeat(63));

    // 62 ASCII + "é" = 64: fits exactly.
    expect(buildPayload("a".repeat(62) + "é").length).toBe(64);

    // 62 ASCII + emoji (4 bytes) = 66: emoji dropped whole.
    const q = buildPayload("a".repeat(62) + "😀");
    expect(q.length).toBe(62);
  });

  it("estimates airtime from frame length and baud", () => {
    // Frame overhead: 2 preamble + 2 sync + 1 length + 2 CRC = 7 bytes.
    expect(composerBudget("").estimatedAirtime).toBeCloseTo((7 * 8) / BAUD, 9);
    expect(composerBudget("hello").estimatedAirtime).toBeCloseTo((12 * 8) / BAUD, 9);
    // Over-limit text is measured as the 64-byte frame that would be sent.
    expect(composerBudget("a".repeat(100)).estimatedAirtime).toBeCloseTo((71 * 8) / BAUD, 9);
  });
});
