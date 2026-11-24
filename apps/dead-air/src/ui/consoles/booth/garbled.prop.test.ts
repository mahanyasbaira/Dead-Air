import fc from "fast-check";
import { describe, it } from "vitest";
import { GARBLED_MARKER, INVALID_MARKER, toPrintLine } from "./garbled";

// Feature: consoles, Property 3: Garbled bytes are marked, never hidden
// **Validates: Requirements 2.3**
const payloadArb = fc.uint8Array({ maxLength: 64 });
const positionsArb = fc.array(fc.integer({ min: -5, max: 80 }));
const fatal = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

describe("Property 3: Garbled bytes are marked, never hidden", () => {
  it("intact valid UTF-8 prints back as the same string", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 16 }), (s) => {
        const enc = new TextEncoder().encode(s);
        const line = toPrintLine(enc);
        const expected = new TextDecoder("utf-8", { ignoreBOM: true }).decode(enc);
        const control = (c: string) => c < " " || c === "\u007f";
        // Control characters print as a placeholder; compare the rest.
        const out = line.glyphs.map((g) => g.ch);
        const exp = Array.from(expected);
        return (
          out.length === exp.length &&
          out.every((c, i) => (control(exp[i]) ? true : c === exp[i])) &&
          line.glyphs.every((g) => !g.garbled && !g.invalid)
        );
      }),
      { numRuns: 200 },
    );
  });

  it("glyph byte spans tile [0, length) exactly, in order", () => {
    fc.assert(
      fc.property(payloadArb, positionsArb, (payload, positions) => {
        const line = toPrintLine(payload, positions);
        let next = 0;
        for (const g of line.glyphs) {
          if (g.byteStart !== next || g.byteLength < 1) return false;
          next += g.byteLength;
        }
        return next === payload.length;
      }),
      { numRuns: 200 },
    );
  });

  it("every undecodable position falls in a garbled glyph, shown with the marker", () => {
    fc.assert(
      fc.property(payloadArb, positionsArb, (payload, positions) => {
        const line = toPrintLine(payload, positions);
        return positions
          .filter((p) => p >= 0 && p < payload.length)
          .every((p) => {
            const g = line.glyphs.find((x) => p >= x.byteStart && p < x.byteStart + x.byteLength);
            return g !== undefined && g.garbled && g.ch === GARBLED_MARKER && !g.invalid;
          });
      }),
      { numRuns: 200 },
    );
  });

  it("no garbled glyph without damage; invalid exactly when the bytes are not valid UTF-8", () => {
    fc.assert(
      fc.property(payloadArb, positionsArb, (payload, positions) => {
        const inRange = new Set(positions.filter((p) => p >= 0 && p < payload.length));
        const line = toPrintLine(payload, positions);
        const noDamage = toPrintLine(payload);
        const garbledOk = line.glyphs.every((g) => {
          if (!g.garbled) return true;
          for (let k = g.byteStart; k < g.byteStart + g.byteLength; k++) if (inRange.has(k)) return true;
          return false;
        });
        let valid = true;
        try {
          fatal.decode(payload);
        } catch {
          valid = false;
        }
        const anyInvalid = noDamage.glyphs.some((g) => g.invalid);
        return (
          garbledOk &&
          noDamage.glyphs.every((g) => !g.garbled) &&
          anyInvalid === !valid &&
          noDamage.glyphs.every((g) => !g.invalid || g.ch === INVALID_MARKER)
        );
      }),
      { numRuns: 200 },
    );
  });
});
