// Feature: consoles, Property 1: Carrier state is a total mapping to one of four labels
import fc from "fast-check";
import { describe, it } from "vitest";
import { carrierState } from "./carrier";

describe("carrierState properties", () => {
  it("maps every input to one of four labels following the precedence rule", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("idle", "transmitting" as const),
        fc.constantFrom("received", "garbled", "collision", undefined),
        (mode, kind) => {
          const s = carrierState(mode as "idle" | "transmitting", kind);
          const expected =
            mode === "transmitting"
              ? "SENDING"
              : kind === "collision"
                ? "COLLISION"
                : kind === undefined
                  ? "IDLE"
                  : "RECEIVING";
          return s === expected;
        },
      ),
      { numRuns: 100 },
    );
  });
});
