/**
 * CRC-16 over a byte array for Dead Air's frame check sequence.
 *
 * Pure function, no DOM and no randomness, so it runs identically in Node (tests)
 * and in the browser. This backs property P2 (requirement 1.2): a frame whose CRC
 * does not match is reported to the engine as `garbled`, never silently repaired.
 * A single-bit change anywhere in the input always changes the CRC, which is the
 * guarantee a 16-bit CRC with a primitive-based polynomial gives.
 *
 * Variant: CRC-16/CCITT-FALSE (design open point 2 — CCITT over IBM/ARC).
 *   - polynomial: 0x1021 (x^16 + x^12 + x^5 + 1)
 *   - initial value: 0xFFFF
 *   - no input/output bit reflection
 *   - no final XOR
 * Check value for the ASCII bytes "123456789" is 0x29B1 (frozen in crc.test.ts).
 * The choice and check value are recorded in docs/RESULTS.md.
 */

/** CRC-16/CCITT-FALSE polynomial (normal, non-reflected form). */
export const CRC16_POLYNOMIAL = 0x1021;

/** CRC-16/CCITT-FALSE initial register value. */
export const CRC16_INIT = 0xffff;

/**
 * Compute the CRC-16/CCITT-FALSE of a byte array.
 *
 * @param bytes input bytes; each element is treated modulo 256.
 * @returns the CRC as an unsigned 16-bit integer in [0, 0xFFFF].
 */
export function crc16(bytes: Uint8Array): number {
  let crc = CRC16_INIT;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ CRC16_POLYNOMIAL) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
}
