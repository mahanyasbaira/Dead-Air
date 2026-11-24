import { describe, expect, it } from "vitest";
import { createPrng } from "hindsight";
import type { ChannelSend } from "hindsight";
import { attentionLoss, intervalsFromLog, runItems } from "./attention";
import type { Interval } from "./attention";
import { emptyLog, fixtureScript } from "./fixtures";

const send = (id: string, sendTime: number): ChannelSend => ({
  id,
  sender: "x",
  recipient: "ra",
  sendTime,
  payload: new Uint8Array([0]),
});

describe("intervalsFromLog", () => {
  it("makes one open interval per known action and skips unknown ones", () => {
    const log = {
      ...emptyLog(),
      entries: [
        { at: 0, actionId: "read" },
        { at: 5, actionId: "nope" },
        { at: 5, actionId: "go" },
      ],
    };
    expect(intervalsFromLog(fixtureScript, log)).toEqual([
      { start: 0, end: 5, attention: "desk" },
      { start: 5, end: 11, attention: "away" },
    ]);
  });
});

describe("attentionLoss", () => {
  const away: Interval[] = [{ start: 5, end: 11, attention: "away" }];
  const busy: Interval[] = [{ start: 11, end: 15, attention: "busy" }];

  it("delivers at once with no covering interval", () => {
    const r = attentionLoss(fixtureScript, []).assess(send("i2", 8), createPrng(1));
    expect(r.dropped).toBe(false);
    expect(r.delay).toBe(0);
    expect(r.corrupted).toBe(false);
  });

  it("does not cover a send exactly at the start or end of an interval", () => {
    const loss = attentionLoss(fixtureScript, away);
    expect(loss.assess(send("i2", 5), createPrng(1)).dropped).toBe(false);
    expect(loss.assess(send("i2", 11), createPrng(1)).delay).toBe(0);
  });

  it("drops a phone item during an away interval", () => {
    expect(attentionLoss(fixtureScript, away).assess(send("i2", 8), createPrng(1)).dropped).toBe(true);
  });

  it("queues a chat item to the end of an away interval", () => {
    const r = attentionLoss(fixtureScript, away).assess(send("i3", 9), createPrng(1));
    expect(r).toMatchObject({ dropped: false, delay: 2 });
  });

  it("queues a door item to the end of a busy interval", () => {
    expect(attentionLoss(fixtureScript, [{ start: 15, end: 18, attention: "busy" }]).assess(send("i7", 16), createPrng(1))).toMatchObject({
      dropped: false,
      delay: 2,
    });
  });

  it("drops a chat item whose wait exceeds expiresAfter", () => {
    expect(attentionLoss(fixtureScript, busy).assess(send("i5", 12), createPrng(1)).dropped).toBe(true);
  });

  it("keeps a chat item whose wait equals expiresAfter", () => {
    const iv: Interval[] = [{ start: 10, end: 14, attention: "busy" }];
    expect(attentionLoss(fixtureScript, iv).assess(send("i5", 12), createPrng(1)).dropped).toBe(false);
  });

  it("drops a lapsing phone item during a busy interval", () => {
    const iv: Interval[] = [{ start: 15, end: 18, attention: "busy" }];
    expect(attentionLoss(fixtureScript, iv).assess(send("i6", 17), createPrng(1)).dropped).toBe(true);
  });

  it("draws exactly one float per send, whatever it decides", () => {
    const loss = attentionLoss(fixtureScript, away);
    const used = createPrng(7);
    const fresh = createPrng(7);
    loss.assess(send("i2", 8), used);
    loss.assess(send("i3", 9), used);
    fresh.nextFloat();
    fresh.nextFloat();
    expect(used.nextFloat()).toBe(fresh.nextFloat());
  });
});

describe("runItems", () => {
  it("throws a message naming the item when two items share a minute", () => {
    const items = [
      { id: "a1", source: "chat" as const, at: 3, kind: "message" as const },
      { id: "a2", source: "chat" as const, at: 3, kind: "message" as const },
    ];
    expect(() => runItems(fixtureScript, items, [])).toThrow(/item "a[12]"/);
  });

  it("records why an item was dropped", () => {
    const items = fixtureScript.items.filter((i) => i.id === "i2");
    const { reasons } = runItems(fixtureScript, items, [{ start: 5, end: 11, attention: "away" }]);
    expect(reasons.get("i2")).toBe("away");
  });
});
