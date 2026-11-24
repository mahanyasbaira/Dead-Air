import { describe, expect, it } from "vitest";
import { nights } from "../nights";
import { fakeStorage, tokenOf } from "../test-storage";
import { encodeLog } from "./codec";
import { COMPLETED_KEY, LOG_KEY, clear, completed, loadSaved, markCompleted, save, unusableSentence } from "./storage";
import type { DeskScript, NightLog } from "./types";

const script = nights[0]!.script;
const lookup = (id: string): DeskScript | undefined => (id === script.id ? script : undefined);
const log = (patch: Partial<NightLog> = {}): NightLog => ({
  v: 1,
  scenarioId: script.id,
  rev: script.rev,
  seed: script.seed,
  entries: [],
  ...patch,
});

describe("storage", () => {
  it("a Storage that throws does not break save, clear, completed or markCompleted", () => {
    const all = ["getItem", "setItem", "removeItem"] as const;
    const storage = fakeStorage({}, all);
    expect(save(storage, log())).toBe(false);
    expect(() => clear(storage)).not.toThrow();
    expect(completed(storage)).toEqual([]);
    expect(() => markCompleted(storage, "x")).not.toThrow();
    expect(loadSaved(storage, lookup)).toEqual({ kind: "storage-error" });
    expect(loadSaved(undefined, lookup)).toEqual({ kind: "storage-error" });
    expect(save(undefined, log())).toBe(false);
  });

  it("reports nothing stored as none", () => {
    expect(loadSaved(fakeStorage(), lookup)).toEqual({ kind: "none" });
  });

  it("names the reason for each unusable save and never writes while reading", () => {
    const cases: Array<[string, string]> = [
      ["%%%", "unreadable"],
      [tokenOf(JSON.stringify({ ...log(), v: 2 })), "unsupported"],
      [encodeLog(log({ scenarioId: "no-such-night" })), "unknown-night"],
      [encodeLog(log({ rev: script.rev + 1 })), "other-version"],
      [encodeLog(log({ entries: [{ at: 0, actionId: "no-such-action" }] })), "does-not-replay"],
    ];
    for (const [raw, reason] of cases) {
      const storage = fakeStorage({ [LOG_KEY]: raw });
      expect(loadSaved(storage, lookup)).toEqual({ kind: "unusable", reason });
      expect(storage.data.get(LOG_KEY)).toBe(raw);
      expect(storage.calls.setItem).toHaveLength(0);
      expect(storage.calls.removeItem).toHaveLength(0);
      expect(unusableSentence(reason as never)).toMatch(/^Your saved night could not be opened \(.+\)/);
    }
  });

  it("completed nights are remembered once each", () => {
    const storage = fakeStorage();
    markCompleted(storage, "a");
    markCompleted(storage, "a");
    markCompleted(storage, "b");
    expect(completed(storage)).toEqual(["a", "b"]);
    expect(storage.data.get(COMPLETED_KEY)).toBe('["a","b"]');
  });
});
