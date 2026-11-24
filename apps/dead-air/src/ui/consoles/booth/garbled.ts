/**
 * Booth print line (consoles Req 2.3): unreadable bytes are marked, never hidden.
 * Pure, no DOM.
 *
 * The payload is UTF-8 (the composer encodes it that way), so the print line
 * decodes by code point, not by byte. Grapheme clusters are not joined: an emoji
 * with a skin-tone modifier prints as two glyphs.
 *
 * Every payload byte belongs to exactly one glyph, in order. A glyph is one of:
 * - a decoded character (intact valid UTF-8);
 * - an intact control byte, shown as {@link UNPRINTABLE_GLYPH};
 * - a damaged glyph, `garbled: true`, shown as {@link GARBLED_MARKER}: the
 *   transport reported one of its bytes undecodable;
 * - an invalid glyph, `invalid: true`, shown as {@link INVALID_MARKER}: the bytes
 *   arrived intact but are not valid UTF-8 (stray continuation, truncated,
 *   overlong, surrogate, out of range).
 *
 * Invalid is a flag of its own, not folded into garbled, because the cause
 * differs (the sender wrote bad bytes, the channel did not damage them) and the
 * reader should not be told the link lost something it did not. Both are marked,
 * so Req 2.3 holds. Damage wins when both apply.
 */
import type { PrintGlyph, PrintLine } from "../../shell/types";
/** Printed for a character that contains a damaged byte. Not in ASCII. */
export const GARBLED_MARKER = "\u00B7";
/** Printed for intact bytes that are not valid UTF-8. Distinct from the damage marker. */
export const INVALID_MARKER = "\u25A1";
/** Printed for an intact control byte (0x00-0x1F, 0x7F). */
export const UNPRINTABLE_GLYPH = ".";

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Total length of a UTF-8 sequence from its lead byte; 0 if not a lead. */
function sequenceLength(b: number): number {
  if (b >= 0xc2 && b <= 0xdf) return 2;
  if (b >= 0xe0 && b <= 0xef) return 3;
  if (b >= 0xf0 && b <= 0xf4) return 4;
  return 0;
}

const isContinuation = (b: number): boolean => b >= 0x80 && b <= 0xbf;

/** Allowed range of the second byte, which excludes overlongs, surrogates and > U+10FFFF. */
function secondByteOk(lead: number, b: number): boolean {
  if (lead === 0xe0) return b >= 0xa0 && b <= 0xbf;
  if (lead === 0xed) return b >= 0x80 && b <= 0x9f;
  if (lead === 0xf0) return b >= 0x90 && b <= 0xbf;
  if (lead === 0xf4) return b >= 0x80 && b <= 0x8f;
  return isContinuation(b);
}

/**
 * Maps a received payload and its undecodable byte positions to a print line.
 *
 * Positions that are not integers within [0, payload.length) are ignored.
 * A damaged byte inside a character (or a damaged lead byte followed by its
 * orphaned continuation bytes) turns the whole run into one garbled glyph.
 *
 * The label counts glyphs (characters as decoded), not bytes, and the "could
 * not be read" number counts glyphs too: garbled plus invalid.
 */
export function toPrintLine(
  payload: Uint8Array,
  undecodable: Iterable<number> = [],
): PrintLine {
  const bad = new Set<number>();
  for (const p of undecodable) {
    if (Number.isInteger(p) && p >= 0 && p < payload.length) bad.add(p);
  }
  const n = payload.length;
  const glyphs: PrintGlyph[] = [];
  const push = (start: number, len: number, kind: "ok" | "invalid", ch: string) => {
    let damaged = false;
    for (let k = start; k < start + len; k++) if (bad.has(k)) damaged = true;
    glyphs.push({
      ch: damaged ? GARBLED_MARKER : kind === "invalid" ? INVALID_MARKER : ch,
      garbled: damaged,
      invalid: !damaged && kind === "invalid",
      byteStart: start,
      byteLength: len,
    });
  };

  let i = 0;
  while (i < n) {
    const b = payload[i];
    if (bad.has(i)) {
      // The byte's value cannot be trusted. If it still looks like a lead, take
      // the bytes that lead would own; otherwise take the intact continuation
      // bytes that follow, which are orphaned by the damage.
      const want = sequenceLength(b);
      const limit = want > 0 ? want - 1 : 3;
      let len = 1;
      while (
        len <= limit &&
        i + len < n &&
        (isContinuation(payload[i + len]) || (want > 0 && bad.has(i + len)))
      ) {
        len++;
      }
      push(i, len, "ok", "");
      i += len;
      continue;
    }
    if (b < 0x80) {
      push(i, 1, "ok", b < 0x20 || b === 0x7f ? UNPRINTABLE_GLYPH : String.fromCharCode(b));
      i++;
      continue;
    }
    const want = sequenceLength(b);
    if (want === 0) {
      push(i, 1, "invalid", "");
      i++;
      continue;
    }
    // Scan the continuation bytes; a damaged byte stands in for any value.
    let len = 1;
    let complete = true;
    for (let k = 1; k < want; k++) {
      const j = i + k;
      if (j >= n) {
        complete = false;
        break;
      }
      if (bad.has(j)) {
        len++;
        continue;
      }
      const ok = k === 1 ? secondByteOk(b, payload[j]) : isContinuation(payload[j]);
      if (!ok) {
        complete = false;
        break;
      }
      len++;
    }
    if (complete) {
      let ch = "";
      try {
        ch = decoder.decode(payload.subarray(i, i + len));
      } catch {
        ch = "";
      }
      push(i, len, "ok", ch);
    } else {
      push(i, len, "invalid", "");
    }
    i += len;
  }

  const unreadable = glyphs.filter((g) => g.garbled || g.invalid).length;
  const total = plural(glyphs.length, "character", "characters");
  const label =
    n === 0
      ? "Empty message."
      : unreadable === 0
        ? `${total}, all readable.`
        : `${total}, ${unreadable} could not be read.`;
  return { glyphs, label };
}
