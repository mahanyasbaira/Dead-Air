import fc from "fast-check";
import { describe, it } from "vitest";
import { buildPayload, composerBudget } from "./composer";

// Feature: consoles, Property 2: Composer budget respects the 64-byte limit
describe("composer budget (property)", () => {
  it("matches UTF-8 length, clamps remaining, flags over limit, caps payload at 64", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 120 }), (text) => {
        const bytes = new TextEncoder().encode(text).length;
        const b = composerBudget(text);
        const p = buildPayload(text);
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(p);
        return (
          b.usedBytes === bytes &&
          b.remainingBytes === Math.max(0, 64 - bytes) &&
          b.overLimit === bytes > 64 &&
          p.length <= 64 &&
          text.startsWith(decoded) &&
          (bytes <= 64 ? p.length === bytes : true)
        );
      }),
      { numRuns: 200 },
    );
  });
});
