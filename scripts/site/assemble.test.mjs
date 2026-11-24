// Feature: skeleton, task 6.1. Assembly on a temp directory, plus landing page checks.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assemble } from "./assemble.mjs";

const script = fileURLToPath(new URL("./assemble.mjs", import.meta.url));
const dirs = [];
function fixture(skip) {
  const root = mkdtempSync(join(tmpdir(), "assemble-"));
  dirs.push(root);
  for (const d of ["site", "apps/night-desk/dist", "apps/dead-air/dist"]) {
    if (d === skip) continue;
    mkdirSync(join(root, d, "assets"), { recursive: true });
    writeFileSync(join(root, d, "index.html"), d);
    writeFileSync(join(root, d, "assets/a.js"), "x");
  }
  return root;
}
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

describe("assemble", () => {
  it("copies all three parts and replaces a stale dist", () => {
    const root = fixture();
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist/stale.txt"), "old");
    assemble(root);
    expect(readFileSync(join(root, "dist/index.html"), "utf8")).toBe("site");
    expect(readFileSync(join(root, "dist/night-desk/index.html"), "utf8")).toBe("apps/night-desk/dist");
    expect(readFileSync(join(root, "dist/dead-air/assets/a.js"), "utf8")).toBe("x");
    expect(existsSync(join(root, "dist/stale.txt"))).toBe(false);
  });
  it("writes a scoped sw.js into each app and none at the root", () => {
    const root = fixture();
    writeFileSync(join(root, "apps/dead-air/dist/assets/a.js.map"), "{}");
    assemble(root);
    const dead = readFileSync(join(root, "dist/dead-air/sw.js"), "utf8");
    const night = readFileSync(join(root, "dist/night-desk/sw.js"), "utf8");
    expect(dead).toContain('"base": "/dead-air/"');
    expect(dead).toContain('"/dead-air/assets/a.js"');
    expect(dead).not.toContain("a.js.map");
    expect(dead).not.toContain("night-desk");
    expect(night).toContain('"base": "/night-desk/"');
    expect(night).not.toContain("dead-air");
    expect(existsSync(join(root, "dist/sw.js"))).toBe(false);
    expect(dead).not.toContain("/sw.js");
  });
  it("names the missing index.html and leaves dist untouched", () => {
    const root = fixture("apps/dead-air/dist");
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist/keep.txt"), "k");
    expect(() => assemble(root)).toThrow(/apps\/dead-air\/dist\/index\.html/);
    expect(existsSync(join(root, "dist/keep.txt"))).toBe(true);
  });
  it("CLI exits 1 and names the file when a part is missing", () => {
    const code = `import { main } from ${JSON.stringify(script)}; process.exitCode = main(process.argv[1]);`;
    const run = (root) => spawnSync(process.execPath, ["--input-type=module", "-e", code, root], { encoding: "utf8" });
    const bad = run(fixture("site"));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("site/index.html");
    expect(run(fixture()).status).toBe(0);
  });
});

describe("landing page", () => {
  const html = readFileSync(new URL("../../site/index.html", import.meta.url), "utf8");
  it("has lang, title, a main landmark and a skip link", () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<main id="main">/);
    expect(html).toContain('href="#main"');
  });
  it("links both apps, states the practice notice once, and uses no script", () => {
    expect(html).toContain('href="/night-desk/"');
    expect(html).toContain('href="/dead-air/"');
    expect(html.match(/does not replace your organisation's own training/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script/i);
  });
});
