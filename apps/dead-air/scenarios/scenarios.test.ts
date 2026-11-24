/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { checkScenario, parseBrief, validateScenario } from "hindsight";

// Every non-test .ts file in this folder is a scenario file. Each export is one scenario.
const files = import.meta.glob(["./*.ts", "!./*.test.ts"], { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const briefs = import.meta.glob("./briefs/*.md", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;

describe("Dead Air scenario files", () => {
  it("finds at least one scenario file and one brief", () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
    expect(Object.keys(briefs).length).toBeGreaterThan(0);
  });

  for (const [path, mod] of Object.entries(files)) {
    for (const [name, value] of Object.entries(mod)) {
      describe(`${path} export ${name}`, () => {
        it("validates", () => {
          expect(validateScenario(value).ok).toBe(true);
        });
        it("passes every check", () => {
          const failed = checkScenario(value as never).filter((r) => !r.ok);
          expect(failed).toEqual([]);
        });
      });
    }
  }

  for (const [path, md] of Object.entries(briefs)) {
    it(`${path} parses as a brief`, () => {
      const r = parseBrief(md);
      expect(r.ok).toBe(true);
    });
  }
});
