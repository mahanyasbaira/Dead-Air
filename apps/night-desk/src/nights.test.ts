import { describe, expect, it } from "vitest";
import { nights } from "./nights";

describe("nights registry", () => {
  it("has four nights, the first guided", () => {
    expect(nights).toHaveLength(4);
    expect(nights[0]?.script.guided).toBe(true);
  });

  it("gives each of the other three nights between 6 and 10 items", () => {
    // A proxy for "about six minutes"; the real length is a manual check.
    for (const n of nights.slice(1)) {
      expect(n.script.items.length, n.id).toBeGreaterThanOrEqual(6);
      expect(n.script.items.length, n.id).toBeLessThanOrEqual(10);
    }
  });
});
