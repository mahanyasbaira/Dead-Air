// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

/**
 * Keyboard-only run of the core journey: no pointer clicks. jsdom cannot judge
 * visual focus rings, so this checks reachability and activation, not appearance.
 */
describe("Dead Air core journey by keyboard only", () => {
  it("reaches start, role tabs, choice, advance, debrief and reset with Tab, Space and Enter", async () => {
    const user = userEvent.setup();
    render(<App />);

    // First Tab stop is the skip link.
    await user.tab();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveFocus();

    // Next Tab stop is the start button; Enter starts the exercise.
    await user.tab();
    const start = screen.getByRole("button", { name: /start the exercise/i });
    expect(start).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: /timeline step/i })).toBeInTheDocument();

    // Every control of the play screen can take focus via Tab.
    const reachable = async (name: RegExp, role: "button" | "tab" | "radio") => {
      const el = screen.getByRole(role, { name });
      for (let i = 0; i < 12 && document.activeElement !== el; i++) await user.tab();
      expect(el).toHaveFocus();
      return el;
    };

    // Role tab, activated with Space.
    await reachable(/view as field lead/i, "tab");
    await user.keyboard(" ");
    expect(screen.getByRole("tab", { name: /view as field lead/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Record a choice with Space on a radio.
    // A radio group takes one Tab stop; arrow keys move within it (native behaviour).
    const radio = screen.getByRole("radio", { name: /keep going but watch the banners/i });
    for (let i = 0; i < 12 && document.activeElement?.getAttribute("type") !== "radio"; i++) {
      await user.tab();
    }
    expect(document.activeElement?.getAttribute("type")).toBe("radio");
    for (let i = 0; i < 6 && document.activeElement !== radio; i++) {
      await user.keyboard("{ArrowDown}");
    }
    expect(radio).toHaveFocus();
    await user.keyboard(" ");
    expect(radio).toBeChecked();
    expect(screen.getByText(/choice recorded at sim-minute 0/i)).toBeInTheDocument();

    // Advance with Enter until the end, then open the debrief.
    for (let i = 0; i < 10; i++) {
      const advance = screen.queryByRole("button", { name: /advance timeline/i });
      if (!advance) break;
      await reachable(/advance timeline/i, "button");
      await user.keyboard("{Enter}");
    }
    await reachable(/go to debrief/i, "button");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: /who knew what, when/i })).toBeInTheDocument();

    // Reset from the debrief with Enter returns to the intro.
    await reachable(/reset demo/i, "button");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /start the exercise/i })).toBeInTheDocument();
  });

  it("reset mid-run clears the recorded choice and the revealed events", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /start the exercise/i }));
    await user.click(screen.getByRole("button", { name: /advance timeline/i }));
    await user.click(screen.getByLabelText(/suggest holding the acoustic set/i));
    expect(screen.getByText(/choice recorded at sim-minute 1/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset demo/i }));
    await user.click(screen.getByRole("button", { name: /start the exercise/i }));
    expect(screen.getByText(/no choice recorded for this role yet/i)).toBeInTheDocument();
    expect(screen.getByText(/^1 of \d+$/)).toBeInTheDocument();
  });
});
