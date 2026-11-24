// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import script from "../scenarios/desk/guided-first-night";

// The replay's decision nodes are buttons inside the figure, and the kit's "Clear line" toggle is a
// view control, "Copy link" is the kit's share button, and "Play it again" and "Choose another night"
// are the document's own navigation, and "Sound on" or "Sound off" is the night's sound control, which
// is not a script action (it has no entry in `script.actions`, so the walk below would reject it);
// what is left are the night's own actions.
const NOT_ACTIONS = ["Clear line", "Copy link", "Play it again", "Choose another night"];
const isSoundControl = (b: HTMLElement): boolean => /^M?Sound o(n|ff)$/.test(b.textContent ?? "");
const actionButtons = (): HTMLElement[] =>
  screen
    .queryAllByRole("button")
    .filter((b) => b.closest("svg") === null && !NOT_ACTIONS.includes(b.textContent ?? "") && !isSoundControl(b) && !(b as HTMLButtonElement).disabled);

async function start() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Start" }));
  return user;
}

describe("Night Desk first playable flow", () => {
  it("start screen: one sentence, the practice line and exactly one button", () => {
    render(<App />);
    expect(screen.getByText(/for new resident assistants/i)).toBeInTheDocument();
    expect(screen.getByText(/practice with invented scenarios/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Start" })).toHaveFocus();
  });

  it("Start shows the clock and the first item, and a choice is available at once", async () => {
    await start();
    expect(screen.getByRole("heading", { level: 1, name: "11:10 pm" })).toBeInTheDocument();
    expect(screen.getByText(/music in 206 is loud again/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /read the text/i })).toBeInTheDocument();
  });

  it("shows the guide one step at a time and drops it after its action", async () => {
    const user = await start();
    expect(screen.getByText("Read the text and choose what to do.")).toBeInTheDocument();
    expect(screen.queryByText(/notice the clock moved/i)).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /guide progress/i })).toHaveAttribute("aria-valuenow", "0");
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(screen.queryByText("Read the text and choose what to do.")).not.toBeInTheDocument();
    expect(screen.getByText(/notice the clock moved/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /guide progress/i })).toHaveAttribute("aria-valuenow", "1");
  });

  it("an item that arrived while busy appears after the action with its times", async () => {
    const user = await start();
    expect(screen.queryByText(/bass from 206/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(screen.getByRole("heading", { level: 1, name: "11:15 pm" })).toBeInTheDocument();
    const item = screen.getByText(/bass from 206/i).closest("li") as HTMLElement;
    expect(within(item).getByText("11:13 pm")).toBeInTheDocument();
    expect(within(item).getByText("11:15 pm")).toBeInTheDocument();
  });

  it("every action shows its key hint, is reachable by that key, and the staff call is on screen", async () => {
    const user = await start();
    const staff = screen.getByRole("button", { name: /phone ms alder/i });
    expect(within(staff).getByText("C")).toBeInTheDocument();
    const wait = screen.getByRole("button", { name: /wait a couple of minutes/i });
    expect(within(wait).getByText("W")).toBeInTheDocument();
    const read = screen.getByRole("button", { name: /read the text/i });
    expect(within(read).getByText("1")).toBeInTheDocument();

    await user.keyboard("w");
    expect(screen.getByRole("heading", { level: 1, name: "11:12 pm" })).toBeInTheDocument();
    await user.keyboard("1");
    expect(screen.getByRole("heading", { level: 1, name: "11:17 pm" })).toBeInTheDocument();
    await user.keyboard("c");
    expect(screen.getByRole("heading", { level: 1, name: "11:20 pm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /phone ms alder/i })).toBeInTheDocument();
  });

  it("taking actions until the night ends shows the replay with no extra click", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    const wait = (): HTMLElement | undefined => actionButtons().find((b) => /wait a couple of minutes/i.test(b.textContent ?? ""));
    for (let b = wait(); b !== undefined; b = wait()) await user.click(b);
    const replay = screen.getByRole("group", { name: /^Replay:/ });
    expect(within(replay).getByRole("group", { name: /Jo Marlowe/ })).toBeInTheDocument();
    expect(actionButtons()).toHaveLength(0);
  });
  it("walks the guided night: every script action shows its key and the key advances the clock", async () => {
    const user = await start();
    const visited = new Set<string>();
    const clock = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";
    while (actionButtons().length > 0) {
      const before = clock();
      const buttons = actionButtons();
      const shown = buttons.map((b) => {
        const action = script.actions.find((a) => b.textContent?.includes(a.label));
        expect(action, `button "${b.textContent}" is not in the script`).toBeDefined();
        // The key is visible text inside the button.
        expect(within(b).getByText(action!.key.toUpperCase())).toBeInTheDocument();
        return action!;
      });
      const next = shown.find((a) => !visited.has(a.id)) ?? shown[0]!;
      visited.add(next.id);
      await user.keyboard(next.key);
      if (next.kind === "log") {
        // The log action is two steps: the key opens the panel (the clock does not move), Enter records.
        expect(screen.getByRole("group", { name: /write a log entry at/i })).toBeInTheDocument();
        expect(clock()).toBe(before);
        await user.keyboard("1");
        await user.keyboard("{Enter}");
      }
      if (actionButtons().length > 0) expect(clock()).not.toBe(before);
    }
    expect([...visited].sort()).toEqual(script.actions.map((a) => a.id).sort());
  });
});
