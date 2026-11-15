// Stop hook: run typecheck + tests when source changed. On failure, ask the agent
// to continue with the real output, at most twice in a row so it cannot loop.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_RETRIES = 2;
const stateFile = "node_modules/.cache/kiro-verify.json";

function run(command) {
  try {
    execSync(command, { stdio: "pipe", encoding: "utf8" });
    return null;
  } catch (error) {
    return `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
  }
}

// Newest mtime + file count under src: changes whenever the agent edits, adds or removes a file.
function sourceFingerprint() {
  let newest = 0;
  let count = 0;
  for (const entry of readdirSync("src", { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    count += 1;
    newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  }
  return `${count}:${newest}`;
}

const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { failures: 0, passed: "" };
const fingerprint = sourceFingerprint();
if (fingerprint === state.passed) process.exit(0);

const failure = run("pnpm -s typecheck") ?? run("pnpm -s test");
mkdirSync("node_modules/.cache", { recursive: true });

if (!failure) {
  writeFileSync(stateFile, JSON.stringify({ failures: 0, passed: fingerprint }));
  process.exit(0);
}

const failures = state.failures + 1;
writeFileSync(stateFile, JSON.stringify({ failures: failures > MAX_RETRIES ? 0 : failures, passed: "" }));

if (failures > MAX_RETRIES) {
  console.error("verify-before-done: checks still failing after retries. Stopping; a human should look.");
  process.exit(0);
}

console.log(
  JSON.stringify({
    decision: "block",
    reason: `Checks are failing. Fix the cause, do not weaken the test.\n\n${failure}`,
  }),
);
