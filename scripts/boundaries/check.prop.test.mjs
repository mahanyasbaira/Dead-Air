import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_WORDS, checkBoundaries } from "./check.mjs";

const K = "packages/hindsight/src";
const importerFiles = [
  "apps/dead-air/src/a.ts",
  "apps/dead-air/src/ui/b.tsx",
  "apps/night-desk/src/a.ts",
  `${K}/engine/a.ts`,
  `${K}/channel/a.ts`,
  `${K}/ledger/a.ts`,
  `${K}/replay/a.tsx`,
  `${K}/index.ts`,
];
const specifiers = [
  "./x", "../x", "../../x", "../../night-desk/src/x", "../../dead-air/src/x", "../../../packages/hindsight/src/x",
  "../engine/x", "../ledger/x", "../replay/x", "../channel/x", "../../../../apps/dead-air/src/x", "../../../../../apps/night-desk/x",
  "hindsight", "hindsight/replay", "hindsight/src/engine/types", "hindsight/other",
  "night-desk", "dead-air", "dead-air/src/x", "vitest", "left-pad", "react",
];

// Independent oracle, written from the design text, not from check.mjs.
function expected(file, spec) {
  const parts = file.split("/");
  const rel = spec.startsWith(".");
  const resolve = () => {
    const stack = parts.slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "..") (stack.length && stack[stack.length - 1] !== "^above-root" ? stack.pop() : stack.push("^above-root"));
      else if (seg !== ".") stack.push(seg);
    }
    return stack.join("/");
  };
  if (parts[0] === "apps") {
    const app = parts[1];
    if (rel) return !(resolve() + "/").startsWith(`apps/${app}/`);
    if (spec === "night-desk" || spec === "dead-air" || spec.startsWith("night-desk/") || spec.startsWith("dead-air/")) {
      return !spec.startsWith(app);
    }
    return spec.startsWith("hindsight/") && spec !== "hindsight/replay";
  }
  if (rel) {
    const target = resolve();
    if (!(target + "/").startsWith("packages/hindsight/")) return true;
    const order = { engine: 0, ledger: 1, replay: 2 };
    const from = parts[3], to = target.split("/")[3];
    if (from === "channel") return to === "ledger" || to === "replay";
    if (from in order && to in order) return order[to] > order[from];
    if (from in order && to === "channel") return true;
    return false;
  }
  return spec.includes("night-desk") || spec.includes("dead-air");
}

const importRules = new Set([
  "app-relative-leaves-app", "app-imports-other-app", "app-kit-deep-import",
  "kit-relative-leaves-kit", "kit-names-app", "kit-folder-direction",
]);

describe("boundary properties", () => {
  it("Feature: skeleton, Property 7: The boundary checker flags exactly the forbidden imports", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...importerFiles), fc.constantFrom(...specifiers)), { minLength: 1, maxLength: 8 }),
        (pairs) => {
          const byFile = new Map();
          pairs.forEach(([f, s]) => byFile.set(f, [...(byFile.get(f) ?? []), s]));
          const files = {};
          for (const [f, ss] of byFile) files[f] = ss.map((s) => `import x from "${s}";`).join("\n");
          // react is only forbidden for files reachable from the core entry; keep entry empty here.
          files[`${K}/index.ts`] = "export {};";
          const got = checkBoundaries(files).filter((v) => importRules.has(v.rule));
          for (const [f, ss] of byFile) {
            if (f === `${K}/index.ts`) continue;
            ss.forEach((s, i) => {
              const hit = got.filter((v) => v.file === f && v.line === i + 1 && v.specifier === s);
              expect(hit.length, `${f}:${i + 1} ${s}`).toBe(expected(f, s) ? 1 : 0);
            });
          }
          expect(got.length).toBe(
            [...byFile].filter(([f]) => f !== `${K}/index.ts`).reduce((n, [f, ss]) => n + ss.filter((s) => expected(f, s)).length, 0),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Feature: skeleton, Property 7: core-entry closure flags react and DOM globals only when reachable", () => {
    const banned = fc.constantFrom('import R from "react";', 'import D from "react-dom";', "const a = window;", "const b = document.body;", "const c = navigator;", "new AudioContext();", "new AudioWorkletNode(c);");
    fc.assert(
      fc.property(banned, fc.boolean(), (line, reachable) => {
        const files = {
          [`${K}/index.ts`]: reachable ? 'export * from "./engine/a";' : "export {};",
          [`${K}/engine/a.ts`]: `export const ok = 1;\n${line}`,
        };
        const got = checkBoundaries(files).filter((v) => v.rule.startsWith("core-entry"));
        expect(got.length > 0).toBe(reachable);
        if (reachable) expect(got.every((v) => v.line === 2)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  const safeText = fc
    .array(fc.constantFrom("const", "x", "=", "1;", "\n", " ", "// note", "send", "log", "a.b()", "Date", "Math", "now", "random"), { maxLength: 30 })
    .map((t) => t.join(" ").replace(/Date\s*\.\s*now|Math\s*\.\s*random/g, ""))
    .filter((t) => !FORBIDDEN_WORDS.some((w) => t.toLowerCase().includes(w)) && !/Date\.now|Math\.random/.test(t));
  const needles = fc.constantFrom(...FORBIDDEN_WORDS, "Math.random", "Date.now");
  const casing = (s, mask) => [...s].map((c, i) => (mask[i % mask.length] ? c.toUpperCase() : c.toLowerCase())).join("");

  it("Feature: skeleton, Property 8: Forbidden content in the kit is always found", () => {
    fc.assert(
      fc.property(safeText, needles, fc.nat(), fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (text, needle, pos, mask) => {
        const at = pos % (text.length + 1);
        const isApi = needle.includes(".");
        const inserted = isApi ? needle : casing(needle, mask);
        const dirty = `${text.slice(0, at)} ${inserted} ${text.slice(at)}`;
        const file = `${K}/engine/a.ts`;
        const got = checkBoundaries({ [file]: dirty });
        expect(got.some((v) => v.rule === (isApi ? "forbidden-api" : "forbidden-word") && v.specifier.toLowerCase() === needle.toLowerCase())).toBe(true);
        expect(checkBoundaries({ [file]: text })).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
