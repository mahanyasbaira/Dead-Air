// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { staticOnChannel9 } from "../scenarios/static-on-channel-9";
import { ROLE_KEY } from "./ui/shell/RunHost.model";
import { STORAGE_KEY, serialize } from "./ui/shell/persist";
import type { ConsoleLogEntry } from "./ui/shell/types";

// main.tsx renders outside act(); tell React this file is not an act environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

async function boot(search: string) {
  window.history.replaceState({}, "", `/dead-air/${search}`);
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await import("./main");
}

describe("main", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
    window.localStorage.clear();
  });
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
  });

  it("renders the shell entry by default", async () => {
    await boot("");
    expect(await screen.findByRole("button", { name: "Two tabs" }, { timeout: 5000 })).toBeVisible();
    expect(screen.queryByRole("button", { name: /start the exercise/i })).toBeNull();
  });

  it("opens a replay-only page for a #s= link without touching a saved run", async () => {
    const { encodeReplayRecord } = await import("hindsight/replay");
    const encoded = encodeReplayRecord({
      version: 1,
      scenarioId: staticOnChannel9.id,
      participants: [{ id: "dispatch", label: "Dispatch" }],
      events: [],
      decisions: [],
    });
    if (!encoded.ok) throw new Error("encode failed");
    window.localStorage.setItem(STORAGE_KEY, "{kept");
    await boot(`#s=${encoded.token}`);
    expect(await screen.findByRole("heading", { name: "A shared replay" }, { timeout: 5000 })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Two tabs" })).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{kept");
  });

  it("renders the prototype with ?prototype", async () => {
    await boot("?prototype");
    expect(await screen.findByRole("button", { name: /start the exercise/i }, { timeout: 5000 })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Two tabs" })).toBeNull();
  });

  it("resumes a valid saved run from localStorage on load", async () => {
    const log: ConsoleLogEntry[] = [
      {
        kind: "wire",
        event: {
          kind: "received",
          simTime: 1,
          sender: "field",
          recipient: "dispatch",
          payload: new TextEncoder().encode("Saved hello"),
        },
      },
    ];
    window.localStorage.setItem(
      STORAGE_KEY,
      serialize({ version: 1, scenarioId: staticOnChannel9.id, seed: 9, mode: "solo", log }),
    );
    window.localStorage.setItem(ROLE_KEY, "dispatch");
    await boot("");
    expect(await screen.findByText("Resumed your saved run.", {}, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText("Saved hello")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Two tabs" })).toBeNull();
  });

  it("keeps a corrupt saved run untouched, says so, and never removes it", async () => {
    const raw = "{not json";
    window.localStorage.setItem(STORAGE_KEY, raw);
    window.localStorage.setItem(ROLE_KEY, "dispatch");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    try {
      await boot("");
      expect(await screen.findByText(/Your saved run could not be opened/, {}, { timeout: 5000 })).toBeVisible();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Solo" }));
      await user.click(screen.getByRole("button", { name: /Dispatch/ }));
      await user.click(await screen.findByRole("button", { name: "Send" }));
      expect(screen.getByText(/will not be saved while that saved run is kept/)).toBeVisible();
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
      expect(remove).not.toHaveBeenCalled();
    } finally {
      remove.mockRestore();
    }
  });
});
