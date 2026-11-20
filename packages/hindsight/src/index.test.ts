import { describe, expect, it } from "vitest";
import * as core from "./index";
import * as replay from "./replay/index";

describe("kit shell", () => {
  it("resolves both entries and exports nothing yet", () => {
    expect(Object.keys(core)).toEqual([]);
    expect(Object.keys(replay)).toEqual([]);
  });
});
