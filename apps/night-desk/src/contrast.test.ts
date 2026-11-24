/**
 * Contrast audit for Night Desk (Req 6.2). Colours are read from styles.css, light
 * from the first :root block and dark from the prefers-color-scheme block; none is
 * hard-coded here except the design-language palette the light tokens must equal.
 *
 * It is a text heuristic over the CSS source: a rule is paired with --paper unless
 * it sets its own background, and a rule that sets only a background on a button is
 * paired with --ink text. Text is 13-24 px regular or medium, so 4.5:1 applies.
 * Focus outlines and control borders must reach 3:1. 1 px --grey-3 and --grey-2
 * rules are hairlines (decoration); --grey-2 (#a9a59b in light) is never text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const CSS = strip(readFileSync(new URL("./styles.css", import.meta.url), "utf8"));

export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] as number) + 0.7152 * (lin[1] as number) + 0.0722 * (lin[2] as number);
}
export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

type Tokens = Record<string, string>;
const tokensIn = (block: string): Tokens => {
  const t: Tokens = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) t[m[1] as string] = (m[2] as string).toLowerCase();
  return t;
};
const darkStart = CSS.indexOf("@media (prefers-color-scheme: dark)");
const LIGHT = tokensIn(CSS.slice(0, darkStart));
const DARK: Tokens = { ...LIGHT, ...tokensIn(CSS.slice(darkStart)) };
const SCHEMES: Record<string, Tokens> = { light: LIGHT, dark: DARK };

interface Rule {
  selector: string;
  decls: Record<string, string>;
}
const RULES: Rule[] = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => {
  const decls: Record<string, string> = {};
  for (const d of (m[2] as string).split(";")) {
    const i = d.indexOf(":");
    if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\s+/g, " ").trim();
  }
  return { selector: (m[1] as string).trim().replace(/\s+/g, " "), decls };
}).filter((r) => !r.selector.startsWith("@font-face") && !r.selector.includes("@font-face"));

const tokenOf = (v: string | undefined): string | undefined => v?.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];

interface Pair { where: string; fg: string; bg: string }
const PAIRS: Pair[] = [];
for (const r of RULES) {
  const bg = tokenOf(r.decls["background"] ?? r.decls["background-color"]);
  const fg = tokenOf(r.decls["color"]);
  if (fg) PAIRS.push({ where: r.selector, fg, bg: bg ?? "--paper" });
  else if (bg && /\bbutton\b/.test(r.selector)) PAIRS.push({ where: r.selector, fg: "--ink", bg });
}

describe("tokens", () => {
  it("defines the replay's token names in both appearances", () => {
    for (const t of ["--paper", "--ink", "--grey-1", "--grey-2", "--grey-3", "--loss"]) {
      expect(LIGHT[t], `light ${t}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(DARK[t], `dark ${t}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("uses the design-language palette", () => {
    expect(LIGHT["--paper"]).toBe("#f5f2ea");
    expect(LIGHT["--ink"]).toBe("#1a1916");
    expect(LIGHT["--grey-1"]).toBe("#6b6861");
    expect(LIGHT["--grey-2"]).toBe("#a9a59b");
    expect(LIGHT["--grey-3"]).toBe("#ddd9cf");
    expect(LIGHT["--loss"]).toBe("#9a3b26");
    expect(DARK["--paper"]).toBe("#141311");
    expect(DARK["--ink"]).toBe("#f5f2ea");
  });
  it("keeps every colour literal inside the two token blocks", () => {
    const outside = CSS.replace(/:root\s*{[^}]*}/g, "");
    expect(outside).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it("uses only defined tokens", () => {
    for (const r of RULES) {
      for (const [prop, val] of Object.entries(r.decls)) {
        for (const m of val.matchAll(/var\((--[a-z0-9-]+)/g)) {
          const t = m[1] as string;
          const defined = CSS.includes(`${t}:`);
          expect(defined, `${r.selector} { ${prop} } uses undefined ${t}`).toBe(true);
        }
      }
    }
  });
  it("declares the type scale, radius and spacing tokens", () => {
    for (const n of [13, 15, 18, 24, 40, 72]) expect(CSS).toContain(`--fs-${n}: ${n}px;`);
    expect(CSS).toContain("--radius-control: 2px;");
    expect(CSS).toContain("--radius-surface: 0;");
    expect(CSS).toContain("--s: 8px;");
  });
});

describe("text contrast, 4.5:1", () => {
  it("collects a meaningful set of pairs", () => {
    expect(PAIRS.length).toBeGreaterThan(4);
    expect(PAIRS.some((p) => p.fg === "--loss")).toBe(true);
    expect(PAIRS.some((p) => p.fg === "--grey-1")).toBe(true);
  });
  for (const [scheme, tokens] of Object.entries(SCHEMES)) {
    it(`every text and background pair passes in the ${scheme} appearance`, () => {
      const seen = new Map<string, number>();
      const failures: string[] = [];
      for (const p of PAIRS) {
        const r = ratio(tokens[p.fg] as string, tokens[p.bg] as string);
        seen.set(`${p.fg} ${tokens[p.fg]} on ${p.bg} ${tokens[p.bg]}`, r);
        if (r < 4.5) failures.push(`${p.where}: ${p.fg} on ${p.bg} = ${r.toFixed(2)}:1`);
      }
      console.log(`Text pairs, ${scheme}\n${[...seen].map(([k, v]) => `  ${k}: ${v.toFixed(2)}:1`).join("\n")}`);
      expect(failures).toEqual([]);
    });
  }
});

describe("non-text contrast, 3:1", () => {
  const nonText = new Set<string>();
  for (const r of RULES) {
    for (const [prop, val] of Object.entries(r.decls)) {
      if (!/^(outline|border(-(top|right|bottom|left))?)$/.test(prop)) continue;
      const t = val.match(/var\((--[a-z0-9-]+)/)?.[1];
      if (t && t !== "--grey-2" && t !== "--grey-3") nonText.add(t);
    }
  }
  it("finds the focus outline and control borders", () => {
    expect([...nonText]).toEqual(["--ink"]);
  });
  it("keeps the 2 px ink focus outline", () => {
    const f = RULES.find((r) => r.selector === ":focus-visible");
    expect(f?.decls["outline"]).toBe("2px solid var(--ink)");
  });
  for (const [scheme, tokens] of Object.entries(SCHEMES)) {
    it(`outlines and borders reach 3:1 against paper in the ${scheme} appearance`, () => {
      const lines: string[] = [];
      for (const t of nonText) {
        const r = ratio(tokens[t] as string, tokens["--paper"] as string);
        lines.push(`  ${t} on --paper: ${r.toFixed(2)}:1`);
        expect(r, `${t} on paper (${scheme})`).toBeGreaterThanOrEqual(3);
      }
      for (const t of ["--grey-2", "--grey-3"]) {
        lines.push(`  ${t} on --paper (hairline, decoration): ${ratio(tokens[t] as string, tokens["--paper"] as string).toFixed(2)}:1`);
      }
      console.log(`Non-text, ${scheme}\n${lines.join("\n")}`);
    });
  }
});

describe("--grey-2 is for hairlines only", () => {
  it("is never a text colour, by token or by literal", () => {
    for (const r of RULES) {
      const c = r.decls["color"];
      if (!c) continue;
      expect(c, r.selector).not.toMatch(/--grey-2/);
      expect(c.toLowerCase(), r.selector).not.toContain("a9a59b");
    }
  });
});
