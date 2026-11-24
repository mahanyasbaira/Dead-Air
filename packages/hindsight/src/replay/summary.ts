// One plain paragraph about the closed record, for a facilitator to paste somewhere.
// Pure. Every number is read from the layout, so it says only what the diagram shows.
import { layoutWorldlines } from "./worldlines";
import type { WorldlineInput } from "./types";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] as string}`;
}

export function summarise(input: WorldlineInput, formatTime: (t: number) => string = String): string {
  const layout = layoutWorldlines(input);
  if (layout.lines.length === 0) return "Nothing was recorded.";

  const parts: string[] = [];
  const names = layout.lines.map((l) => l.label);
  parts.push(`${plural(names.length, "participant", "participants")}: ${joinNames(names)}.`);

  const complete = new Set(layout.lines.filter((l) => l.history === "complete").map((l) => l.id));
  const unknown = layout.lines.filter((l) => l.history === "arrivals-only").map((l) => l.label);

  // Signals only exist for senders whose history is complete, so these counts never
  // cover messages sent by an arrivals-only participant.
  const sent = layout.signals.filter((s) => complete.has(s.from));
  const intact = sent.filter((s) => s.fate === "received").length;
  const lost = sent.filter((s) => s.fate === "garbled" || s.fate === "collision" || s.fate === "never-arrived").length;
  if (sent.length === 0) {
    parts.push("No sent messages are in the record.");
  } else {
    parts.push(
      `${plural(sent.length, "message was", "messages were")} sent: ${intact} arrived intact and ${lost} ${lost === 1 ? "was" : "were"} lost or never arrived.`,
    );
  }
  if (unknown.length > 0) {
    parts.push(
      `Sends are not known for ${joinNames(unknown)}. ${plural(layout.arrivals.length, "message", "messages")} from them ${layout.arrivals.length === 1 ? "is" : "are"} recorded as arrived, with send times not known.`,
    );
  }

  let longest: (typeof sent)[number] | undefined;
  let longestSpan = -1;
  for (const s of sent) {
    if (s.arrivedAt === null) continue;
    const span = s.arrivedAt - s.sentAt;
    if (span > longestSpan) {
      longestSpan = span;
      longest = s;
    }
  }
  if (longest !== undefined && longest.arrivedAt !== null) {
    parts.push(`The longest delay ran from ${formatTime(longest.sentAt)} to ${formatTime(longest.arrivedAt)}.`);
  }

  parts.push(`${plural(layout.decisions.length, "decision was", "decisions were")} made.`);
  return parts.join(" ");
}
