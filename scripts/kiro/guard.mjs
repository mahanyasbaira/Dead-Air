// PreToolUse hook: exit 2 blocks the shell call. Reads the hook event JSON on stdin.
import { readFileSync } from "node:fs";

const event = readFileSync(0, "utf8");
let text = event;
try {
  text = JSON.stringify(JSON.parse(event).tool_input ?? {});
} catch {
  // unparseable event: fall back to scanning the raw text
}

const blocked = [
  [/\bgit\s+push\b/, "git push"],
  [/\bgit\s+reset\s+--hard\b/, "git reset --hard"],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, "recursive force delete"],
  [/\b(npm|pnpm|yarn)\s+publish\b/, "package publish"],
  [/\b(vercel|netlify)\b[^|;&]*\b(deploy|--prod)\b/, "deploy"],
  [/\bgh\s+(repo\s+create|release\s+create|pr\s+merge)\b/, "GitHub write"],
];

const hit = blocked.find(([pattern]) => pattern.test(text));
if (hit) {
  console.error(`Blocked by .kiro/hooks/guard.json: ${hit[1]}. Ask the human to run this by hand.`);
  process.exit(2);
}
