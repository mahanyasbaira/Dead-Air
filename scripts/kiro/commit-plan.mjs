// Prints suggested `git add` / `git commit` commands for the current changes, grouped by area.
// It never runs git write commands. The human copies and runs them.
import { execSync } from "node:child_process";

const GROUPS = [
  ["packages/hindsight/", "Kit: <what changed>"],
  ["apps/night-desk/", "Night Desk: <what changed>"],
  ["apps/dead-air/", "Dead Air: <what changed>"],
  ["site/", "Site: <what changed>"],
  ["src/", "<what changed>"],
  [".kiro/specs/", "Specs: <which spec, what changed>"],
  [".kiro/", "Project setup: <what changed>"],
  ["scripts/", "Tooling: <what changed>"],
  ["docs/", "Docs: <what changed>"],
  ["reports/", "Reports: <what was run>"],
];
const ROOT_LABEL = "Config: <what changed>";
const SUSPECT = /(^|\/)\.env|\.pem$|\.key$|id_rsa|secret|credential|token/i;

const status = execSync("git status --porcelain=v1 -z --untracked-files=all", { encoding: "utf8" });
const entries = status.split("\0").filter(Boolean);
const buckets = new Map();
const suspects = [];

for (let i = 0; i < entries.length; i += 1) {
  const code = entries[i].slice(0, 2);
  const path = entries[i].slice(3);
  if (code[0] === "R" || code[0] === "C") i += 1; // rename: the next entry is the old path
  if (SUSPECT.test(path)) suspects.push(path);
  const group = GROUPS.find(([prefix]) => path.startsWith(prefix));
  const label = group ? group[1] : ROOT_LABEL;
  const key = group ? group[0] : "(root)";
  if (!buckets.has(key)) buckets.set(key, { label, paths: [] });
  buckets.get(key).paths.push(path);
}

if (buckets.size === 0) {
  console.log("Nothing to commit.");
  process.exit(0);
}

const quote = (p) => `'${p.replaceAll("'", "'\\''")}'`;
console.log("# Review, then copy one block at a time. Replace each <...> with a plain description.\n");
for (const { label, paths } of buckets.values()) {
  console.log(`git add -A -- ${paths.map(quote).join(" ")}`);
  console.log(`git commit -m "${label}"\n`);
}
console.log("git push");
if (suspects.length > 0) {
  console.log(`\n# CHECK BEFORE COMMITTING, these look like they may hold secrets:\n# ${suspects.join("\n# ")}`);
}
