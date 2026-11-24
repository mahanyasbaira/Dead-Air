// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { HABIT_WHY } from "../ledger/habits";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";

afterEach(cleanup);

const scenario: Scenario = {
  ...buildParticipantsFixture(["a", "b"]),
  events: [
    { id: "d1", type: "decision", simTime: 5, audience: "a", title: "Title d1", body: "", actor: "a" },
  ],
};
const events: LedgerEvent[] = [
  { kind: "sent", messageId: "m1", sender: "b", recipient: "a", simTime: 2, bytes: 20, airtime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 4 },
  { kind: "sent", messageId: "m2", sender: "a", recipient: "b", simTime: 3, bytes: 10, airtime: 3 },
  { kind: "sent", messageId: "m3", sender: "a", recipient: "b", simTime: 6, bytes: 12 },
  { kind: "outcome", messageId: "m2", outcome: "collision", simTime: 6 },
  { kind: "arrival", messageId: "x1", sender: "src", recipient: "a", outcome: "received", simTime: 4 },
];
const show = (sections: Record<string, boolean> | undefined) =>
  render(<ReplayView ledger={buildLedger(events)} scenario={scenario} {...(sections === undefined ? {} : { sections })} />);

describe("HabitsTable in ReplayView", () => {
  it("is off by default", () => {
    show(undefined);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a captioned table with counts and one explanation per column", () => {
    show({ habits: true });
    const table = screen.getByRole("table", { name: /Channel habits/ });
    for (const why of Object.values(HABIT_WHY)) expect(within(table).getByText(why)).toBeTruthy();
    const rowA = within(table).getByRole("row", { name: /Participant 1/ });
    const cellsA = within(rowA).getAllByRole("cell").map((c) => c.textContent);
    expect(cellsA.slice(0, 2)).toEqual(["2", "11"]);
    expect(cellsA[2]).toBe("3");
    expect(cellsA[3]).toBe("1");
  });

  it("says Not known here for an arrivals-only participant and Not recorded for read-back", () => {
    show({ habits: true });
    const table = screen.getByRole("table");
    const src = within(table).getByRole("row", { name: /src/ });
    expect(within(src).getAllByRole("cell").every((c) => c.textContent === "Not known here")).toBe(true);
    const rowB = within(table).getByRole("row", { name: /Participant 2/ });
    const cellsB = within(rowB).getAllByRole("cell");
    expect(cellsB[cellsB.length - 1]?.textContent).toBe("Not recorded");
  });

  it("has no total row, no ranking words and keeps participant order", () => {
    show({ habits: true });
    const table = screen.getByRole("table");
    expect(table.querySelector("tfoot")).toBeNull();
    expect(table.textContent).not.toMatch(/\b(score|rank|best|worst|good|bad|total)/i);
    const heads = within(table).getAllByRole("rowheader").map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual(["Participant 1", "Participant 2"]);
  });

  it("uses no colour or class-based styling on any element in the table", () => {
    show({ habits: true });
    const table = screen.getByRole("table");
    for (const el of [table, ...Array.from(table.querySelectorAll("*"))]) {
      expect(el.getAttribute("style") ?? "").not.toMatch(/color|background|fill|stroke/i);
      expect(el.getAttribute("class") ?? "").not.toMatch(/loss|ink|faded|grey/);
    }
  });
});
