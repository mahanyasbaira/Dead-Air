import { describe, expect, it } from "vitest";
import { applyAction, availableActions, foldNight } from "./night";
import { emptyLog, fixtureScript } from "./fixtures";
import { formatClock } from "./clock-format";
import type { NightLog } from "./types";

function play(ids: string[], opts: Record<string, { itemId?: string; facts?: string[] }> = {}): NightLog {
  let log = emptyLog();
  for (const id of ids) {
    const r = applyAction(fixtureScript, log, id, opts[id]);
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  return log;
}

function state(log: NightLog) {
  const r = foldNight(fixtureScript, log);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("foldNight", () => {
  it("starts at minute 0 with the first item delivered", () => {
    const s = state(emptyLog());
    expect(s.now).toBe(0);
    expect(s.ended).toBe(false);
    expect(s.delivered).toEqual([{ id: "i1", source: "chat", sentAt: 0, deliveredAt: 0 }]);
    expect(s.staffCalledAt).toBeNull();
  });

  it("worked example: an away call is missed with its time, a chat is queued to the end", () => {
    const s = state(play(["read", "go"]));
    expect(s.now).toBe(11);
    expect(s.delivered.find((d) => d.id === "i2")).toBeUndefined();
    expect(s.missed).toEqual([
      { id: "i2", source: "phone", sentAt: 8, reason: "away", label: "Missed call" },
    ]);
    expect(s.delivered.find((d) => d.id === "i3")).toEqual({
      id: "i3",
      source: "chat",
      sentAt: 9,
      deliveredAt: 11,
    });
  });

  it("delivers an item that arrives during a busy action at the action's end", () => {
    const s = state(play(["read", "go", "text"]));
    expect(s.now).toBe(15);
    expect(s.delivered.find((d) => d.id === "i4")).toMatchObject({ sentAt: 13, deliveredAt: 15 });
  });

  it("misses an item past its expiresAfter", () => {
    const s = state(play(["read", "go", "text"]));
    expect(s.delivered.find((d) => d.id === "i5")).toBeUndefined();
    expect(s.missed.find((m) => m.id === "i5")).toMatchObject({ reason: "expired", sentAt: 12 });
  });

  it("misses a lapsing phone call during a busy action, without its text", () => {
    const s = state(play(["read", "go", "text", "call-staff"]));
    const m = s.missed.find((x) => x.id === "i6");
    expect(m).toMatchObject({ reason: "lapse", sentAt: 17, label: "Missed call" });
    expect(JSON.stringify(m)).not.toContain("Body of");
    expect(s.delivered.find((d) => d.id === "i7")?.deliveredAt).toBe(18);
    expect(s.staffCalledAt).toBe(15);
  });

  it("ends the night when the clock reaches endsAt", () => {
    const s = state(play(["read", "go", "text", "call-staff", "wait", "wait", "wait", "wait", "wait", "wait", "wait"]));
    expect(s.now).toBe(25);
    expect(s.ended).toBe(true);
    expect(availableActions(fixtureScript, s)).toEqual([]);
  });

  it("throws a message naming the item when two items collide", () => {
    const clash = {
      ...fixtureScript,
      items: [...fixtureScript.items, { id: "dup", source: "chat" as const, at: 0, kind: "message" as const }],
    };
    expect(() => foldNight(clash, emptyLog())).toThrow(/item "(dup|i1)"/);
  });
});

describe("foldNight errors", () => {
  const entry = (e: Partial<NightLog["entries"][number]> & { actionId: string }) => ({ at: 0, ...e });

  it("rejects an at that disagrees with the clock", () => {
    const r = foldNight(fixtureScript, { ...emptyLog(), entries: [entry({ actionId: "read", at: 2 })] });
    expect(r).toMatchObject({ ok: false, error: { kind: "clock-mismatch", index: 0 } });
  });

  it("rejects an unknown action", () => {
    const r = foldNight(fixtureScript, { ...emptyLog(), entries: [entry({ actionId: "zzz" })] });
    expect(r).toMatchObject({ ok: false, error: { kind: "unknown-action" } });
  });

  it("rejects an unmet requires", () => {
    const r = foldNight(fixtureScript, { ...emptyLog(), entries: [entry({ actionId: "text" })] });
    expect(r).toMatchObject({ ok: false, error: { kind: "unmet-requires" } });
  });

  it("rejects a repeated once action", () => {
    const r = foldNight(fixtureScript, {
      ...emptyLog(),
      entries: [entry({ actionId: "board" }), entry({ actionId: "board", at: 1 })],
    });
    expect(r).toMatchObject({ ok: false, error: { kind: "repeated-once", index: 1 } });
  });

  it("rejects an unknown fact", () => {
    const r = foldNight(fixtureScript, { ...emptyLog(), entries: [entry({ actionId: "log", facts: ["i2"] })] });
    expect(r).toMatchObject({ ok: false, error: { kind: "unknown-fact" } });
  });

  it("rejects an entry after the night has ended", () => {
    const log = play(["read", "go", "text", "call-staff", "wait", "wait", "wait", "wait", "wait", "wait", "wait"]);
    const r = foldNight(fixtureScript, { ...log, entries: [...log.entries, { at: 25, actionId: "wait" }] });
    expect(r).toMatchObject({ ok: false, error: { kind: "night-ended" } });
  });

  it("rejects a log made for another night, version or seed", () => {
    expect(foldNight(fixtureScript, { ...emptyLog(), rev: 2 })).toMatchObject({ ok: false, error: { kind: "wrong-script" } });
    expect(foldNight(fixtureScript, { ...emptyLog(), scenarioId: "other" })).toMatchObject({ ok: false });
    expect(foldNight(fixtureScript, { ...emptyLog(), seed: 1 })).toMatchObject({ ok: false });
  });
});

describe("availableActions and applyAction", () => {
  it("hides an action whose required item has not arrived, and a spent once action", () => {
    let ids = availableActions(fixtureScript, state(emptyLog())).map((a) => a.id);
    expect(ids).not.toContain("text");
    expect(ids).toContain("board");
    ids = availableActions(fixtureScript, state(play(["board"]))).map((a) => a.id);
    expect(ids).not.toContain("board");
  });

  it("offers the staff call before and after other actions", () => {
    for (const log of [emptyLog(), play(["read", "go"])]) {
      expect(availableActions(fixtureScript, state(log)).map((a) => a.kind)).toContain("callStaff");
    }
  });

  it("appends an entry at the current clock and records facts and item", () => {
    const log = play(["read", "log"], { read: { itemId: "i1" }, log: { facts: ["i1"] } });
    expect(log.entries).toEqual([
      { at: 0, actionId: "read", itemId: "i1" },
      { at: 5, actionId: "log", facts: ["i1"] },
    ]);
  });

  it("returns an error and leaves the log unchanged for an unavailable action", () => {
    const log = play(["board"]);
    const r = applyAction(fixtureScript, log, "board");
    expect(r).toMatchObject({ ok: false, error: { kind: "repeated-once" } });
    expect(log.entries).toHaveLength(1);
  });

  it("rejects a fact that has not arrived", () => {
    const r = applyAction(fixtureScript, emptyLog(), "log", { facts: ["i2"] });
    expect(r).toMatchObject({ ok: false, error: { kind: "unknown-fact" } });
  });
});

describe("formatClock", () => {
  it("formats minutes after midnight", () => {
    expect(formatClock(23 * 60 + 10)).toBe("11:10 pm");
    expect(formatClock(0)).toBe("12:00 am");
    expect(formatClock(12 * 60 + 5)).toBe("12:05 pm");
    expect(formatClock(24 * 60 + 61)).toBe("1:01 am");
  });
});
