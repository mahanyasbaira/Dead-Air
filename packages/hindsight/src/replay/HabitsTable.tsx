// Channel habits as a plain table: one row per participant, in the order given.
// Counts only. No total row, no ordering, no colour. A figure the log cannot hold reads
// "Not known here" (arrivals-only participant) or "Not recorded" (anything else missing).
import type { ReactElement } from "react";
import { HABIT_WHY } from "../ledger/habits";
import type { HabitColumn, Habits } from "../ledger/habits";
import type { HistoryKnowledge } from "./types";

export interface HabitsTableProps {
  habits: readonly Habits[];
  /** Row labels and history, in the order the rows are shown. */
  participants: readonly { id: string; label: string; history: HistoryKnowledge }[];
}

const COLUMNS: readonly { key: HabitColumn; heading: string }[] = [
  { key: "transmissions", heading: "Transmissions" },
  { key: "meanBytes", heading: "Mean bytes" },
  { key: "meanAirtime", heading: "Mean time on the line" },
  { key: "collisionsInvolved", heading: "Collisions involved" },
  { key: "collisionsCaused", heading: "Collisions begun second" },
  { key: "readBack", heading: "Read back" },
];

const oneDecimal = (n: number): string => String(Math.round(n * 10) / 10);

function cell(h: Habits, key: HabitColumn): number | string | null {
  switch (key) {
    case "meanBytes":
    case "meanAirtime": {
      const v = h[key];
      return v === null ? null : oneDecimal(v);
    }
    case "readBack":
      return h.readBack === null ? null : `${h.readBack.read} of ${h.readBack.received}`;
    default:
      return h[key];
  }
}

export function HabitsTable({ habits, participants }: HabitsTableProps): ReactElement {
  const byId = new Map(habits.map((h) => [h.participant, h]));
  return (
    <table className="hs-habits">
      <caption>Channel habits: plain counts from this record, one row per participant.</caption>
      <thead>
        <tr>
          <th scope="col">Participant</th>
          {COLUMNS.map((c) => (
            <th key={c.key} scope="col">
              <span>{c.heading}</span>
              <small className="hs-habit-why">{HABIT_WHY[c.key]}</small>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {participants.map((p) => {
          const h = byId.get(p.id);
          return (
            <tr key={p.id}>
              <th scope="row">{p.label}</th>
              {COLUMNS.map((c) => {
                const v = h === undefined ? null : cell(h, c.key);
                return <td key={c.key}>{v === null ? (p.history === "arrivals-only" ? "Not known here" : "Not recorded") : v}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
