/**
 * No animation anywhere in the console UI (consoles 12.2, Req 5.2). The app
 * has no CRT layer, no needle, a static SVG signal indicator and a Teleprinter
 * that shows each line at once, so there is nothing to switch off: these text
 * scans keep it that way. Not covered: the prototype `ui/styles.css`, which is
 * history and has its own rules. Whether reduced motion looks right in a real
 * browser stays a manual check.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIRS = ["shell", "consoles", "fx"];

function walk(rel: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(`./${rel}/`, import.meta.url))) {
    const child = `${rel}/${name}`;
    if (statSync(new URL(`./${child}`, import.meta.url)).isDirectory()) out.push(...walk(child));
    else out.push(child);
  }
  return out;
}
const files = DIRS.flatMap(walk);
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const cssFiles = files.filter((f) => f.endsWith(".css"));
const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const sourceFiles = files.filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts") && !isTest(f));
const stripCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripCode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const REDUCE = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g;
interface Rule { selector: string; body: string }
const rulesOf = (css: string): Rule[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

describe("stylesheet inventory", () => {
  it("finds the console stylesheets", () => {
    expect(cssFiles.length).toBeGreaterThanOrEqual(6);
  });
});

describe.each(cssFiles)("%s", (file) => {
  const css = stripCss(read(file));
  it("has no animation, @keyframes or infinite", () => {
    expect(css).not.toMatch(/@keyframes/i);
    expect(css).not.toMatch(/(^|[\s;{-])animation(-[a-z-]+)?\s*:/i);
    expect(css).not.toMatch(/\binfinite\b/i);
  });
  it("covers every transition with a reduced-motion rule or keeps it to a short opacity fade", () => {
    const reduced = [...css.matchAll(REDUCE)].flatMap((m) => rulesOf(m[1]));
    const killed = reduced.filter((r) => /transition\s*:\s*none\b/i.test(r.body)).map((r) => r.selector);
    const outside = rulesOf(css.replace(REDUCE, ""));
    const covered = (sel: string) =>
      sel.split(",").every((one) =>
        killed.some((k) =>
          k.split(",").some((kk) => {
            const kt = kk.trim();
            const o = one.trim();
            return kt === o || (kt.endsWith(" *") && o.startsWith(kt.slice(0, -2)));
          }),
        ),
      );
    const bad: string[] = [];
    for (const r of outside) {
      const m = r.body.match(/transition(-[a-z-]+)?\s*:\s*([^;]+)/gi);
      if (!m) continue;
      for (const decl of m) {
        const value = decl.replace(/^[^:]+:\s*/, "");
        if (/^none\b/i.test(value)) continue;
        const parts = value.split(",").map((p) => p.trim());
        const smallOpacity = parts.every((p) => {
          const ms = p.match(/^opacity\s+(\d+(?:\.\d+)?)(ms|s)\b/i);
          return !!ms && (ms[2] === "s" ? Number(ms[1]) * 1000 : Number(ms[1])) <= 120;
        });
        if (!smallOpacity && !covered(r.selector)) bad.push(`${r.selector}: ${decl}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** file -> why a hit is acceptable. Empty on purpose: nothing needs one today. */
const ALLOW: Record<string, { pattern: string; reason: string }[]> = {};
const FORBIDDEN = [/\brequestAnimationFrame\b/, /\bsetInterval\b/, /\.animate\s*\(/];

describe("source files", () => {
  it("scan a non-trivial set of files", () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
  });
  it("have no animation loops (rAF, setInterval, Element.animate)", () => {
    const hits: string[] = [];
    for (const f of sourceFiles) {
      const code = stripCode(read(f));
      for (const re of FORBIDDEN) {
        if (re.test(code) && !(ALLOW[f] ?? []).some((a) => a.pattern === re.source && a.reason)) {
          hits.push(`${f}: ${re.source}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
  it("use setTimeout only where listed", () => {
    // RunHost.tsx: defaultSchedule, the carrier airtime scheduler (one-shot).
    // Mic permission timeout lives in src/transport/select.ts, outside these folders.
    const users = sourceFiles.filter((f) => /\bsetTimeout\b/.test(stripCode(read(f))));
    expect(users).toEqual(["shell/RunHost.tsx"]);
  });
});
