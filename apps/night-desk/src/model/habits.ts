// Three plain figures about a finished night. Pure: a function of (script, state).
// No score, no total, no grade. Unknown is null, never 0.
import type { DeskScript, NightState } from "./types";

export interface Habits {
  acknowledgement: { meanMinutes: number | null; longestMinutes: number | null; unacknowledged: number };
  /** `unwritten` holds ids of delivered items whose id was never written down. */
  written: { known: number; written: number; unwritten: string[] };
  /** minutes null with moments > 0 means no call was made. */
  professional: { minutes: number | null; moments: number };
}

export function habits(script: DeskScript, state: NightState): Habits {
  const actionById = new Map(script.actions.map((a) => [a.id, a]));

  // Acknowledgement: first entry that names the item, or whose action requires it.
  const waits: number[] = [];
  let unacknowledged = 0;
  for (const d of state.delivered) {
    const hit = state.entries.find(
      (e) => e.at >= d.deliveredAt && (e.itemId === d.id || actionById.get(e.actionId)?.requires === d.id),
    );
    if (hit === undefined) unacknowledged += 1;
    else waits.push(hit.at - d.deliveredAt);
  }
  const acknowledgement = {
    meanMinutes: waits.length === 0 ? null : Math.round(waits.reduce((s, n) => s + n, 0) / waits.length),
    longestMinutes: waits.length === 0 ? null : Math.max(...waits),
    unacknowledged,
  };

  // Written versus known.
  const writtenIds = new Set<string>();
  for (const e of state.entries) for (const f of e.facts ?? []) writtenIds.add(f);
  const written = {
    known: state.delivered.length,
    written: writtenIds.size,
    unwritten: state.delivered.filter((d) => !writtenIds.has(d.id)).map((d) => d.id),
  };

  // Professional: first marked moment, to the first staff call at or after it.
  const marked = script.items.filter((i) => i.needsProfessional === true);
  let minutes: number | null = null;
  if (marked.length > 0) {
    const times = marked.map((i) => state.delivered.find((d) => d.id === i.id)?.deliveredAt ?? i.at);
    const moment = Math.min(...times);
    const call = state.entries.find((e) => e.at >= moment && actionById.get(e.actionId)?.kind === "callStaff");
    if (call !== undefined) minutes = call.at - moment;
  }
  return { acknowledgement, written, professional: { minutes, moments: marked.length } };
}

/** One fixed line per figure saying why it matters. Not computed, not varied. */
export const HABIT_WHY = {
  acknowledgement: "The longer something waits, the less the sender knows about whether it was seen.",
  written: "What is not written down is hard to hand on to the next person.",
  professional: "Some situations need someone with more training, and the minutes before they hear count.",
} as const;

export interface HabitRow {
  id: keyof typeof HABIT_WHY;
  label: string;
  figure: string;
  why: string;
}

const min = (n: number): string => `${n} ${n === 1 ? "minute" : "minutes"}`;

/** Plain-text rows for the document. */
export function habitRows(h: Habits): HabitRow[] {
  const a = h.acknowledgement;
  const ack =
    a.meanMinutes === null || a.longestMinutes === null
      ? a.unacknowledged === 0
        ? "Nothing reached you."
        : `${a.unacknowledged} of what reached you was not acted on.`
      : `Average ${min(a.meanMinutes)}, longest ${min(a.longestMinutes)}. Not acted on: ${a.unacknowledged}.`;
  const p = h.professional;
  const pro =
    p.moments === 0
      ? "This night had no such moment."
      : p.minutes === null
        ? "No call was made."
        : `${min(p.minutes)} from that moment to the call.`;
  return [
    { id: "acknowledgement", label: "Time from arrival to acting", figure: ack, why: HABIT_WHY.acknowledgement },
    {
      id: "written",
      label: "Written down, compared with known",
      figure: `You wrote down ${h.written.written} of ${h.written.known} things that reached you.`,
      why: HABIT_WHY.written,
    },
    { id: "professional", label: "Time to call the staff member", figure: pro, why: HABIT_WHY.professional },
  ];
}
