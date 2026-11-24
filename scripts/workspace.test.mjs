// Feature: skeleton, task 1.1. Asserts the workspace wiring in config files.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const yaml = readFileSync(new URL("pnpm-workspace.yaml", root), "utf8");
const recursive = 'pnpm -r --filter "./packages/*" --filter "./apps/*"';

describe("workspace wiring", () => {
  it("declares packages/* and apps/* in pnpm-workspace.yaml", () => {
    expect(yaml).toMatch(/^\s*-\s*["']?packages\/\*["']?\s*$/m);
    expect(yaml).toMatch(/^\s*-\s*["']?apps\/\*["']?\s*$/m);
  });

  it("runs test, typecheck and build recursively over packages and apps", () => {
    for (const name of ["test", "typecheck", "build"]) {
      expect(pkg.scripts[name], name).toContain(`${recursive} ${name}`);
    }
  });

  it("keeps test:tooling and folds it into test", () => {
    expect(pkg.scripts["test:tooling"]).toBe("vitest run --config vitest.tooling.config.mjs");
    expect(pkg.scripts.test).toContain("pnpm test:tooling");
  });

  it("has no flat scripts, no hindsight bridge and no root src/", () => {
    for (const name of Object.keys(pkg.scripts)) expect(name, name).not.toMatch(/:flat$/);
    expect(pkg.devDependencies?.hindsight).toBeUndefined();
    expect(pkg.dependencies?.hindsight).toBeUndefined();
    expect(existsSync(new URL("src", root))).toBe(false);
    expect(existsSync(new URL("vite.config.ts", root))).toBe(false);
  });
  it("ends the root build with the site assembly step", () => {
    expect(pkg.scripts.build).toMatch(/&& node scripts\/site\/assemble\.mjs$/);
  });

  it("never swallows failures", () => {
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      expect(cmd, name).not.toContain("--no-bail");
      expect(cmd, name).not.toContain("|| true");
    }
  });
  it("gives each of the three packages its own package.json", () => {
    for (const dir of ["packages/hindsight", "apps/dead-air", "apps/night-desk"]) {
      const file = new URL(`${dir}/package.json`, root);
      expect(existsSync(file), dir).toBe(true);
      const p = JSON.parse(readFileSync(file, "utf8"));
      expect(p.name, dir).toBe(dir.split("/")[1]);
      for (const name of ["test", "typecheck", "build"]) expect(p.scripts[name], `${dir} ${name}`).toBeTruthy();
    }
  });
});
