// PostTaskExec hook: append one factual line per finished spec task.
import { appendFileSync, readFileSync } from "node:fs";

let detail = "";
try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const { session_id, cwd, hook_event_name, ...rest } = event;
  detail = JSON.stringify(rest).slice(0, 300);
} catch {
  detail = "(no event data)";
}

appendFileSync("docs/KIRO-USAGE.md", `- ${new Date().toISOString()} spec task finished ${detail}\n`);
