/**
 * Framing and parsing for Dead Air's acoustic link.
 *
 * A frame is the unit the modem puts on the wire:
 *
 *   [preamble][sync word][length: 1 byte][payload: 0–64 bytes][CRC-16: 2 bytes]
 *
 * - **Preamble** is alternating bits (`0xAA` bytes) so the demodulator can lock
 *   its clock before real data arrives. It carries no information and is not
 *   covered by the CRC.
 * - **Sync word** is a fixed constant marking frame start; the parser rejects a
 *   frame whose sync does not match exactly, so it never mistakes mid-stream
 *   noise for a header.
 * - **Length** is the payload byte count (0–64).
 * - **CRC-16** (CRC-16/CCITT-FALSE, `src/modem/crc.ts`) covers the length byte
 *   and the payload. A frame whose CRC does not match is reported as `garbled`;
 *   the payload is never delivered as valid and never silently repaired
 *   (requirement 1.2).
 *
 * Pure functions over byte arrays: no DOM, no audio, no randomness, so they run
 * identically in Node (tests) and the browser.
 *
 * Open design point 1 — sync word value and preamble length are chosen here and
 * recorded in `docs/RESULTS.md`.
 */

import { crc16 } from "./crc";

/** Maximum payload size in bytes (requirement 1.3). */
export const MAX_PAYLOAD = 64;

/**
 * Preamble: alternating-bit bytes for clock recovery. `0xAA` is `10101010`, so a
 * run of these is a clean alternating-bit pattern. Not covered by the CRC.
 */
export const PREAMBLE = Uint8Array.of(0xaa, 0xaa);

/**
 * Sync word: a fixed, asymmetric constant that marks the start of the real
 * header. Asymmetric (not `0xAAAA`-like) so it is unlikely to appear inside the
 * preamble's alternating run.
 */
export const SYNC_WORD = Uint8Array.of(0x2d, 0xd4);

/** Byte offsets of the fixed header regions within a complete frame. */
const SYNC_OFFSET = PREAMBLE.length;
const LENGTH_OFFSET = SYNC_OFFSET + SYNC_WORD.length;
const PAYLOAD_OFFSET = LENGTH_OFFSET + 1;

/** Fixed overhead: preamble + sync + length byte + CRC-16. */
const OVERHEAD = PREAMBLE.length + SYNC_WORD.length + 1 + 2;

/**
 * Thrown by {@link frame} when a payload exceeds {@link MAX_PAYLOAD} bytes
 * (requirement 1.3). Typed so callers can distinguish it from other failures and
 * reject the message before it is ever transmitted.
 */
export class PayloadTooLargeError extends Error {
  /** The rejected payload's length in bytes. */
  readonly length: number;
  /** The maximum allowed payload length in bytes. */
  readonly max: number;

  constructor(length: number, max: number = MAX_PAYLOAD) {
    super(`payload of ${length} bytes exceeds the ${max}-byte maximum`);
    this.name = "PayloadTooLargeError";
    this.length = length;
    this.max = max;
    // Keep instanceof working when compiled down to ES5-style targets.
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

/**
 * Result of {@link parse}: a discriminated union. Either the payload was
 * recovered intact (`ok: true`) or the frame failed a check and no payload is
 * delivered (`ok: false`). A bad CRC maps to `"garbled"`.
 */
export type ParseResult =
  | { ok: true; payload: Uint8Array }
  | { ok: false; reason: "garbled" | "bad-sync" | "bad-length" };

/**
 * Build a complete frame for a payload.
 *
 * @param payload 0–64 bytes to transmit.
 * @returns the framed bytes ready for modulation.
 * @throws {PayloadTooLargeError} if `payload.length > 64` (requirement 1.3).
 */
export function frame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_PAYLOAD) {
    throw new PayloadTooLargeError(payload.length);
  }

  const out = new Uint8Array(OVERHEAD + payload.length);
  out.set(PREAMBLE, 0);
  out.set(SYNC_WORD, SYNC_OFFSET);
  out[LENGTH_OFFSET] = payload.length & 0xff;
  out.set(payload, PAYLOAD_OFFSET);

  // CRC covers the length byte and the payload (not preamble/sync).
  const checked = out.subarray(LENGTH_OFFSET, PAYLOAD_OFFSET + payload.length);
  const crc = crc16(checked);
  out[PAYLOAD_OFFSET + payload.length] = (crc >> 8) & 0xff;
  out[PAYLOAD_OFFSET + payload.length + 1] = crc & 0xff;

  return out;
}

/** Compare two byte regions for exact equality. */
function regionEquals(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

/**
 * Parse a complete frame back into its payload.
 *
 * Checks, in order: enough bytes present, sync word exact, declared length in
 * range and consistent with the buffer, then CRC. A CRC mismatch yields
 * `{ ok: false, reason: "garbled" }`; the payload is never returned on any
 * failure (requirement 1.2). Any single-bit flip anywhere in the frame trips one
 * of these checks, so a corrupted frame never parses as a valid payload.
 *
 * @param bytes the framed bytes produced by {@link frame}.
 * @returns a {@link ParseResult}.
 */
export function parse(bytes: Uint8Array): ParseResult {
  // A flip in the alternating preamble, or a short/missing header, cannot carry
  // a valid header: treat it as a sync failure (frame start not found).
  if (bytes.length < OVERHEAD) {
    return { ok: false, reason: "bad-sync" };
  }
  if (!regionEquals(bytes, 0, PREAMBLE) || !regionEquals(bytes, SYNC_OFFSET, SYNC_WORD)) {
    return { ok: false, reason: "bad-sync" };
  }

  const declaredLength = bytes[LENGTH_OFFSET];
  if (declaredLength > MAX_PAYLOAD) {
    return { ok: false, reason: "bad-length" };
  }
  if (bytes.length !== OVERHEAD + declaredLength) {
    return { ok: false, reason: "bad-length" };
  }

  const crcStart = PAYLOAD_OFFSET + declaredLength;
  const checked = bytes.subarray(LENGTH_OFFSET, crcStart);
  const expected = crc16(checked);
  const received = (bytes[crcStart] << 8) | bytes[crcStart + 1];
  if (received !== expected) {
    return { ok: false, reason: "garbled" };
  }

  // Copy out so the result is independent of the input buffer.
  const payload = bytes.slice(PAYLOAD_OFFSET, crcStart);
  return { ok: true, payload };
}
