/**
 * End to end for consoles Req 2.3: composer -> frame -> FSK -> demodulate ->
 * parse -> toPrintLine. Clean signal only.
 *
 * Nothing in the transport or modem reports per-byte undecodable positions:
 * `parse` returns `{ ok: false, reason: "garbled" }` with no payload, and the
 * acoustic and scripted transports emit a `garbled` event without one. So the
 * damaged case below passes the bytes the receiver would hold and the positions
 * it would flag, chosen by the test.
 */
import { describe, expect, it } from "vitest";
import { frame, parse } from "../../../modem/frame";
import { demodulate, modulate } from "../../../modem/fsk";
import { buildPayload } from "./composer";
import { GARBLED_MARKER, toPrintLine } from "./garbled";

const RATE = 48000;
const PAYLOAD_OFFSET = 5; // preamble 2 + sync 2 + length 1

function overTheAir(payload: Uint8Array): Uint8Array {
  const result = parse(demodulate(modulate(frame(payload), RATE), RATE));
  if (!result.ok) throw new Error(`frame did not parse: ${result.reason}`);
  return result.payload;
}
const text = (p: Uint8Array, bad: number[] = []) =>
  toPrintLine(p, bad).glyphs.map((g) => g.ch).join("");

describe("unicode through the whole chain", () => {
  it.each(["Café", "naïve résumé", "on my way 👍", "привет 你好"])(
    "%s arrives readable over FSK",
    (msg) => {
      const received = overTheAir(buildPayload(msg));
      const line = toPrintLine(received);
      expect(text(received)).toBe(msg);
      expect(line.glyphs.every((g) => !g.garbled && !g.invalid)).toBe(true);
      expect(line.label).toMatch(/all readable\.$/);
    },
  );

  it("a flipped payload byte makes the frame garbled and the print line marks it", () => {
    const sent = buildPayload("on my way 👍");
    const framed = frame(sent);
    const pos = 10; // inside the emoji (bytes 10..13)
    framed[PAYLOAD_OFFSET + pos] ^= 0x01;
    expect(parse(framed)).toEqual({ ok: false, reason: "garbled" });
    // Receiver-side stand-in: the bytes as heard, plus the position it would flag.
    const heard = framed.slice(PAYLOAD_OFFSET, PAYLOAD_OFFSET + sent.length);
    const line = toPrintLine(heard, [pos]);
    expect(line.glyphs.map((g) => g.ch).join("")).toBe(`on my way ${GARBLED_MARKER}`);
    expect(line.glyphs[10]).toMatchObject({ garbled: true, byteStart: 10, byteLength: 4 });
    expect(line.label).toBe("11 characters, 1 could not be read.");
  });

  it("a message cut at 64 bytes prints with no garbled or invalid glyph", () => {
    for (const msg of ["é".repeat(40), "a" + "👍".repeat(20), "x".repeat(63) + "é"]) {
      const payload = buildPayload(msg);
      expect(payload.length).toBeLessThanOrEqual(64);
      const line = toPrintLine(payload);
      expect(line.glyphs.some((g) => g.garbled || g.invalid)).toBe(false);
      expect(msg.startsWith(line.glyphs.map((g) => g.ch).join(""))).toBe(true);
    }
  });
});
