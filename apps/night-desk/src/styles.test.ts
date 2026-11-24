import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

describe("styles.css", () => {
  it("has the dark appearance under prefers-color-scheme", () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{[^}]*--paper:\s*#141311/);
  });

  it("turns every transition and animation off under reduced motion", () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?})\s*}/)?.[1] ?? "";
    expect(block).toMatch(/transition:\s*none/);
    expect(block).toMatch(/animation:\s*none/);
  });

  it("uses no gradient, blur, glow or shadow", () => {
    expect(css).not.toMatch(/gradient/i);
    expect(css).not.toMatch(/backdrop-filter/i);
    expect(css).not.toMatch(/(?:^|[;{\s])filter\s*:/i);
    expect(css).not.toMatch(/text-shadow/i);
    for (const m of css.matchAll(/box-shadow\s*:([^;}]*)/gi)) {
      // One hairline of elevation at most: 0 offset-blur, 1 px or less, no blur.
      expect(m[1]?.trim(), "box-shadow").toMatch(/^(none|0 [01]px 0 (0 )?var\(--grey-3\))$/);
    }
  });

  it("keeps radius to 2 px on controls and 0 on surfaces", () => {
    for (const m of css.matchAll(/border-radius\s*:\s*([^;}]*)/g)) {
      expect(m[1]?.trim()).toBe("var(--radius-control)");
    }
  });

  it("uses only sizes from the scale", () => {
    for (const m of css.matchAll(/font-size\s*:\s*([^;}]*)/g)) {
      const v = m[1]?.trim() ?? "";
      expect(v, "font-size").toMatch(/^var\(--fs-(13|15|18|24|40|72)\)$/);
    }
  });

  it("keeps the 2 px ink focus outline", () => {
    expect(css).toMatch(/:focus-visible\s*{\s*outline:\s*2px solid var\(--ink\)/);
  });
});
