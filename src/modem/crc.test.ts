import { describe, expect, it } from "vitest";
import { crc16, CRC16_INIT, CRC16_POLYNOMIAL } from "./crc";

/**
 * Known check values for CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no
 * reflection, no final XOR). The headline vector is the published "123456789"
 * check value, 0x29B1, which pins the implementation against a reference so any
 * accidental change to the variant is caught (testing steering: pin behaviour a
 * person can point at).
 */
const CHECK_STRING = "123456789";

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

describe("crc16 (CCITT-FALSE) fixed vectors", () => {
  it("matches the published check value for \"123456789\"", () => {
    expect(crc16(asciiBytes(CHECK_STRING))).toBe(0x29b1);
  });

  it("returns the init value for an empty input", () => {
    // With no bytes processed the register is never advanced.
    expect(crc16(new Uint8Array(0))).toBe(CRC16_INIT);
  });

  it("produces a known value for a single zero byte", () => {
    // 0xFFFF shifted through the polynomial for one 0x00 byte.
    expect(crc16(Uint8Array.of(0x00))).toBe(0xe1f0);
  });

  it("produces a known value for a single 0xFF byte", () => {
    expect(crc16(Uint8Array.of(0xff))).toBe(0xff00);
  });

  it("always returns an unsigned 16-bit integer", () => {
    for (const sample of [[], [0], [255], [1, 2, 3, 4, 5], Array(64).fill(0xab)]) {
      const v = crc16(Uint8Array.from(sample));
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffff);
    }
  });

  it("exposes the chosen variant constants", () => {
    expect(CRC16_POLYNOMIAL).toBe(0x1021);
    expect(CRC16_INIT).toBe(0xffff);
  });
});
