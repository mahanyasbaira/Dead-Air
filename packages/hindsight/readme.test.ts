// Node-only checks on README.md and the example it embeds. Not part of the core
// tsconfig (no node types there); vitest runs it in the node environment.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = (p: string) => new URL(p, import.meta.url);
const readme = readFileSync(here("./README.md"), "utf8");
const example = readFileSync(here("./examples/minimal-drill.ts"), "utf8");

// Assembled from parts so this file does not itself contain the words it bans.
const BANNED = [
  ["resi", "dent"], ["boo", "th"], ["mod", "em"], ["tow", "er"],
  ["night", " desk"], ["dead", " air"], ["f", "sk"], ["acou", "stic"],
].map((parts) => parts.join(""));

describe("kit README", () => {
  it("is under 150 lines", () => {
    expect(readme.split("\n").length).toBeLessThan(150);
  });

  it("embeds the example file verbatim in exactly one ts block", () => {
    const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)];
    expect(blocks).toHaveLength(1);
    expect(blocks[0][1]).toBe(example);
    expect(readme.match(/```/g)).toHaveLength(2);
  });

  it("keeps the example at 30 non-blank lines or fewer", () => {
    const lines = example.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  it("leaves a marked slot for the scenario section", () => {
    const start = readme.indexOf("<!-- scenario-section:start -->");
    const end = readme.indexOf("<!-- scenario-section:end -->");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("uses neutral wording in the README and the example", () => {
    for (const text of [readme, example]) {
      const lower = text.toLowerCase();
      for (const word of BANNED) expect(lower.includes(word), word).toBe(false);
    }
  });
});
