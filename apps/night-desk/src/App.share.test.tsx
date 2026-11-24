// @vitest-environment jsdom
// Share link (task 4.2, Req 4.4). A `#r=` link opens the document, beats storage, and never writes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, LINK_OLDER, LINK_UNREADABLE } from "./App";
import { decodeLog, encodeLog } from "./model/codec";
import { applyAction, foldNight } from "./model/night";
import { emptyLog } from "./model/fixtures";
import { LOG_KEY } from "./model/storage";
import type { NightLog } from "./model/types";
import { findNight, nights } from "./nights";
import { fakeStorage, tokenOf } from "./test-storage";

afterEach(() => {
  vi.restoreAllMocks();
});

const ended = (log: NightLog, id: string): boolean => {
  const s = foldNight(findNight(id)!.script, log);
  return s.ok && s.value.ended;
};

/** Play a night to its end: wait, but take the away action as soon as they are allowed. */
function playLoud(id = "loud-music-harlow-3"): NightLog {
  const night = findNight(id)!;
  let log = emptyLog(night.script);
  const go = night.script.actions.find((a) => a.attention === "away") ?? { id: "wait" };
  for (let guard = 0; guard < 200 && !ended(log, night.id); guard++) {
    const tryGo = log.entries.some((e) => e.actionId === go.id) ? undefined : applyAction(night.script, log, go.id);
    const next = tryGo?.ok ? tryGo : applyAction(night.script, log, "wait");
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
  }
  return log;
}

async function finishGuided(storage = fakeStorage()) {
  const user = userEvent.setup();
  render(<App storage={storage} hash="" />);
  await user.click(screen.getByRole("button", { name: "Start" }));
  await user.click(screen.getByRole("button", { name: /read the text/i }));
  while (screen.queryByRole("heading", { level: 1, name: "The night is over" }) === null) {
    await user.keyboard("w");
  }
  return { user, storage };
}

const docText = (): string => screen.getByRole("main").textContent ?? "";

describe("Copy link", () => {
  it("is one button, the kit's, and copies <origin><base>#r=<token> with the clipboard", async () => {
    const { user } = await finishGuided();
    expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(1);
    const write = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(write).toHaveBeenCalledTimes(1);
    const link = write.mock.calls[0]![0];
    expect(link.startsWith(`${window.location.origin}${import.meta.env.BASE_URL}#r=`)).toBe(true);
    const decoded = decodeLog(link.slice(link.indexOf("#r=") + 3));
    expect(decoded.ok && decoded.value.scenarioId).toBe(nights[0]!.script.id);
  });

  it("without a clipboard shows the link in a read-only field", async () => {
    const { user } = await finishGuided();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    const field = screen.getByRole("textbox", { name: "Link text" });
    expect(field).toHaveAttribute("readonly");
    expect((field as HTMLTextAreaElement).value).toMatch(/#r=[A-Za-z0-9_-]+$/);
  });
});

describe("a #r= link", () => {
  it("reproduces the same document on a fresh App with different, empty storage", async () => {
    const first = await finishGuided();
    const original = docText();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await first.user.click(screen.getByRole("button", { name: "Copy link" }));
    const link = (screen.getByRole("textbox", { name: "Link text" }) as HTMLTextAreaElement).value;
    cleanup();

    const other = fakeStorage();
    render(<App storage={other} hash={link.slice(link.indexOf("#"))} />);
    expect(screen.getByRole("heading", { level: 1, name: "The night is over" })).toBeInTheDocument();
    expect(docText().replace(/Link text.*$/, "")).toBe(original.replace(/Link text.*$/, ""));
    expect(other.calls.setItem).toHaveLength(0);
    expect(other.calls.removeItem).toHaveLength(0);
  });

  it("reads window.location.hash by default", () => {
    const token = encodeLog(playLoud());
    window.location.hash = `#r=${token}`;
    try {
      render(<App storage={fakeStorage()} />);
      expect(screen.getByRole("heading", { level: 1, name: "The night is over" })).toBeInTheDocument();
    } finally {
      window.location.hash = "";
    }
  });

  it("beats the visitor's own saved night and leaves storage byte-identical", () => {
    const mine = encodeLog({ ...emptyLog(nights[0]!.script), entries: [] });
    const storage = fakeStorage({ [LOG_KEY]: mine, "night-desk:v1:completed": '["x"]' });
    const before = [...storage.data.entries()];
    render(<App storage={storage} hash={`#r=${encodeLog(playLoud())}`} />);
    expect(screen.getByRole("heading", { level: 1, name: "The night is over" })).toBeInTheDocument();
    expect([...storage.data.entries()]).toEqual(before);
    expect(storage.calls.setItem).toHaveLength(0);
    expect(storage.calls.removeItem).toHaveLength(0);
  });

  it("with an unusable saved night present, keeps it untouched", () => {
    const storage = fakeStorage({ [LOG_KEY]: "not-a-token!" });
    render(<App storage={storage} hash={`#r=${encodeLog(playLoud())}`} />);
    expect(screen.getByRole("heading", { level: 1, name: "The night is over" })).toBeInTheDocument();
    expect(storage.data.get(LOG_KEY)).toBe("not-a-token!");
    expect(storage.calls.setItem).toHaveLength(0);
    expect(storage.calls.removeItem).toHaveLength(0);
  });

  it("never shows a missed item's content, in the link or in the document", () => {
    // Find a night where this play loses items (an away action costs phone and door items).
    const night = nights.find((n) => {
      const s = foldNight(n.script, playLoud(n.id));
      return s.ok && s.value.missed.length > 0;
    })!;
    expect(night).toBeDefined();
    const log = playLoud(night.id);
    const state = foldNight(night.script, log);
    if (!state.ok) throw new Error(state.error.message);
    const bodies = state.value.missed
      .map((m) => night.scenario.events.find((e) => e.id === m.id)?.body ?? "")
      .filter((b) => b !== "");
    expect(bodies.length).toBeGreaterThan(0);
    const token = encodeLog(log);
    const json = JSON.stringify(decodeLog(token));
    render(<App storage={fakeStorage()} hash={`#r=${token}`} />);
    for (const body of bodies) {
      expect(json).not.toContain(body);
      expect(docText()).not.toContain(body);
    }
  });

  it("makes no fetch call, opening or copying", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no network")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { user } = await finishGuided();
      await user.click(screen.getByRole("button", { name: "Copy link" }));
      cleanup();
      render(<App storage={fakeStorage()} hash={`#r=${encodeLog(playLoud())}`} />);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("a link that cannot be used", () => {
  const night = nights[0]!.script;
  const good = playLoud();
  const unfinished = emptyLog(findNight("loud-music-harlow-3")!.script);
  const cases: Array<[string, string, string]> = [
    ["a malformed token", "#r=not-a-token!", LINK_UNREADABLE],
    ["an empty token", "#r=", LINK_UNREADABLE],
    ["an over-long token", `#r=${"A".repeat(9000)}`, LINK_UNREADABLE],
    ["another shape", `#r=${tokenOf(JSON.stringify({ v: 1 }))}`, LINK_UNREADABLE],
    ["an unknown night", `#r=${encodeLog({ ...good, scenarioId: "no-such-night" })}`, LINK_UNREADABLE],
    ["a log that does not replay", `#r=${encodeLog({ ...good, entries: [{ at: 3, actionId: "wait" }] })}`, LINK_UNREADABLE],
    ["a night that is not over", `#r=${encodeLog(unfinished)}`, LINK_UNREADABLE],
    ["an old rev", `#r=${encodeLog({ ...good, rev: good.rev - 1 })}`, LINK_OLDER],
  ];
  for (const [name, hash, sentence] of cases) {
    it(`${name}: one sentence and the start screen, storage not written`, () => {
      const storage = fakeStorage();
      render(<App storage={storage} hash={hash} />);
      expect(screen.getByText(sentence)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(storage.calls.setItem).toHaveLength(0);
      expect(storage.calls.removeItem).toHaveLength(0);
    });
  }

  it("with a saved night in progress, keeps it and holds the new night in memory", async () => {
    const mine = encodeLog(emptyLog(night));
    const storage = fakeStorage({ [LOG_KEY]: mine });
    const user = userEvent.setup();
    render(<App storage={storage} hash="#r=not-a-token!" />);
    expect(screen.getByText(LINK_UNREADABLE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /read the text/i }));
    expect(storage.data.get(LOG_KEY)).toBe(mine);
    expect(storage.calls.setItem).toHaveLength(0);
    expect(storage.calls.removeItem).toHaveLength(0);
  });
});
