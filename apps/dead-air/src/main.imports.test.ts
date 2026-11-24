/**
 * The shell must not depend on the prototype stylesheet (consoles 13.2, Part A).
 * Text heuristic over source: follows relative imports from RunHost and checks
 * that none of them, and no static import in main.tsx, reaches ui/styles.css.
 * `?prototype` may load it, but only through a guarded dynamic import.
 * URLs only: the app has no @types/node (see ui/css-raw.d.ts).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url);
const read = (u: URL) => readFileSync(u, "utf8");
const PROTOTYPE_CSS = new URL("ui/styles.css", SRC).href;

/** Resolves a relative specifier to an existing .ts/.tsx/.css file, or null. */
function resolveImport(from: URL, spec: string): URL | null {
  if (!spec.startsWith(".")) return null;
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const u = new URL(spec + suffix, from);
    if (!/\.(tsx?|css)$/.test(u.pathname)) continue;
    try {
      read(u);
      return u;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}
function staticImports(file: URL): string[] {
  return [...read(file).matchAll(/^\s*(?:import|export)\b[^"';]*?(?:from\s*)?["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("shell stylesheet independence", () => {
  it("no module reachable from RunHost imports the prototype ui/styles.css", () => {
    const seen = new Set<string>();
    const queue = [new URL("ui/shell/RunHost.tsx", SRC)];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f.href)) continue;
      seen.add(f.href);
      if (f.pathname.endsWith(".css")) {
        expect(read(f), f.href).not.toMatch(/@import[^;]*styles\.css/);
        continue;
      }
      for (const spec of staticImports(f)) {
        const target = resolveImport(f, spec);
        expect(target?.href, `${f.href} imports ${spec}`).not.toBe(PROTOTYPE_CSS);
        if (target) queue.push(target);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });
  it("main.tsx statically imports shell/base.css and not ui/styles.css", () => {
    const main = new URL("main.tsx", SRC);
    const targets = staticImports(main).map((s) => resolveImport(main, s)?.href);
    expect(targets).toContain(new URL("ui/shell/base.css", SRC).href);
    expect(targets).not.toContain(PROTOTYPE_CSS);
  });
  it("the prototype stylesheet is loaded only behind the prototype check", () => {
    const code = read(new URL("main.tsx", SRC))
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect([...code.matchAll(/styles\.css/g)].length).toBe(1);
    expect(code).toMatch(/prototype\s*\?\s*import\(\s*"\.\/ui\/styles\.css"\s*\)/);
  });
});
