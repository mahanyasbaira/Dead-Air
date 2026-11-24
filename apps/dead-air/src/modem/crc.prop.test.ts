import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { crc16 } from "./crc";

/**
 * Property tests for CRC-16/CCITT-FALSE.
 *
 * **Validates: Requirements 1.2** — the CRC half of property P2. A single-bit
 * change to the input must always change the CRC, which is what lets the framer
 * report a one-bit corruption as `garbled` rather than deliver a wrong payload as
 * valid. (`frame.prop.test.ts` asserts P2 at the frame level; this pins the
 * guarantee at the CRC itself.)
 *
 * On failure, fast-check prints the seed and counterexample; paste any
 * counterexample into `crc.test.ts` once fixed (testing steering).
 */
describe("crc16 properties", () => {
  it("is deterministic for the same input", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        expect(crc16(bytes)).toBe(crc16(bytes.slice()));
      }),
    );
  });

  it("always lands in the unsigned 16-bit range", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        const v = crc16(bytes);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0xffff);
      }),
    );
  });

  // P2: any single-bit change to the input changes the CRC.
  it("changes the CRC for any single-bit flip of the input", () => {
    fc.assert(
      fc.property(
        // At least one byte so there is a bit to flip.
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.nat(),
        (bytes, bitPick) => {
          const totalBits = bytes.length * 8;
          const bitIndex = bitPick % totalBits;
          const byteIndex = bitIndex >> 3;
          const bitInByte = bitIndex & 7;

          const original = crc16(bytes);

          const flipped = bytes.slice();
          flipped[byteIndex] = (flipped[byteIndex] ^ (1 << bitInByte)) & 0xff;

          expect(crc16(flipped)).not.toBe(original);
        },
      ),
    );
  });
});
