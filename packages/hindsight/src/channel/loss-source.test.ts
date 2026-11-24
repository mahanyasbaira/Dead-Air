import { describe, expect, it } from "vitest";
import { runChannel, profileLoss, type ChannelSend, type LossSource } from "./channel";

const profile = { minDelay: 1, maxDelay: 4, dropProb: 0.2, bitFlipProb: 0.01 };
const send = (id: string, sendTime: number): ChannelSend => ({
  id,
  sender: "a",
  recipient: "b",
  sendTime,
  airtime: 1,
  payload: Uint8Array.from([1, 2, 3]),
});
const clean = (s: ChannelSend, delay: number) => ({
  dropped: false,
  delay,
  payload: s.payload.slice(),
  corrupted: false,
});

describe("LossSource", () => {
  it("a profile and its profileLoss give the same events", () => {
    const sends = [send("m1", 0), send("m2", 10), send("m3", 20)];
    expect(runChannel(7, profile, sends)).toEqual(runChannel(7, profileLoss(profile), sends));
  });

  it("a busy-source drops sends that start while the recipient is busy", () => {
    const busy: Array<[number, number]> = [[10, 20]];
    const source: LossSource = {
      assess: (s) => ({
        ...clean(s, 0),
        dropped: busy.some(([from, to]) => s.sendTime >= from && s.sendTime < to),
      }),
    };
    const events = runChannel(1, source, [send("m1", 5), send("m2", 12), send("m3", 25)]);
    expect(events.map((e) => e.id)).toEqual(["m1", "m3"]);
    expect(events.every((e) => e.kind === "received")).toBe(true);
  });

  it("a delay-source adds its delay to every delivery", () => {
    const source: LossSource = { assess: (s) => clean(s, 7) };
    const events = runChannel(1, source, [send("m1", 0), send("m2", 30)]);
    expect(events.map((e) => e.simTime)).toEqual([7, 37]);
  });

  it("a corrupted impairment yields garbled with no payload", () => {
    const source: LossSource = { assess: (s) => ({ ...clean(s, 2), corrupted: true }) };
    const [e] = runChannel(1, source, [send("m1", 0)]);
    expect(e.kind).toBe("garbled");
    expect(e.payload).toBeUndefined();
  });

  it("throws RangeError naming the send for a negative or non-integer delay", () => {
    for (const delay of [-1, 1.5, Number.NaN]) {
      const source: LossSource = { assess: (s) => clean(s, delay) };
      expect(() => runChannel(1, source, [send("m9", 0)])).toThrow(RangeError);
      expect(() => runChannel(1, source, [send("m9", 0)])).toThrow(/m9/);
    }
  });

  it("does not assess collided sends", () => {
    let calls = 0;
    const source: LossSource = { assess: (s) => (calls++, clean(s, 0)) };
    const events = runChannel(1, source, [send("a", 0), send("b", 0), send("c", 10)]);
    expect(calls).toBe(1);
    expect(events.filter((e) => e.kind === "collision")).toHaveLength(2);
  });
});
