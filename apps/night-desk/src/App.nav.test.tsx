// @vitest-environment jsdom
// Play it again, choose another night, and the picker (task 4.3, Req 4.4, 1.2).
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { encodeLog } from "./model/codec";
import { applyAction, foldNight } from "./model/night";
import { emptyLog } from "./model/fixtures";
import { COMPLETED_KEY, LOG_KEY } from "./model/storage";
import { findNight, nights } from "./nights";
import { fakeStorage } from "./test-storage";

const guided = nights[0]!;
const heading = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";

async function finishGuided(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Start" }));
  await user.click(screen.getByRole("button", { name: /read the text/i }));
  while (heading() !== "The night is over") await user.keyboard("w");
}

/** A finished log for a night, made by waiting. */
function finishedLog(id: string) {
  const n = findNight(id)!;
  let log = emptyLog(n.script);
  for (let i = 0; i < 200; i++) {
    const s = foldNight(n.script, log);
    if (s.ok && s.value.ended) return log;
    const r = applyAction(n.script, log, "wait");
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  throw new Error("did not end");
}

describe("Start and the guided night", () => {
  it("finishing the guided night marks it completed; the next Start opens the picker", async () => {
    const storage = fakeStorage();
    const user = userEvent.setup();
    render(<App storage={storage} hash="" />);
    await finishGuided(user);
    expect(JSON.parse(storage.data.get(COMPLETED_KEY)!)).toEqual([guided.id]);
    cleanup();
    storage.data.delete(LOG_KEY);
    render(<App storage={storage} hash="" />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("heading", { level: 1, name: "Choose a night" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(nights.length);
  });

  it("before it is completed, Start opens the guided night even if another night was completed", async () => {
    const storage = fakeStorage({ [COMPLETED_KEY]: JSON.stringify([nights[1]!.id]) });
    const user = userEvent.setup();
    render(<App storage={storage} hash="" />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("button", { name: /read the text/i })).toBeInTheDocument();
  });
});

describe("Choose another night", () => {
  it("opens the picker, and choosing a night starts it", async () => {
    const storage = fakeStorage();
    const user = userEvent.setup();
    render(<App storage={storage} hash="" />);
    await finishGuided(user);
    await user.click(screen.getByRole("button", { name: "Choose another night" }));
    expect(screen.getByRole("heading", { level: 1, name: "Choose a night" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: new RegExp(nights[1]!.scenario.title) }));
    expect(heading()).toBe("11:10 pm");
    expect(screen.queryByRole("button", { name: "Play it again" })).not.toBeInTheDocument();
    expect(storage.calls.removeItem).toHaveLength(0);
    await user.keyboard("w");
    expect(JSON.parse(storage.data.get(COMPLETED_KEY)!)).toEqual([guided.id]);
    expect(storage.calls.setItem.filter(([k]) => k === LOG_KEY).length).toBeGreaterThan(0);
  });
});

describe("Play it again", () => {
  it("clears only that night's saved log and starts it at once, keeping completed records", async () => {
    const storage = fakeStorage();
    const user = userEvent.setup();
    render(<App storage={storage} hash="" />);
    await finishGuided(user);
    const completedBefore = storage.data.get(COMPLETED_KEY);
    await user.click(screen.getByRole("button", { name: "Play it again" }));
    expect(storage.calls.removeItem).toEqual([LOG_KEY]);
    expect(storage.data.has(LOG_KEY)).toBe(false);
    expect(storage.data.get(COMPLETED_KEY)).toBe(completedBefore);
    expect(heading()).toBe("11:10 pm");
    expect(screen.getByRole("button", { name: /read the text/i })).toBeInTheDocument();
    // Saving resumes with the first action, and the same choices give the same replay.
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(storage.data.has(LOG_KEY)).toBe(true);
  });

  it("with an unusable save held, starts in memory and leaves the held save byte-identical", async () => {
    const storage = fakeStorage({ [LOG_KEY]: "not-a-token!", [COMPLETED_KEY]: '["x"]' });
    const user = userEvent.setup();
    render(<App storage={storage} hash="" />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    while (heading() !== "The night is over") await user.keyboard("w");
    await user.click(screen.getByRole("button", { name: "Play it again" }));
    expect(heading()).toBe("11:10 pm");
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(storage.data.get(LOG_KEY)).toBe("not-a-token!");
    expect(storage.calls.setItem.filter(([k]) => k === LOG_KEY)).toHaveLength(0);
    expect(storage.calls.removeItem).toHaveLength(0);
    expect(screen.getByText(/will not be saved while that saved night is kept/i)).toBeInTheDocument();
  });

  it("on a shared-link page, touches no storage until the visitor plays", async () => {
    const mine = encodeLog(emptyLog(guided.script));
    const storage = fakeStorage({ [LOG_KEY]: mine, [COMPLETED_KEY]: '["x"]' });
    const user = userEvent.setup();
    render(<App storage={storage} hash={`#r=${encodeLog(finishedLog("loud-music-harlow-3"))}`} />);
    await user.click(screen.getByRole("button", { name: "Choose another night" }));
    await user.click(screen.getByRole("button", { name: new RegExp(nights[1]!.scenario.title) }));
    expect(storage.calls).toEqual({ getItem: [], setItem: [], removeItem: [] });
    cleanup();

    const again = fakeStorage({ [LOG_KEY]: mine });
    render(<App storage={again} hash={`#r=${encodeLog(finishedLog("loud-music-harlow-3"))}`} />);
    await user.click(screen.getByRole("button", { name: "Play it again" }));
    expect(again.calls).toEqual({ getItem: [], setItem: [], removeItem: [] });
    expect(heading()).toBe("11:10 pm");
  });

  it("on a shared-link page, the first action keeps the visitor's own night in progress and holds the new one", async () => {
    const mine = encodeLog(emptyLog(guided.script));
    const storage = fakeStorage({ [LOG_KEY]: mine });
    const user = userEvent.setup();
    render(<App storage={storage} hash={`#r=${encodeLog(finishedLog("loud-music-harlow-3"))}`} />);
    await user.click(screen.getByRole("button", { name: "Play it again" }));
    await user.keyboard("w");
    expect(storage.data.get(LOG_KEY)).toBe(mine);
    expect(storage.calls.setItem).toHaveLength(0);
    expect(storage.calls.removeItem).toHaveLength(0);
  });

  it("on a shared-link page with nothing saved, the first action saves the new night", async () => {
    const storage = fakeStorage();
    const user = userEvent.setup();
    render(<App storage={storage} hash={`#r=${encodeLog(finishedLog("loud-music-harlow-3"))}`} />);
    await user.click(screen.getByRole("button", { name: "Play it again" }));
    expect(storage.calls.setItem).toHaveLength(0);
    await user.keyboard("w");
    expect(storage.data.has(LOG_KEY)).toBe(true);
  });
});
