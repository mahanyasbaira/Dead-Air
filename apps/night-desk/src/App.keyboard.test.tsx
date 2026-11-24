// @vitest-environment jsdom
// A whole guided night with the keyboard only: Enter on Start, Tab then Enter on a button, the action
// keys, the log panel's own keys, and the document at the end. No pointer is used anywhere.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import script from "../scenarios/desk/guided-first-night";

const NOT_ACTIONS = ["Clear line", "Copy link", "Play it again", "Choose another night"];
const actionButtons = (): HTMLElement[] =>
  screen
    .queryAllByRole("button")
    .filter(
      (b) =>
        b.closest("svg") === null &&
        !NOT_ACTIONS.includes(b.textContent ?? "") &&
        !/^M?Sound o(n|ff)$/.test(b.textContent ?? "") &&
        !(b as HTMLButtonElement).disabled,
    );
const clock = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";

describe("Night Desk by keyboard alone", () => {
  it("plays the whole guided night and finishes on the document", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Start is focused on arrival; Enter begins the night.
    expect(screen.getByRole("button", { name: "Start" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(clock()).toBe("11:10 pm");

    // Every action on screen shows its key as text and announces it.
    const checkKeys = (): void => {
      for (const b of actionButtons()) {
        const action = script.actions.find((a) => b.textContent?.includes(a.label));
        expect(action, `"${b.textContent}" is not in the script`).toBeDefined();
        expect(within(b).getByText(action!.key.toUpperCase())).toBeInTheDocument();
        expect(b).toHaveAttribute("aria-keyshortcuts", action!.key);
      }
    };
    checkKeys();

    // Tab reaches an action and Enter runs it.
    const first = screen.getByRole("button", { name: /read the text/i });
    for (let i = 0; i < 20 && document.activeElement !== first; i++) await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(clock()).toBe("11:15 pm");
    checkKeys();

    // The sound key toggles sound and is not an action.
    expect(screen.getByRole("button", { name: /sound off/i })).toHaveAttribute("aria-keyshortcuts", "m");
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: /sound on/i })).toBeInTheDocument();
    expect(clock()).toBe("11:15 pm");
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: /sound off/i })).toBeInTheDocument();

    // Action key, then the log panel: l opens it, Escape cancels, l again, Space ticks, Enter records.
    await user.keyboard("2");
    expect(clock()).toBe("11:18 pm");
    await user.keyboard("l");
    const panel = screen.getByRole("group", { name: "Write a log entry at 11:18 pm" });
    expect(within(panel).getAllByRole("checkbox")[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: /write a log entry at/i })).not.toBeInTheDocument();
    expect(clock()).toBe("11:18 pm");
    await user.keyboard("l");
    await user.keyboard(" ");
    expect(within(screen.getByRole("group", { name: /write a log entry at/i })).getAllByRole("checkbox")[0]).toBeChecked();
    await user.keyboard("{Enter}");
    expect(clock()).toBe("11:20 pm");
    expect(screen.getByRole("heading", { name: "Your log" })).toBeInTheDocument();
    checkKeys();

    // Wait with the key until the night ends. The document appears with no extra step.
    for (let n = 0; n < 200 && actionButtons().length > 0; n++) {
      const open = actionButtons().find((b) => /open the door/i.test(b.textContent ?? ""));
      await user.keyboard(open !== undefined ? "3" : "w");
    }
    const replay = screen.getByRole("group", { name: /^Replay:/ });
    expect(replay).toBeInTheDocument();
    expect(actionButtons()).toHaveLength(0);
    // The document's own controls are reachable by Tab.
    const again = screen.getByRole("button", { name: "Play it again" });
    for (let i = 0; i < 80 && document.activeElement !== again; i++) await user.tab();
    expect(again).toHaveFocus();
  });
});
