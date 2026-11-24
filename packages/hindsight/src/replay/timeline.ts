// Ordered text timeline: the same facts as the diagram, as plain sentences.
// Pure. Takes a layout, so it says only what the diagram shows.
import type { WorldlineLayout } from "./types";

export type TimelineKind = "fact" | "signal" | "arrival" | "decision";

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  /** Sim-time the entry is ordered by: send, arrival, decision or learning time. */
  time: number;
  text: string;
}

/** Order among entries that share a time. */
const KIND_RANK: Record<TimelineKind, number> = { fact: 0, signal: 1, arrival: 2, decision: 3 };

export function timelineText(
  layout: WorldlineLayout,
  names: Readonly<Record<string, string>> = {},
  formatTime: (t: number) => string = String,
): TimelineEntry[] {
  const labels = new Map(layout.lines.map((l) => [l.id, l.label]));
  const who = (id: string): string => labels.get(id) ?? id;
  const name = (id: string): string => names[id] ?? id;
  const entries: TimelineEntry[] = [];

  for (const d of layout.decisions) {
    entries.push({
      kind: "decision",
      id: d.id,
      time: d.simTime,
      text: `${formatTime(d.simTime)}: ${who(d.actor)} decided: ${names[d.id] ?? d.label}.`,
    });
  }

  for (const k of layout.knowledge) {
    entries.push({
      kind: "fact",
      id: k.id,
      time: k.simTime,
      text: `${formatTime(k.simTime)}: ${who(k.participant)} learned ${k.label}.`,
    });
  }

  for (const s of layout.signals) {
    const sent = `sent at ${formatTime(s.sentAt)}`;
    const arrived = s.arrivedAt === null ? "" : formatTime(s.arrivedAt);
    let fate: string;
    if (s.open) fate = "on its way";
    else if (s.fate === "received") fate = `arrived ${arrived}`;
    else if (s.fate === "garbled") fate = `arrived damaged ${arrived}`;
    else if (s.fate === "collision") fate = `lost in a collision ${arrived}`;
    else if (s.fate === "never-arrived") fate = "did not arrive";
    else fate = "not yet settled";
    entries.push({
      kind: "signal",
      id: s.id,
      time: s.sentAt,
      text: `${name(s.id)}, ${who(s.from)} to ${who(s.to)}: ${sent}, ${fate}.`,
    });
  }

  for (const a of layout.arrivals) {
    const when = formatTime(a.arrivedAt);
    const how =
      a.outcome === "received"
        ? `arrived at ${when}`
        : a.outcome === "garbled"
          ? `arrived damaged at ${when}`
          : `arrived in a collision at ${when}`;
    entries.push({
      kind: "arrival",
      id: a.id,
      time: a.arrivedAt,
      text: `${name(a.id)}, ${who(a.from)} to ${who(a.to)}: ${how}, send time not known.`,
    });
  }

  return entries
    .map((e, i) => ({ e, i }))
    .sort(
      (x, y) =>
        x.e.time - y.e.time ||
        KIND_RANK[x.e.kind] - KIND_RANK[y.e.kind] ||
        (x.e.id < y.e.id ? -1 : x.e.id > y.e.id ? 1 : 0) ||
        x.i - y.i,
    )
    .map((x) => x.e);
}
