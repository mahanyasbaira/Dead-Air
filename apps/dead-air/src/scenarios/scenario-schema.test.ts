import { checkScenario, validateScenario } from "hindsight";
import { describe, expect, it } from "vitest";
import { staticOnChannel9 } from "./static-on-channel-9";

describe("Static on Channel 9 against the kit's scenario checks", () => {
  it("validates", () => {
    expect(validateScenario(staticOnChannel9)).toEqual({ ok: true, scenario: staticOnChannel9 });
  });

  it("passes all four checks", () => {
    const results = checkScenario(staticOnChannel9);
    expect(results.map((r) => r.name)).toEqual(["validates", "beats-reachable", "run-ends", "decisions-have-options"]);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});
