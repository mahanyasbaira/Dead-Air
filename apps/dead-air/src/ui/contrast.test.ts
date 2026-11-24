/**
 * Contrast audit (consoles 13.2, Req 5.3). Plain palette: there is no CRT layer.
 *
 * Reads the colour tokens from shell/base.css (light, and dark under
 * prefers-color-scheme) and every text, background, outline and border colour
 * from the shell, console and fx stylesheets, then checks WCAG 2.x ratios:
 * 4.5:1 for text (all shell text is 13-24 px regular or medium, so none counts
 * as large), 3:1 for focus outlines and borders that identify a control or a
 * state. It is a text heuristic over the CSS source, not a computed-style check:
 * it assumes an element sits on --paper unless its own rule sets another
 * solid background, and a hover or active rule that sets only a background is
 * paired with --ink text. Hairlines (--grey-2, --grey-3) are decoration.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The app has no @types/node, so this uses URLs only (see css-raw.d.ts, motion-fs.d.ts).
const UI = new URL(".", import.meta.url);

function cssFiles(dir: URL): URL[] {
  const out: URL[] = [];
  for (const name of readdirSync(dir)) {
    const child = new URL(name, dir);
    if (statSync(child).isDirectory()) out.push(...cssFiles(new URL(`${name}/`, dir)));
    else if (name.endsWith(".css")) out.push(child);
  }
  return out;
}
const rel = (u: URL) => u.href.slice(UI.href.length);
// The prototype's ui/styles.css sits directly in UI, so only these folders are the shell.
const SHELL_CSS = ["shell/", "consoles/", "fx/"].flatMap((d) => cssFiles(new URL(d, UI)));
const BASE = readFileSync(new URL("shell/base.css", UI), "utf8");

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// --- WCAG ---
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- tokens ---
type Tokens = Record<string, string>;
function tokensIn(block: string): Tokens {
  const t: Tokens = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) t[m[1]] = m[2].toLowerCase();
  return t;
}
const baseCss = strip(BASE);
const darkStart = baseCss.indexOf("@media (prefers-color-scheme: dark)");
const LIGHT: Tokens = tokensIn(baseCss.slice(0, darkStart));
const DARK: Tokens = { ...LIGHT, ...tokensIn(baseCss.slice(darkStart)) };
const SCHEMES: Record<string, Tokens> = { light: LIGHT, dark: DARK };

// --- rules ---
interface Rule {
  file: string;
  selector: string;
  decls: Record<string, string>;
}
function rulesOf(fileUrl: URL): Rule[] {
  const file = rel(fileUrl);
  const css = strip(readFileSync(fileUrl, "utf8"));
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => {
    const decls: Record<string, string> = {};
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\s+/g, " ").trim();
    }
    return { file, selector: m[1].trim().replace(/\s+/g, " "), decls };
  });
}
const RULES = [...SHELL_CSS].flatMap(rulesOf);

/** `var(--x, #fallback)` -> { token, fallback }; a bare hex -> { fallback }. */
function colourRef(v: string): { token?: string; fallback?: string } | null {
  const m = v.match(/^var\((--[a-z0-9-]+)(?:,\s*(#[0-9a-fA-F]{6}))?\)$/);
  if (m) return { token: m[1], fallback: m[2]?.toLowerCase() };
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return { fallback: v.toLowerCase() };
  return null; // inherit, transparent, none, currentColor, ...
}

interface TextPair {
  where: string;
  fg: string; // token
  bg: string; // token
}
const textPairs: TextPair[] = [];
for (const r of RULES) {
  const bgRaw = r.decls["background"] ?? r.decls["background-color"];
  const bg = bgRaw ? colourRef(bgRaw)?.token : undefined;
  const fgRaw = r.decls["color"] ? colourRef(r.decls["color"]) : null;
  const fg = fgRaw?.token ?? (bg && !r.decls["color"] ? "--ink" : undefined);
  if (fgRaw && !fgRaw.token) continue; // literal hex colour handled by the literal test below
  if (!fg) continue;
  textPairs.push({ where: `${r.file} ${r.selector}`, fg, bg: bg ?? "--paper" });
}
// body is the root of every other pair.
const BODY = RULES.find((r) => r.file.endsWith("base.css") && r.selector === "body");

describe("tokens", () => {
  it("reads all palette tokens for both appearances", () => {
    for (const t of ["--paper", "--ink", "--grey-1", "--grey-2", "--grey-3", "--loss"]) {
      expect(LIGHT[t], `light ${t}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(DARK[t], `dark ${t}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(LIGHT["--paper"]).toBe("#f5f2ea");
    expect(LIGHT["--ink"]).toBe("#1a1916");
    expect(LIGHT["--loss"]).toBe("#9a3b26");
    expect(DARK["--paper"]).toBe("#141311");
  });
  it("only base.css switches appearance, so the tokens cover the whole shell", () => {
    const others = SHELL_CSS.filter((f) => !rel(f).endsWith("base.css"));
    for (const f of others) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/prefers-color-scheme/);
  });
  it("uses only defined tokens, and fallbacks equal the light value", () => {
    for (const r of RULES) {
      for (const [prop, val] of Object.entries(r.decls)) {
        for (const m of val.matchAll(/var\((--[a-z0-9-]+)(?:,\s*(#[0-9a-fA-F]{6}))?\)/g)) {
          const [, token, fallback] = m;
          if (token === "--sans" || token === "--mono") continue;
          expect(LIGHT[token], `${r.file} ${r.selector} { ${prop} } uses undefined ${token}`).toBeDefined();
          if (fallback) expect(fallback.toLowerCase(), `${r.file} ${r.selector} ${token} fallback`).toBe(LIGHT[token]);
        }
      }
    }
  });
});

describe("text contrast, 4.5:1", () => {
  it("collects a meaningful set of pairs", () => {
    expect(BODY?.decls["color"]).toBe("var(--ink)");
    expect(textPairs.length).toBeGreaterThan(20);
  });
  for (const [scheme, tokens] of Object.entries(SCHEMES)) {
    it(`every text and background pair passes in the ${scheme} appearance`, () => {
      const seen = new Map<string, number>();
      const failures: string[] = [];
      for (const p of [{ where: "base.css body", fg: "--ink", bg: "--paper" }, ...textPairs]) {
        const r = ratio(tokens[p.fg], tokens[p.bg]);
        seen.set(`${p.fg} on ${p.bg}`, r);
        if (r < 4.5) failures.push(`${p.where}: ${p.fg} on ${p.bg} = ${r.toFixed(2)}:1`);
      }
      const lines = [...seen].map(([k, v]) => `  ${scheme} ${k}: ${v.toFixed(2)}:1`);
      console.log(`Text pairs, ${scheme}\n${lines.join("\n")}`);
      expect(failures).toEqual([]);
    });
  }
});

describe("non-text contrast, 3:1", () => {
  const nonText = new Set<string>();
  for (const r of RULES) {
    for (const [prop, val] of Object.entries(r.decls)) {
      if (!/^(outline|border(-(top|right|bottom|left))?)$/.test(prop)) continue;
      if (val === "0" || /^none\b/.test(val)) continue;
      const m = val.match(/var\((--[a-z0-9-]+)/);
      if (!m) continue;
      const width = val.match(/(\d+)px/)?.[1];
      // Controls and focus outlines (any width), and 2 px state borders, must reach 3:1.
      // 1 px --grey-2 / --grey-3 rules are hairlines.
      const hairline = width === "1" && (m[1] === "--grey-3" || m[1] === "--grey-2");
      const decoration = m[1] === "--grey-2" || m[1] === "--grey-3";
      if (!hairline && !decoration) nonText.add(m[1]);
    }
  }
  it("finds the focus outline, control borders and loss borders", () => {
    expect([...nonText].sort()).toEqual(["--ink", "--loss"]);
  });
  for (const [scheme, tokens] of Object.entries(SCHEMES)) {
    it(`outlines and state borders reach 3:1 against paper in the ${scheme} appearance`, () => {
      const lines: string[] = [];
      for (const t of nonText) {
        const r = ratio(tokens[t], tokens["--paper"]);
        lines.push(`  ${scheme} ${t} on --paper: ${r.toFixed(2)}:1`);
        expect(r, `${t} on paper (${scheme})`).toBeGreaterThanOrEqual(3);
      }
      // Idle lamp border and disabled-control borders use --grey-2: decoration, the state is in text.
      lines.push(`  ${scheme} --grey-2 on --paper (decoration only): ${ratio(tokens["--grey-2"], tokens["--paper"]).toFixed(2)}:1`);
      lines.push(`  ${scheme} --grey-3 on --paper (hairline): ${ratio(tokens["--grey-3"], tokens["--paper"]).toFixed(2)}:1`);
      console.log(`Non-text, ${scheme}\n${lines.join("\n")}`);
    });
  }
  it("the idle lamp keeps its state in text, not in its --grey-2 border", () => {
    const lamp = RULES.find((r) => r.selector === ".tower-lamp-idle");
    expect(lamp?.decls["color"]).toBe("var(--grey-1, #6b6861)");
  });
});

describe("--grey-2 (#a9a59b) is for hairlines only", () => {
  it("is never used as a text colour, by token or by literal", () => {
    for (const r of RULES) {
      const c = r.decls["color"];
      if (!c) continue;
      expect(c, `${r.file} ${r.selector}`).not.toMatch(/--grey-2/);
      expect(c.toLowerCase(), `${r.file} ${r.selector}`).not.toContain("a9a59b");
    }
  });
  it("is not used for a literal text colour anywhere in the shell sheets", () => {
    for (const f of SHELL_CSS) {
      expect(strip(readFileSync(f, "utf8")), rel(f)).not.toMatch(/(^|[;{\s])color:\s*[^;]*#a9a59b/i);
    }
  });
});
