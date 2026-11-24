// @vitest-environment jsdom
// Keyboard-complete pass. Input is driven with fireEvent: a key press is a keyDown
// on the focused element, and the native range input's arrow keys are a change
// event (jsdom does not turn arrow keys into value changes). jsdom does not compute
// a real tab order, so focus order is checked by reading the focusable elements in
// document order (the order Tab would follow with no positive tabindex) and by
// moving focus explicitly.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";
import { summarise } from "./summary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  discussionPrompts: ["One?"],
};
const ledger = buildLedger([
  { kind: "sent", messageId: "m1", sender: "b", recipient: "a", simTime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 8 },
  { kind: "sent", messageId: "m2", sender: "a", recipient: "b", simTime: 3 },
  { kind: "outcome", messageId: "m2", outcome: "collision", simTime: 4 },
]);
const names = { m1: "Message one", m2: "Message two" };
const URL_TEXT = "https://example.test/#s=abc";
const fmt = (t: number) => `T${t}`;
const show = () =>
  render(<ReplayView ledger={ledger} scenario={scenario} names={names} formatTime={fmt} shareUrl={URL_TEXT} />);
const node = (id: string) => screen.getByRole("button", { name: new RegExp(`Title ${id}`) });

const FOCUSABLE = "button, input, textarea, select, summary, [tabindex]";
const focusables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0);
const nameOf = (el: HTMLElement) =>
  el.getAttribute("aria-label") ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "";

describe("ReplayView keyboard", () => {
  it("offers the controls in reading order and never uses a positive tabindex", () => {
    const { container } = show();
    const order = focusables(container).map((el) => nameOf(el).trim());
    const at = (needle: RegExp) => order.findIndex((s) => needle.test(s));
    const idx = [/Title d1/, /Title d2/, /Moment in the record/, /^Clear line$/, /^Copy summary$/, /^Copy link$/, /^Text timeline$/].map(at);
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    for (const el of container.querySelectorAll<HTMLElement>("[tabindex]")) {
      expect(Number(el.getAttribute("tabindex"))).toBe(0);
    }
  });

  it("gives every control an accessible name", () => {
    const { container } = show();
    const controls = focusables(container);
    expect(controls.length).toBeGreaterThanOrEqual(7);
    for (const el of controls) expect(nameOf(el).trim()).not.toBe("");
    expect(screen.getByRole("slider", { name: "Moment in the record" })).toBeTruthy();
  });

  it("selects each decision with Enter or Space and moves between them with Up and Down", () => {
    show();
    node("d1").focus();
    fireEvent.keyDown(node("d1"), { key: "Enter" });
    expect(node("d1").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(node("d1"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(node("d2"));
    fireEvent.keyDown(node("d2"), { key: " " });
    expect(node("d2").getAttribute("aria-pressed")).toBe("true");
    expect(node("d1").getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(node("d2"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(node("d1"));
  });

  it("moves the cursor with the scrubber and leaves it with Escape, keeping focus where it was", () => {
    show();
    const slider = screen.getByRole("slider", { name: "Moment in the record" });
    slider.focus();
    fireEvent.change(slider, { target: { value: "6" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("At T6");
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(slider.getAttribute("aria-valuetext")).toBe("End of the record");
    expect(document.activeElement).toBe(slider);
  });

  it("toggles the clear line from the keyboard-reachable button", () => {
    show();
    const button = screen.getByRole("button", { name: "Clear line" });
    button.focus();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button); // a native button turns Enter and Space into click
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("list", { name: "With a clear line" })).toBeTruthy();
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("copies the summary and the link, and the fallback fields can be reached", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show();
    const paragraph = summarise({ ledger, scenario }, fmt);
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(paragraph));
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    cleanup();
    vi.stubGlobal("navigator", {});
    show();
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    const summaryField = await screen.findByRole("textbox", { name: "Summary text" });
    const linkField = await screen.findByRole("textbox", { name: "Link text" });
    expect(summaryField.tabIndex).toBe(0);
    expect(linkField.tabIndex).toBe(0);
  });

  it("reaches the text timeline through its summary and lists the entries", () => {
    show();
    const summary = screen.getByText("Text timeline");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.tabIndex).toBe(0);
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("never traps focus: Escape clears the selection and every control stays focusable", () => {
    const { container } = show();
    node("d1").focus();
    fireEvent.keyDown(node("d1"), { key: "Enter" });
    fireEvent.keyDown(node("d1"), { key: "Escape" });
    expect(document.activeElement).toBe(node("d1"));
    expect(node("d1").getAttribute("aria-pressed")).toBe("false");
    for (const el of focusables(container)) {
      el.focus();
      expect(document.activeElement).toBe(el);
    }
    expect(container.querySelector('[tabindex="-1"]')).toBeNull();
  });
});
