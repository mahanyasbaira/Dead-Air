// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { LOG_KEY } from "./model/storage";
import { encodeLog } from "./model/codec";
import { fakeStorage } from "./test-storage";
import { nights } from "./nights";

const script = nights[0]!.script;
const clock = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";

describe("reload restores the night from the log", () => {
  it("plays two actions, unmounts, mounts again: same clock and same items", async () => {
    const storage = fakeStorage();
    const user = userEvent.setup();
    const first = render(<App storage={storage} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    await user.keyboard("w");
    const clockBefore = clock();
    const itemsBefore = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(storage.calls.setItem).toHaveLength(2);
    first.unmount();
    cleanup();

    render(<App storage={storage} />);
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(clock()).toBe(clockBefore);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(itemsBefore);
    expect(screen.queryByText(/not be saved/i)).not.toBeInTheDocument();
  });

  it("a finished night restores to the document", async () => {
    const storage = fakeStorage();
    const user = userEvent.setup();
    const first = render(<App storage={storage} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    while (screen.queryByRole("heading", { level: 1, name: "The night is over" }) === null) {
      await user.keyboard("w");
    }
    expect(screen.getByRole("heading", { level: 1, name: "The night is over" })).toBeInTheDocument();
    first.unmount();
    cleanup();
    render(<App storage={storage} />);
    expect(screen.getByRole("heading", { level: 1, name: "The night is over" })).toBeInTheDocument();
  });

  it("a Storage that throws lets the night continue in memory with one line saying so", async () => {
    const storage = fakeStorage({}, ["getItem", "setItem", "removeItem"]);
    const user = userEvent.setup();
    render(<App storage={storage} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("This night will not be saved on this device.")).toBeInTheDocument();
    const before = clock();
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(clock()).not.toBe(before);
    expect(screen.getAllByText(/will not be saved/i)).toHaveLength(1);
  });

  it("a setItem that fails mid-night switches to memory with one line", async () => {
    const storage = fakeStorage({}, ["setItem"]);
    const user = userEvent.setup();
    render(<App storage={storage} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.queryByText(/will not be saved/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(screen.getByText("This night will not be saved on this device.")).toBeInTheDocument();
    await user.keyboard("w");
    expect(storage.calls.setItem).toHaveLength(1);
  });

  it("a valid save for another rev is kept, and the start screen names why", () => {
    const stale = encodeLog({ v: 1, scenarioId: script.id, rev: script.rev - 1, seed: script.seed, entries: [] });
    const storage = fakeStorage({ [LOG_KEY]: stale });
    render(<App storage={storage} />);
    expect(screen.getByText(/saved night could not be opened \(this night has changed since it was saved\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});
