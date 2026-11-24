// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
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
const ledger = buildLedger([
  { kind: "sent", messageId: "m1", sender: "b", recipient: "a", simTime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 8 },
  { kind: "sent", messageId: "m2", sender: "a", recipient: "b", simTime: 3 },
  { kind: "outcome", messageId: "m2", outcome: "collision", simTime: 4 },
]);
const names = { m1: "Message one", m2: "Message two" };
const show = () => render(<ReplayView ledger={ledger} scenario={scenario} names={names} formatTime={(t) => `T${t}`} />);
const node = (id: string) => screen.getByRole("button", { name: new RegExp(`Title ${id}`) });

describe("ReplayView selection and scrubber", () => {
  it("starts on the closed record with unpressed decisions", () => {
    show();
    expect(node("d1").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("End of the record")).toBeTruthy();
    expect(screen.getByText(/^Select a decision, or move the slider/)).toBeTruthy();
  });

  it("selects a decision by keyboard and says what had not arrived", () => {
    show();
    fireEvent.keyDown(node("d1"), { key: "Enter" });
    expect(node("d1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("At T5")).toBeTruthy();
    expect(screen.getByText("Not yet arrived: Message one.")).toBeTruthy();
    expect(screen.queryByText(/^Select a decision, or move the slider/)).toBeNull();
  });

  it("selects with Space and toggles off with the same key", () => {
    show();
    fireEvent.keyDown(node("d2"), { key: " " });
    expect(node("d2").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(node("d2"), { key: " " });
    expect(node("d2").getAttribute("aria-pressed")).toBe("false");
  });

  it("moves focus between decisions in time order with Up and Down", () => {
    show();
    node("d1").focus();
    fireEvent.keyDown(node("d1"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(node("d2"));
    fireEvent.keyDown(node("d2"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(node("d1"));
  });

  it("changes both roles' sentences with the scrubber and clears the selection", () => {
    show();
    fireEvent.keyDown(node("d1"), { key: "Enter" });
    const slider = screen.getByRole("slider", { name: "Moment in the record" });
    fireEvent.change(slider, { target: { value: "6" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("At T6");
    expect(screen.getByText(/^At T6, Participant 1 had/)).toBeTruthy();
    expect(screen.getByText(/^At T6, Participant 2 had/)).toBeTruthy();
    expect(node("d1").getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(slider, { target: { value: "8" } });
    expect(screen.getByText(/^At T8, Participant 1 had 1 thing: Message one\./)).toBeTruthy();
  });

  it("returns to the closed record with Escape", () => {
    show();
    fireEvent.keyDown(node("d1"), { key: "Enter" });
    fireEvent.keyDown(node("d1"), { key: "Escape" });
    expect(node("d1").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("End of the record")).toBeTruthy();
  });

  it("returns to the closed record when the scrubber reaches the end", () => {
    show();
    const slider = screen.getByRole("slider", { name: "Moment in the record" });
    fireEvent.change(slider, { target: { value: "5" } });
    fireEvent.change(slider, { target: { value: "9" } });
    expect(screen.getByText("End of the record")).toBeTruthy();
  });
});
