import { describe, expect, it } from "vitest";
import { layoutReplay, ReplayView } from "hindsight/replay";

describe("hindsight/replay", () => {
  it("resolves from an app", () => {
    expect(typeof layoutReplay).toBe("function");
    expect(typeof ReplayView).toBe("function");
  });
});
