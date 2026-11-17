import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { frame, parse } from "./frame";

/**
 * Property tests for framing.
 *
 * **Validates: Requirements 1.1, 1.2.**
 *
 * - **P1 (Req 1.1):** for any payload of 0–64 bytes, `parse(frame(payload))`
 *   returns a payload equal to the input, including the empty-array and 64-byte
 *   boundaries.
 * - **P2 (Req 1.2):** flipping exactly one bit anywhere in a frame makes it parse
 *   as not-ok; the original payload is never delivered as valid. A CRC-covered
 *   bit yields `garbled`; a preamble/sync/length bit yields a sync or length
 *   failure that likewise delivers no payload.
 *
 * On failure, fast-check prints the seed and counterexample; paste any
 * counterexample into `frame.test.ts` once fixed (testing steering).
 */
describe("frame / parse properties", () => {
  // P1: round-trip for any 0–64 byte payload.
  it("round-trips any payload of 0-64 bytes (P1, Req 1.1)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 64 }), (payload) => {
        const result = parse(frame(payload));
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Array.from(result.payload)).toEqual(Array.from(payload));
        }
      }),
    );
  });

  // P2: any single-bit flip in the frame is caught and never delivers the payload.
  it("never delivers the original payload after any single-bit flip (P2, Req 1.2)", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 64 }),
        fc.nat(),
        (payload, bitPick) => {
          const framed = frame(payload);
          const totalBits = framed.length * 8;
          const bitIndex = bitPick % totalBits;
          const byteIndex = bitIndex >> 3;
          const bitInByte = bitIndex & 7;

          const corrupted = framed.slice();
          corrupted[byteIndex] = (corrupted[byteIndex] ^ (1 << bitInByte)) & 0xff;

          const result = parse(corrupted);

          // Must not deliver the original payload as valid.
          if (result.ok) {
            // The only way ok:true is acceptable is if the flipped bit produced a
            // genuinely different valid payload — which cannot happen here because
            // a one-bit change in length/payload/CRC always breaks the CRC, and a
            // flip in preamble/sync breaks the exact match. So ok:true is a failure.
            expect(Array.from(result.payload)).not.toEqual(Array.from(payload));
            // And in fact it should never be ok at all for a single-bit flip.
            expect(result.ok).toBe(false);
          } else {
            expect(["garbled", "bad-sync", "bad-length"]).toContain(result.reason);
          }
        },
      ),
    );
  });
});
