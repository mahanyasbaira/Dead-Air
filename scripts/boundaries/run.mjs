// Reads the workspace, runs checkBoundaries and prints `file:line specifier rule`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBoundaries, formatViolation } from "./check.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const SKIP = new Set(["node_modules", "dist", ".git", "coverage"]);
const WANTED = /\.(?:[cm]?[jt]sx?)$|(?:^|\/)README\.md$/;

function walk(rel, out) {
  let entries;
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    out.push(`${rel}/`);
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const path = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(path, out);
    else if (WANTED.test(path)) out.push(path);
  }
}

const paths = ["README.md"];
walk("apps", paths);
walk("packages", paths);

const files = {};
for (const p of paths) {
  try {
    files[p] = readFileSync(join(root, p), "utf8");
  } catch {
    files[p] = null;
  }
}
const violations = checkBoundaries(files);
for (const v of violations) console.log(formatViolation(v));
if (violations.length) {
  console.error(`boundaries: ${violations.length} violation(s)`);
  process.exit(1);
}
console.log(`boundaries: ok (${paths.length} files)`);
