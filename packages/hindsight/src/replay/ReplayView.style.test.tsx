// @vitest-environment jsdom
// Print, theme and contrast rules for the replay's inline style (Req 6.3).
// Print output itself is a manual check; this only pins the rules that make it work.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import { buildLedger } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";

afterEach(cleanup);

const LIGHT: Record<string, string> = {
  "--paper": "#f5f2ea",
  "--ink": "#1a1916",
  "--grey-1": "#6b6861",
  "--grey-2": "#a9a59b",
  "--grey-3": "#ddd9cf",
  "--loss": "#9a3b26",
};
// The dark values the apps supply for the same custom properties.
const DARK: Record<string, string> = {
  "--paper": "#141311",
  "--ink": "#f5f2ea",
  "--grey-1": "#a9a59b",
  "--grey-2": "#6b6861",
  "--grey-3": "#34322d",
  "--loss": "#d9806a",
};

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function styleText(): string {
  const base = buildParticipantsFixture(["a", "b"]);
  const ledger = buildLedger([{ kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2 }]);
  const { container } = render(<ReplayView ledger={ledger} scenario={base} />);
  const el = container.querySelector("style");
  if (el === null) throw new Error("no inline style");
  return el.textContent ?? "";
}
const CSS = styleText().replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the first `@media <query> { ... }` block. */
function mediaBlock(query: string): string {
  const start = CSS.indexOf(`@media ${query}`);
  if (start < 0) return "";
  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) return CSS.slice(open + 1, i);
  }
  return "";
}

describe("ReplayView style: print", () => {
  const print = mediaBlock("print");
  it("keeps the figure on one page and mid grey for faded items", () => {
    expect(print).toMatch(/\.hs-figure\s*\{[^}]*break-inside:\s*avoid/);
    expect(print).toMatch(/\.hs-figure\s*\{[^}]*page-break-inside:\s*avoid/);
    expect(print).toMatch(/\.hs-figure svg\s*\{[^}]*max-height/);
    expect(print).toMatch(/\.hs-faded\s*\{[^}]*stroke:\s*var\(--grey-2,\s*#A9A59B\)/);
  });
  it("prints loss lines in ink, dotted, and no literal black", () => {
    expect(print).toMatch(/\.hs-loss\s*\{[^}]*stroke:\s*var\(--ink,\s*#1A1916\)/);
    expect(print).toMatch(/\.hs-loss\s*\{[^}]*stroke-dasharray:\s*2 3/);
    expect(CSS).not.toMatch(/#0{3}\b|#0{6}\b|\bblack\b/i);
  });
  it("pins the light values on the view so a dark appearance does not print pale", () => {
    const decl = print.match(/\.hs-replay\s*\{([^}]*)\}/)?.[1] ?? "";
    for (const [token, hex] of Object.entries(LIGHT)) {
      expect(decl.toLowerCase(), token).toContain(`${token}: ${hex}`);
    }
  });
});

describe("ReplayView style: theme", () => {
  it("uses colour only through custom properties with the light fallbacks", () => {
    const hexes = [...CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)];
    expect(hexes.length).toBeGreaterThan(10);
    for (const m of hexes) {
      const before = CSS.slice(Math.max(0, m.index - 24), m.index);
      const viaVar = before.match(/var\((--[a-z0-9-]+),\s*$/);
      const viaDecl = before.match(/(--[a-z0-9-]+):\s*$/);
      const token = viaVar?.[1] ?? viaDecl?.[1];
      expect(token, `bare colour ${m[0]}`).toBeDefined();
      expect(LIGHT[token!], `unknown token ${token}`).toBeDefined();
      expect(m[0].toLowerCase(), `${token} fallback`).toBe(LIGHT[token!]);
    }
    expect(CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
  });
  it("has no gradient, deep shadow, filter or animation", () => {
    expect(CSS).not.toMatch(/gradient/i);
    expect(CSS).not.toMatch(/\bfilter\s*:|backdrop-filter/i);
    expect(CSS).not.toMatch(/animation|@keyframes/i);
    expect(CSS).not.toMatch(/transition:[^;]*transform/);
    for (const m of CSS.matchAll(/box-shadow\s*:\s*([^;}]*)/g)) {
      const px = [...m[1]!.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((x) => Math.abs(Number(x[1])));
      expect(Math.max(0, ...px), m[0]).toBeLessThanOrEqual(1);
    }
  });
  it("lets long time labels past the left edge of the figure instead of clipping them", () => {
    // Found in a browser: "sim-minute 7" was cut to "inute 7" at the left of the viewBox.
    expect(CSS).toMatch(/\.hs-figure svg\s*\{[^}]*overflow:\s*visible/);
  });
  it("only animates opacity, 120 ms, and removes it under reduced motion", () => {
    for (const m of CSS.matchAll(/transition:\s*([^;}]*)/g)) expect(m[1]).toMatch(/^opacity 120ms linear$|^none$/);
    const reduced = mediaBlock("(prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/\.hs-ink, \.hs-loss, \.hs-faded, \.hs-side\s*\{\s*transition:\s*none/);
  });
  it("never uses the two lightest greys for text", () => {
    for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2]!;
      expect(body, m[1]!.trim()).not.toMatch(/(^|[;\s])color:\s*[^;]*(--grey-[23]|#A9A59B|#DDD9CF)/i);
      if (/\.hs-label|\.hs-time|text/.test(m[1]!)) {
        expect(body, m[1]!.trim()).not.toMatch(/fill:\s*[^;]*(--grey-[23]|#A9A59B|#DDD9CF)/i);
      }
    }
  });
});

describe("ReplayView style: contrast", () => {
  const lines: string[] = [];
  for (const [name, set] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`ink and grey-1 reach 4.5:1 and loss reaches 4.5:1 on paper, ${name}`, () => {
      for (const t of ["--ink", "--grey-1", "--loss"]) {
        const r = ratio(set[t]!, set["--paper"]!);
        lines.push(`${name} ${t} ${set[t]} on ${set["--paper"]}: ${r.toFixed(2)}:1`);
        expect(r, `${name} ${t}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`the loss and ink lines reach 3:1 as non-text, ${name}`, () => {
      for (const t of ["--ink", "--loss"]) expect(ratio(set[t]!, set["--paper"]!)).toBeGreaterThanOrEqual(3);
    });
  }
  it("the two lightest greys are decoration and are below the text bar", () => {
    expect(ratio(LIGHT["--grey-2"]!, LIGHT["--paper"]!)).toBeLessThan(4.5);
    expect(ratio(LIGHT["--grey-3"]!, LIGHT["--paper"]!)).toBeLessThan(3);
  });
});
