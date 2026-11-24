import type { EventType } from "./types";

/** A short, human-written outline of a scenario. See docs/scenario-brief.md. */
export interface Brief {
  title: string;
  participants: { id: string; name: string; blurb: string }[];
  beats: { time: number; audience: string; type: EventType; title: string; body: string }[];
  decisions: { participant: string; prompt: string; options: { id: string; label: string }[] }[];
}

/** One problem found in a brief. `line` is 1-based. */
export interface BriefError {
  line: number;
  message: string;
}

export type BriefResult = { ok: true; brief: Brief } | { ok: false; errors: BriefError[] };

const EVENT_TYPES: ReadonlySet<string> = new Set([
  "info",
  "message_created",
  "message_delivered",
  "decision",
  "debrief",
]);

/** Escapes `\` as `\\` and `|` as `\|`. Text must be a single line. */
function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * Reverses `escape`. With `split`, also cuts at every unescaped `|`.
 * A backslash before any other character stays as written.
 */
function scan(s: string, split: boolean): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && (s[i + 1] === "\\" || s[i + 1] === "|")) {
      cur += s[i + 1];
      i++;
    } else if (c === "|" && split) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const text = (s: string): string => scan(s, false)[0].trim();

/**
 * Prints a brief. Fields must be single-line and trimmed; participant and option
 * ids must not contain ": ", and participant names must not contain " - " or end with " -".
 */
export function printBrief(brief: Brief): string {
  const lines: string[] = [`# ${escape(brief.title)}`, "", "## Participants"];
  for (const p of brief.participants) {
    lines.push(`- ${escape(p.id)}: ${escape(p.name)} - ${escape(p.blurb)}`);
  }
  lines.push("", "## Beats");
  for (const b of brief.beats) {
    lines.push(
      `- ${b.time} | ${escape(b.audience)} | ${b.type} | ${escape(b.title)} | ${escape(b.body)}`,
    );
  }
  lines.push("", "## Decisions");
  for (const d of brief.decisions) {
    lines.push("", `### ${escape(d.participant)}: ${escape(d.prompt)}`);
    for (const o of d.options) lines.push(`- ${escape(o.id)}: ${escape(o.label)}`);
  }
  return lines.join("\n") + "\n";
}

type Section = "none" | "participants" | "beats" | "decisions";
const SECTIONS: Record<string, Section> = {
  "## Participants": "participants",
  "## Beats": "beats",
  "## Decisions": "decisions",
};

function parseLines(md: string, errors: BriefError[]): Brief | null {
  const err = (line: number, message: string) => errors.push({ line, message });
  const brief: Brief = { title: "", participants: [], beats: [], decisions: [] };
  const seen = new Set<Section>();
  const beatLines: number[] = [];
  const decisionLines: number[] = [];
  let section: Section = "none";
  let hasTitle = false;
  let current: Brief["decisions"][number] | null = null;

  const lines = md.split(/\r?\n/);
  for (let n = 1; n <= lines.length; n++) {
    const line = lines[n - 1];
    if (line.trim() === "") continue;

    if (line.startsWith("# ")) {
      if (hasTitle) err(n, "a second title; a brief has one `# ` line");
      const t = text(line.slice(2));
      if (t === "") err(n, "the title is empty");
      else if (!hasTitle) brief.title = t;
      hasTitle = true;
    } else if (line.startsWith("## ")) {
      const s = SECTIONS[line.trimEnd()];
      if (s === undefined) err(n, `unknown section ${JSON.stringify(line.trimEnd())}`);
      else if (seen.has(s)) err(n, `section ${JSON.stringify(line.trimEnd())} appears twice`);
      else {
        seen.add(s);
        section = s;
        current = null;
      }
    } else if (line.startsWith("### ")) {
      if (section !== "decisions") {
        err(n, "a `### ` line belongs under `## Decisions`");
        continue;
      }
      const rest = line.slice(4);
      const at = rest.indexOf(": ");
      const id = at < 0 ? "" : text(rest.slice(0, at));
      const prompt = at < 0 ? "" : text(rest.slice(at + 2));
      current = null;
      if (at < 0) err(n, "expected `### <participant id>: <prompt>`");
      else if (id === "") err(n, "the participant id is empty");
      else if (prompt === "") err(n, "the prompt is empty");
      else {
        current = { participant: id, prompt, options: [] };
        brief.decisions.push(current);
        decisionLines.push(n);
      }
    } else if (line.startsWith("- ")) {
      const rest = line.slice(2);
      if (section === "participants") {
        const at = rest.indexOf(": ");
        if (at < 0) {
          err(n, "expected `- <id>: <name> - <blurb>`");
          continue;
        }
        const id = text(rest.slice(0, at));
        const tail = rest.slice(at + 2) + " ";
        const dash = tail.indexOf(" - ");
        if (id === "") err(n, "the participant id is empty");
        else if (dash < 0) err(n, "expected ` - ` between the name and the blurb");
        else if (text(tail.slice(0, dash)) === "") err(n, "the participant name is empty");
        else {
          brief.participants.push({
            id,
            name: text(tail.slice(0, dash)),
            blurb: text(tail.slice(dash + 3)),
          });
        }
      } else if (section === "beats") {
        const f = scan(rest, true).map((x) => x.trim());
        if (f.length !== 5) {
          err(n, `expected 5 fields separated by \`|\` (time, audience, type, title, body), found ${f.length}`);
          continue;
        }
        const [time, audience, type, title, body] = f;
        let ok = true;
        if (!/^(0|[1-9]\d*)$/.test(time) || !Number.isSafeInteger(Number(time))) {
          err(n, `the time ${JSON.stringify(time)} is not a non-negative integer`);
          ok = false;
        }
        if (audience === "") {
          err(n, "the audience is empty");
          ok = false;
        }
        if (!EVENT_TYPES.has(type)) {
          err(n, `the type ${JSON.stringify(type)} is not one of ${[...EVENT_TYPES].join(", ")}`);
          ok = false;
        }
        if (ok) {
          brief.beats.push({ time: Number(time), audience, type: type as EventType, title, body });
          beatLines.push(n);
        }
      } else if (section === "decisions") {
        if (current === null) {
          err(n, "an option needs a `### <participant id>: <prompt>` line above it");
          continue;
        }
        const at = rest.indexOf(": ");
        const id = at < 0 ? "" : text(rest.slice(0, at));
        const label = at < 0 ? "" : text(rest.slice(at + 2));
        if (at < 0) err(n, "expected `- <option id>: <label>`");
        else if (id === "") err(n, "the option id is empty");
        else if (label === "") err(n, "the option label is empty");
        else current.options.push({ id, label });
      } else {
        err(n, "a list item must sit under `## Participants`, `## Beats` or `## Decisions`");
      }
    } else {
      err(n, "unrecognized line");
    }
  }

  if (!hasTitle) err(1, "missing title; start with `# <title>`");

  const declared = new Set(brief.participants.map((p) => p.id));
  brief.beats.forEach((b, i) => {
    if (b.audience !== "all" && !declared.has(b.audience)) {
      err(beatLines[i], `the audience ${JSON.stringify(b.audience)} is not a declared participant or "all"`);
    }
  });
  brief.decisions.forEach((d, i) => {
    if (!declared.has(d.participant)) {
      err(decisionLines[i], `the participant ${JSON.stringify(d.participant)} is not declared`);
    }
  });

  return errors.length === 0 ? brief : null;
}

/** Parses a brief. Never throws; every problem is reported with its 1-based line. */
export function parseBrief(md: string): BriefResult {
  const errors: BriefError[] = [];
  try {
    if (typeof md !== "string") return { ok: false, errors: [{ line: 1, message: "input must be a string" }] };
    const brief = parseLines(md, errors);
    if (brief !== null) return { ok: true, brief };
  } catch (e) {
    errors.push({ line: 1, message: `unexpected failure: ${String(e)}` });
  }
  errors.sort((a, b) => a.line - b.line);
  return { ok: false, errors };
}
