// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";

afterEach(cleanup);

const decision = (id: string, actor: string, simTime: number) => ({
  id,
  type: "decision" as const,
  simTime,
  audience: actor,
  title: `Title ${id}`,
  body: "",
  actor,
});
const scenario: Scenario = {
  ...buildParticipantsFixture(["a", "b"]),
  events: [decision("d1", "a", 5), decision("d2", "b", 9)],
};
const lossy: LedgerEvent[] = [
  { kind: "sent", messageId: "m1", sender: "b", recipient: "a", simTime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 8 },
  { kind: "sent", messageId: "m2", sender: "a", recipient: "b", simTime: 3 },
  { kind: "outcome", messageId: "m2", outcome: "collision", simTime: 4 },
];
const clean: LedgerEvent[] = [
  { kind: "sent", messageId: "m1", sender: "b", recipient: "a", simTime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 2 },
];
const names = { m1: "Message one", m2: "Message two" };
const show = (events: LedgerEvent[], extra: Record<string, unknown> = {}) =>
  render(
    <ReplayView
      ledger={buildLedger(events)}
      scenario={scenario}
      names={names}
      formatTime={(t) => `T${t}`}
      {...extra}
    />,
  );
const toggle = () => screen.getByRole("button", { name: "Clear line" });
const lines = (c: HTMLElement, fate: string) => c.querySelectorAll(`line[data-fate="${fate}"]`).length;

describe("ReplayView clear line", () => {
  it("is a button with aria-pressed, off until pressed, with no gains shown", () => {
    show(lossy);
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/With a clear line/)).toBeNull();
  });

  it("shows what each decision would also have had, for a lost message", () => {
    show(lossy);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("With a clear line, Participant 2 would also have had: Message two.")).toBeTruthy();
    expect(screen.getByText("With a clear line, Participant 1 would also have had: Message one.")).toBeTruthy();
  });

  it("says plainly that nothing more would have arrived when nothing was lost", () => {
    show(clean);
    fireEvent.click(toggle());
    expect(screen.getAllByText("Nothing more would have arrived.")).toHaveLength(2);
  });

  it("removes the lost lines while on and restores them when toggled back", () => {
    const { container } = show(lossy);
    expect(lines(container, "collision")).toBe(1);
    fireEvent.click(toggle());
    expect(lines(container, "collision")).toBe(0);
    expect(lines(container, "received")).toBe(2);
    fireEvent.click(toggle());
    expect(lines(container, "collision")).toBe(1);
    expect(screen.queryByText(/With a clear line/)).toBeNull();
  });

  it("says arrivals-only participants are unchanged, only while on", () => {
    const events: LedgerEvent[] = [
      ...lossy,
      { kind: "arrival", messageId: "x1", sender: "src", recipient: "a", outcome: "received", simTime: 6 },
    ];
    show(events);
    expect(screen.queryByText(/A clear line changes nothing for/)).toBeNull();
    fireEvent.click(toggle());
    expect(screen.getByText(/A clear line changes nothing for src: only what arrived is in this log\./)).toBeTruthy();
  });

  it("is absent when the counterfactual section is off", () => {
    show(lossy, { sections: { counterfactual: false } });
    expect(screen.queryByRole("button", { name: "Clear line" })).toBeNull();
  });

  it("never gives advice in any sentence", () => {
    const events: LedgerEvent[] = [
      ...lossy,
      { kind: "arrival", messageId: "x1", sender: "src", recipient: "a", outcome: "garbled", simTime: 6 },
    ];
    const { container } = show(events);
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByRole("button", { name: /Title d1/ }), { key: "Enter" });
    expect(container.textContent).not.toMatch(/\b(should|ought|better|mistake|wrong|correct)/i);
  });
});
