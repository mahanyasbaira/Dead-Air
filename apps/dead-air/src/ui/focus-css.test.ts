/**
 * Focus appearance (consoles 12.1, Req 5.1; design language: "focus is always
 * visible as a 2 px ink outline"). jsdom cannot compute `:focus-visible`, so
 * this is a text heuristic over the stylesheet source: it finds the rules, not
 * what a browser paints. The real appearance is a manual browser check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";


const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const SHEETS = {
  frame: read("./shell/frame.css"),
  entry: read("./shell/entry.css"),
  decision: read("./shell/decision.css"),
  run: read("./shell/run.css"),
  booth: read("./consoles/booth/booth.css"),
  tower: read("./consoles/tower/tower.css"),
};

interface Rule {
  selector: string;
  body: string;
}

function rules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Innermost blocks only, so rules inside @media are included.
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2].replace(/\s+/g, " ").trim(),
  }));
}

const INK_OUTLINE = /outline:\s*2px solid (var\(--ink[^)]*\)|#1a1916)/i;
const NO_OUTLINE = /outline:\s*(none|0)\b/i;

describe.each(Object.entries(SHEETS))("%s stylesheet focus", (_name, source) => {
  it("has a :focus-visible rule with a 2 px ink outline", () => {
    const focus = rules(source).filter((r) => r.selector.includes(":focus-visible"));
    expect(focus.length).toBeGreaterThan(0);
    expect(focus.some((r) => INK_OUTLINE.test(r.body))).toBe(true);
  });

  it("never removes an outline without a visible replacement in the same rule", () => {
    for (const r of rules(source)) {
      if (NO_OUTLINE.test(r.body)) expect(r.body, r.selector).toMatch(INK_OUTLINE);
    }
  });
});
