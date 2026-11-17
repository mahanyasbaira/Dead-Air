import { describe, expect, it } from "vitest";
import {
  frame,
  parse,
  MAX_PAYLOAD,
  PayloadTooLargeError,
  PREAMBLE,
  SYNC_WORD,
} from "./frame";

/**
 * Example tests for framing. These pin behaviour a person would describe:
 * oversize payloads are rejected with a typed error (requirement 1.3), the empty
 * and 64-byte boundaries round-trip, and a corrupted CRC surfaces as `garbled`
 * rather than a silently wrong payload (requirement 1.2). Property P1/P2 live in
 * `frame.prop.test.ts`.
 */

function seq(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = i & 0xff;
  return out;
}

describe("frame / parse examples", () => {
  it("rejects a payload over 64 bytes with a typed PayloadTooLargeError (Req 1.3)", () => {
    const tooBig = seq(65);
    expect(() => frame(tooBig)).toThrow(PayloadTooLargeError);
    try {
      frame(tooBig);
    } catch (err) {
      expect(err).toBeInstanceOf(PayloadTooLargeError);
      expect((err as PayloadTooLargeError).length).toBe(65);
      expect((err as PayloadTooLargeError).max).toBe(MAX_PAYLOAD);
    }
  });

  it("round-trips an empty payload (0-byte boundary)", () => {
    const payload = new Uint8Array(0);
    const result = parse(frame(payload));
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.from(result.payload)).toEqual([]);
  });

  it("round-trips a full 64-byte payload (max boundary)", () => {
    const payload = seq(64);
    const result = parse(frame(payload));
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.from(result.payload)).toEqual(Array.from(payload));
  });

  it("accepts a 64-byte payload at the boundary (does not throw)", () => {
    expect(() => frame(seq(64))).not.toThrow();
  });

  it("lays out the header as preamble + sync + length + payload + CRC", () => {
    const payload = Uint8Array.of(0x01, 0x02, 0x03);
    const bytes = frame(payload);
    expect(Array.from(bytes.subarray(0, PREAMBLE.length))).toEqual(Array.from(PREAMBLE));
    expect(
      Array.from(bytes.subarray(PREAMBLE.length, PREAMBLE.length + SYNC_WORD.length)),
    ).toEqual(Array.from(SYNC_WORD));
    const lengthOffset = PREAMBLE.length + SYNC_WORD.length;
    expect(bytes[lengthOffset]).toBe(3);
    // preamble + sync + length + 3 payload + 2 CRC
    expect(bytes.length).toBe(PREAMBLE.length + SYNC_WORD.length + 1 + 3 + 2);
  });

  it("reports a bad CRC as garbled, never a silent fix (Req 1.2)", () => {
    const bytes = frame(Uint8Array.of(0x10, 0x20, 0x30));
    // Flip a payload byte without recomputing the CRC.
    const corrupted = bytes.slice();
    const payloadOffset = PREAMBLE.length + SYNC_WORD.length + 1;
    corrupted[payloadOffset] ^= 0x01;
    const result = parse(corrupted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("garbled");
  });

  it("reports a corrupted sync word as bad-sync", () => {
    const bytes = frame(Uint8Array.of(0x42));
    const corrupted = bytes.slice();
    corrupted[PREAMBLE.length] ^= 0x01; // flip a sync-word bit
    const result = parse(corrupted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-sync");
  });

  it("reports an out-of-range declared length as bad-length", () => {
    const bytes = frame(Uint8Array.of(0x42));
    const corrupted = bytes.slice();
    const lengthOffset = PREAMBLE.length + SYNC_WORD.length;
    corrupted[lengthOffset] = 0xff; // claims 255 bytes
    const result = parse(corrupted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-length");
  });

  it("reports a too-short buffer as bad-sync", () => {
    const result = parse(new Uint8Array(3));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-sync");
  });
});
