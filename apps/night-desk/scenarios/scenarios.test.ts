/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { checkScenario, parseBrief, validateScenario } from "hindsight";

// Every non-test .ts file in this folder is a scenario file. Each export is one scenario.
// Night Desk has no scenario file yet; only the example brief exists. The scenario-from-brief
// hook writes the first one, and this test then covers it with no edit.
const files = import.meta.glob(["./*.ts", "!./*.test.ts"], { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const briefs = import.meta.glob("./briefs/*.md", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;

describe("Night Desk scenario files", () => {
  it("finds the briefs, so the glob is working", () => {
    expect(Object.keys(briefs)).toContain("./briefs/example-noise-complaint.md");
  });

  for (const [path, md] of Object.entries(briefs)) {
    it(`${path} parses as a brief`, () => {
      expect(parseBrief(md).ok).toBe(true);
    });
  }

  for (const [path, mod] of Object.entries(files)) {
    for (const [name, value] of Object.entries(mod)) {
      describe(`${path} export ${name}`, () => {
        it("validates", () => {
          expect(validateScenario(value).ok).toBe(true);
        });
        it("passes every check", () => {
          expect(checkScenario(value as never).filter((r) => !r.ok)).toEqual([]);
        });
      });
    }
  }
});
