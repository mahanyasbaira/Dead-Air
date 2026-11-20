import { describe, expect, it } from "vitest";
import * as kit from "hindsight";

describe("app shell", () => {
  it("resolves the kit through the workspace link", () => {
    expect(kit).toBeTypeOf("object");
  });
});
