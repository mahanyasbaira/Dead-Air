// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { applyAction, foldNight } from "../model/night";
import { emptyLog, fixtureScenario, fixtureScript } from "../model/fixtures";
import type { NightState } from "../model/types";
import type { Night as NightDef } from "../nights";
import { Night } from "./Night";

const night: NightDef = { id: fixtureScript.id, scenario: fixtureScenario, script: fixtureScript };

function stateAfter(...ids: string[]): NightState {
  let log = emptyLog();
  for (const id of ids) {
    const next = applyAction(fixtureScript, log, id);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
  }
  const folded = foldNight(fixtureScript, log);
  if (!folded.ok) throw new Error(folded.error.message);
  return folded.value;
}

describe("Night: writing a log entry", () => {
  // "read" takes 5 minutes, so i1 (minute 0) has arrived and i2 (phone, minute 8) has not.
  it("offers only the facts that have reached the player", async () => {
    const user = userEvent.setup();
    render(<Night night={night} state={stateAfter("read")} onAction={() => {}} />);
    await user.click(screen.getByRole("button", { name: /write a log entry/i }));
    const panel = screen.getByRole("group", { name: "Write a log entry at 11:15 pm" });
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(panel).getByRole("checkbox", { name: /item i1/i })).toBeInTheDocument();
    expect(within(panel).queryByRole("checkbox", { name: /item i2/i })).not.toBeInTheDocument();
  });

  it("records the ticked facts through onAction, in the order they reached the player", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    // Eight minutes in: i1 and i2 (the call at minute 8) have both reached the player.
    render(<Night night={night} state={stateAfter("read", "wait", "wait", "wait")} onAction={onAction} />);
    await user.keyboard("l");
    expect(onAction).not.toHaveBeenCalled();
    const panel = screen.getByRole("group", { name: "Write a log entry at 11:18 pm" });
    await user.click(within(panel).getByRole("checkbox", { name: /item i2/i }));
    await user.click(within(panel).getByRole("checkbox", { name: /item i1/i }));
    await user.click(within(panel).getByRole("button", { name: /record entry/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("log", { facts: ["i1", "i2"] });
  });

  it("Escape cancels without recording", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Night night={night} state={stateAfter("read")} onAction={onAction} />);
    await user.keyboard("l");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: /write a log entry at/i })).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("App: the guided night's log step", () => {
  it("shows 'Write down what you know' after the first two steps, and a recorded entry with its clock", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.keyboard("1"); // read the text, 5 min
    await user.keyboard("2"); // answer the floor chat, 3 min
    expect(screen.getByText("Write down what you know.")).toBeInTheDocument();
    await user.keyboard("l");
    const panel = screen.getByRole("group", { name: "Write a log entry at 11:18 pm" });
    await user.click(within(panel).getByRole("checkbox", { name: /text on the duty phone/i }));
    await user.click(within(panel).getByRole("checkbox", { name: /floor chat/i }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1, name: "11:20 pm" })).toBeInTheDocument();
    expect(screen.queryByText("Write down what you know.")).not.toBeInTheDocument();
    const entry = screen.getByRole("heading", { name: "Your log" }).closest("section") as HTMLElement;
    expect(within(entry).getByText("11:18 pm")).toBeInTheDocument();
    expect(within(entry).getByText("Text on the duty phone, Floor chat")).toBeInTheDocument();
  });
});
