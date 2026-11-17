import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { modulate, demodulate } from "./fsk";
import { frame, parse } from "./frame";

/**
 * Property test for FSK modulation.
 *
 * **Validates: Requirements 2.1.**
 *
 * - **P3 (Req 2.1):** for any payload of 0–64 bytes and either supported sample
 *   rate, modulating a real frame to samples and demodulating with no added noise
 *   recovers the identical frame bytes, so the parsed payload equals the input.
 *   The round-trip goes end-to-end through the real `frame()` layout (preamble +
 *   sync + length + payload + CRC), not a hand-built buffer.
 *
 * No noise is added here; this is the clean-channel guarantee. The noisy
 * 95%-recovery trial (requirement 2.2) is a separate seeded statistical test
 * (task B2). On failure, fast-check prints the seed and counterexample; paste any
 * counterexample into `fsk.test.ts` once fixed (testing steering).
 */
describe("fsk modulate/demodulate properties", () => {
  // P3: noise-free round-trip recovers the exact frame at 44.1 and 48 kHz.
  it("round-trips any frame at 44.1 and 48 kHz with no noise (P3, Req 2.1)", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 64 }),
        fc.constantFrom(44100, 48000),
        (payload, sampleRate) => {
          const framed = frame(payload);
          const recovered = demodulate(modulate(framed, sampleRate), sampleRate);

          // Exact frame bytes recovered.
          expect(Array.from(recovered)).toEqual(Array.from(framed));

          // And the parsed payload matches the input end-to-end.
          const result = parse(recovered);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(Array.from(result.payload)).toEqual(Array.from(payload));
          }
        },
      ),
    );
  });
});
