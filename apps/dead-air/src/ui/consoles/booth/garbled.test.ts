import { describe, expect, it } from "vitest";
import {
  GARBLED_MARKER,
  INVALID_MARKER,
  UNPRINTABLE_GLYPH,
  toPrintLine,
} from "./garbled";

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (line: ReturnType<typeof toPrintLine>) => line.glyphs.map((g) => g.ch).join("");
const spans = (line: ReturnType<typeof toPrintLine>) =>
  line.glyphs.map((g) => [g.byteStart, g.byteLength]);

describe("toPrintLine: intact text", () => {
  it("prints ASCII as text", () => {
    const line = toPrintLine(bytes("hello"));
    expect(text(line)).toBe("hello");
    expect(line.glyphs.every((g) => !g.garbled && !g.invalid)).toBe(true);
    expect(line.label).toBe("5 characters, all readable.");
  });

  it("prints Café as itself, counting characters not bytes", () => {
    const line = toPrintLine(bytes("Café"));
    expect(text(line)).toBe("Café");
    expect(spans(line)).toEqual([[0, 1], [1, 1], [2, 1], [3, 2]]);
    expect(line.label).toBe("4 characters, all readable.");
  });

  it("prints naïve résumé and other scripts as themselves", () => {
    expect(text(toPrintLine(bytes("naïve résumé")))).toBe("naïve résumé");
    expect(text(toPrintLine(bytes("привет 你好")))).toBe("привет 你好");
  });

  it("prints a 4-byte emoji as one glyph", () => {
    const line = toPrintLine(bytes("👍"));
    expect(text(line)).toBe("👍");
    expect(spans(line)).toEqual([[0, 4]]);
    expect(line.label).toBe("1 character, all readable.");
  });

  it("prints mixed ASCII and emoji", () => {
    const line = toPrintLine(bytes("on my way 👍"));
    expect(text(line)).toBe("on my way 👍");
    expect(line.label).toBe("11 characters, all readable.");
  });

  it("keeps a byte order mark as a character", () => {
    expect(toPrintLine(bytes("\uFEFFa")).glyphs).toHaveLength(2);
  });

  it("prints an intact control byte as a placeholder that is not damage", () => {
    const line = toPrintLine(new Uint8Array([0x41, 0x07, 0x00, 0x7f]));
    expect(text(line)).toBe(`A${UNPRINTABLE_GLYPH}${UNPRINTABLE_GLYPH}${UNPRINTABLE_GLYPH}`);
    expect(line.glyphs.every((g) => !g.garbled && !g.invalid)).toBe(true);
    expect(line.label).toBe("4 characters, all readable.");
  });

  it("handles an empty payload", () => {
    const line = toPrintLine(new Uint8Array());
    expect(line.glyphs).toEqual([]);
    expect(line.label).toBe("Empty message.");
  });
});

describe("toPrintLine: damaged bytes", () => {
  it("marks undecodable ASCII positions and keeps every position", () => {
    const line = toPrintLine(bytes("abcdefghijkl"), new Set([2, 7]));
    expect(line.glyphs).toHaveLength(12);
    expect(line.glyphs[2]).toEqual({
      ch: GARBLED_MARKER, garbled: true, invalid: false, byteStart: 2, byteLength: 1,
    });
    expect(line.glyphs[3].ch).toBe("d");
    expect(line.label).toBe("12 characters, 2 could not be read.");
  });

  it("ignores positions outside the payload, fractions and duplicates", () => {
    const line = toPrintLine(bytes("abc"), [-1, 3, 99, 1.5, 1, 1]);
    expect(line.glyphs.map((g) => g.garbled)).toEqual([false, true, false]);
    expect(line.label).toBe("3 characters, 1 could not be read.");
  });

  it("one damaged byte inside é marks that character only", () => {
    // "Café": é is bytes 3 and 4.
    for (const pos of [3, 4]) {
      const line = toPrintLine(bytes("Café"), [pos]);
      expect(text(line)).toBe(`Caf${GARBLED_MARKER}`);
      expect(line.glyphs[3]).toMatchObject({ garbled: true, byteStart: 3, byteLength: 2 });
      expect(line.label).toBe("4 characters, 1 could not be read.");
    }
  });

  it("a damaged lead byte whose value changed still takes its orphaned continuation", () => {
    const p = bytes("aé");
    p[1] = 0x41; // lead damaged into ASCII; the continuation byte is orphaned
    const line = toPrintLine(p, [1]);
    expect(spans(line)).toEqual([[0, 1], [1, 2]]);
    expect(line.glyphs[1].garbled).toBe(true);
  });

  it("one damaged byte inside an emoji marks the whole emoji", () => {
    for (const pos of [0, 1, 2, 3]) {
      const line = toPrintLine(bytes("ok 👍!"), [3 + pos]);
      expect(text(line)).toBe(`ok ${GARBLED_MARKER}!`);
      expect(line.glyphs[3]).toMatchObject({ garbled: true, byteStart: 3, byteLength: 4 });
    }
  });

  it("damage wins over invalid on the same glyph", () => {
    const line = toPrintLine(new Uint8Array([0xe2, 0x41]), [0]);
    expect(line.glyphs[0].garbled).toBe(true);
    expect(line.glyphs[0].invalid).toBe(false);
  });
});

describe("toPrintLine: intact but invalid UTF-8", () => {
  it("marks a stray continuation byte as invalid, not garbled", () => {
    const line = toPrintLine(new Uint8Array([0x61, 0x80, 0x62]));
    expect(line.glyphs[1]).toEqual({
      ch: INVALID_MARKER, garbled: false, invalid: true, byteStart: 1, byteLength: 1,
    });
    expect(text(line)).toBe(`a${INVALID_MARKER}b`);
    expect(line.label).toBe("3 characters, 1 could not be read.");
  });

  it("marks a truncated sequence at the end as one invalid glyph", () => {
    const line = toPrintLine(new Uint8Array([0x61, 0xf0, 0x9f, 0x91]));
    expect(spans(line)).toEqual([[0, 1], [1, 3]]);
    expect(line.glyphs[1].invalid).toBe(true);
  });

  it("marks overlongs, surrogates and out-of-range leads as invalid", () => {
    for (const bad of [[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf5, 0x80, 0x80, 0x80], [0xff]]) {
      const line = toPrintLine(new Uint8Array(bad));
      expect(line.glyphs.every((g) => g.invalid && !g.garbled)).toBe(true);
      expect(line.glyphs.reduce((s, g) => s + g.byteLength, 0)).toBe(bad.length);
    }
  });

  it("uses a different glyph for invalid, damaged and control", () => {
    expect(new Set([INVALID_MARKER, GARBLED_MARKER, UNPRINTABLE_GLYPH]).size).toBe(3);
  });
});
