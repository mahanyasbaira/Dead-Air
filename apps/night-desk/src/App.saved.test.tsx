// @vitest-environment jsdom
// The saved-night rule: an unusable save is never removed or overwritten except by the explicit button.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { encodeLog } from "./model/codec";
import { LOG_KEY } from "./model/storage";
import { nights } from "./nights";
import { fakeStorage, tokenOf } from "./test-storage";

const script = nights[0]!.script;
const good = { v: 1 as const, scenarioId: script.id, rev: script.rev, seed: script.seed };
const unusable: Array<[string, string]> = [
  ["unreadable", "not-a-token!"],
  ["unsupported", tokenOf(JSON.stringify({ ...good, v: 9, entries: [] }))],
  ["another rev", encodeLog({ ...good, rev: script.rev + 1, entries: [] })],
  ["fails foldNight", encodeLog({ ...good, entries: [{ at: 3, actionId: "wait" }] })],
];

describe("an unusable saved night", () => {
  for (const [name, raw] of unusable) {
    it(`${name}: kept byte-identical, removeItem never called, new night held in memory`, async () => {
      const storage = fakeStorage({ [LOG_KEY]: raw });
      const user = userEvent.setup();
      render(<App storage={storage} />);
      expect(screen.getByText(/your saved night could not be opened/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Start" }));
      expect(screen.getByText("This new night will not be saved while that saved night is kept.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /read the text/i }));
      await user.keyboard("w");
      expect(storage.data.get(LOG_KEY)).toBe(raw);
      expect(storage.calls.setItem).toHaveLength(0);
      expect(storage.calls.removeItem).toHaveLength(0);
    });
  }

  it("the discard button calls removeItem once, and saving resumes afterwards", async () => {
    const raw = unusable[0]![1];
    const storage = fakeStorage({ [LOG_KEY]: raw });
    const user = userEvent.setup();
    render(<App storage={storage} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(storage.calls.setItem).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Discard the saved night" }));
    expect(storage.calls.removeItem).toEqual([LOG_KEY]);
    // The night already played in memory is saved at once.
    expect(storage.calls.setItem).toHaveLength(1);
    expect(screen.getByText("The saved night was discarded. This night will be saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard the saved night" })).not.toBeInTheDocument();

    await user.keyboard("w");
    expect(storage.calls.setItem).toHaveLength(2);
    expect(storage.calls.removeItem).toHaveLength(1);
    expect(storage.data.get(LOG_KEY)).not.toBe(raw);
  });

  it("can be discarded from the start screen, and the next night is saved", async () => {
    const storage = fakeStorage({ [LOG_KEY]: unusable[0]![1] });
    const user = userEvent.setup();
    render(<App storage={storage} />);
    await user.click(screen.getByRole("button", { name: "Discard the saved night" }));
    expect(storage.calls.removeItem).toHaveLength(1);
    expect(storage.calls.setItem).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(storage.calls.setItem).toHaveLength(1);
    expect(storage.calls.removeItem).toHaveLength(1);
  });
});
