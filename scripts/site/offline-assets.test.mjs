// Req 6.2 (consoles 13.1): the built Dead Air app references only same-origin assets.
// Scans apps/dead-air/dist and the assembled dist/dead-air. Skips, with a message, when not built.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
/** Identifiers or message text in the bundle, never fetched. */
const ALLOW = [
  /^https?:\/\/www\.w3\.org\//, // XML, SVG and MathML namespaces
  /^https?:\/\/scripts\.sil\.org\/OFL/, // licence text in fonts/OFL.txt
  /^https?:\/\/reactjs\.org\/docs\/error-decoder/, // React error message text
  /^https?:\/\/react\.dev\/errors/,
];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function externalUrls(text) {
  return (text.match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? []).filter((u) => !ALLOW.some((a) => a.test(u)));
}

export function problems(dir) {
  const bad = [];
  for (const f of walk(dir).filter((f) => /\.(html|js|css|txt)$/.test(f))) {
    const text = readFileSync(f, "utf8");
    for (const u of externalUrls(text)) bad.push(`${f}: ${u}`);
    if (f.endsWith(".html")) {
      for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (!m[1].startsWith("/dead-air/")) bad.push(`${f}: ${m[1]}`);
      }
    }
    if (f.endsWith(".css")) {
      for (const m of text.matchAll(/url\(([^)]+)\)/g)) {
        const u = m[1].replace(/["']/g, "");
        if (!u.startsWith("/dead-air/") && !u.startsWith("data:")) bad.push(`${f}: ${u}`);
      }
    }
  }
  return bad;
}

describe("externalUrls", () => {
  it("flags a CDN and allows namespaces", () => {
    expect(externalUrls('a="https://cdn.example.com/x.js" b="http://www.w3.org/2000/svg"')).toEqual([
      "https://cdn.example.com/x.js",
    ]);
  });
});

for (const dir of ["apps/dead-air/dist", "dist/dead-air"]) {
  const built = existsSync(join(root, dir, "index.html"));
  if (!built) {
    it.skip(`${dir} is not built; run pnpm build first, then pnpm test:tooling`, () => {});
    continue;
  }
  describe(`offline assets in ${dir}`, () => {
    it("has no external host and only base-prefixed asset paths", () => {
      expect(problems(join(root, dir))).toEqual([]);
    });
  });
}
