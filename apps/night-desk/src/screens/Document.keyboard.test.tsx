// @vitest-environment jsdom
// The night's document by keyboard alone. Night Desk turns the summary and prompts
// off; the share link is covered in App.share.test.tsx. The replay flow is checked: select a decision, move the cursor, toggle the clear
// line, reach the text timeline. user-event does not turn Enter on a <summary> into
// the browser's toggle, so the timeline is reached by Tab and opened with a click.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Document } from "./Document";
import { findNight } from "../nights";
import { applyAction, foldNight } from "../model/night";
import { emptyLog } from "../model/fixtures";

function playToEnd() {
  const night = findNight("guided-first-night");
  if (night === undefined) throw new Error("guided-first-night is not registered");
  const ids = ["read-text"];
  const run = () => {
    let log = emptyLog(night.script);
    for (const id of ids) {
      const r = applyAction(night.script, log, id);
      if (!r.ok) throw new Error(r.error.message);
      log = r.value;
    }
    const s = foldNight(night.script, log);
    if (!s.ok) throw new Error(s.error.message);
    return { log, state: s.value };
  };
  let played = run();
  while (!played.state.ended) {
    ids.push("wait");
    played = run();
  }
  return { night, ...played };
}

describe("Document by keyboard", () => {
  it("selects a decision, moves the cursor, toggles the clear line and opens the text timeline", async () => {
    const { night, log, state } = playToEnd();
    const user = userEvent.setup();
    render(<Document night={night} log={log} state={state} onPlayAgain={() => {}} onChooseAnother={() => {}} />);
    const tabTo = async (el: HTMLElement) => {
      for (let i = 0; i < 60 && document.activeElement !== el; i++) await user.tab();
      expect(document.activeElement).toBe(el);
    };

    const replay = screen.getByRole("group", { name: /^Replay:/ });
    const nodes = within(replay).getAllByRole("button");
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) expect(n.getAttribute("aria-label")?.trim()).toBeTruthy();

    const slider = screen.getByRole("slider", { name: "Moment in the record" });
    expect(slider).toHaveAttribute("aria-valuetext", "End of the record");

    const first = nodes[0] as HTMLElement;
    await tabTo(first);
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^At /);
    await user.keyboard("{Escape}");
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(slider).toHaveAttribute("aria-valuetext", "End of the record");

    await tabTo(slider);
    // user-event does not implement arrow keys on a range input, so the change the
    // browser would make is sent as a change event.
    fireEvent.change(slider, { target: { value: slider.getAttribute("min") } });
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^At /);
    await user.keyboard("{Escape}");
    expect(slider).toHaveAttribute("aria-valuetext", "End of the record");

    const clear = screen.getByRole("button", { name: "Clear line" });
    await tabTo(clear);
    await user.keyboard("{Enter}");
    expect(clear).toHaveAttribute("aria-pressed", "true");
    await user.keyboard(" ");
    expect(clear).toHaveAttribute("aria-pressed", "false");

    const summary = screen.getByText("Text timeline");
    await tabTo(summary);
    await user.click(summary);
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(true);
  });
});
