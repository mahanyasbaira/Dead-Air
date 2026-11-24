import { describe, expect, it } from "vitest";
import { createClock } from "./clock";

describe("createClock", () => {
  it("starts at 0 by default and at the given start", () => {
    expect(createClock().now()).toBe(0);
    expect(createClock(7).now()).toBe(7);
  });

  it("advance and advanceTo return and set the new time", () => {
    const c = createClock(2);
    expect(c.advance(3)).toBe(5);
    expect(c.advanceTo(5)).toBe(5);
    expect(c.advanceTo(9)).toBe(9);
    expect(c.now()).toBe(9);
  });

  it("rejects a negative or non-integer advance without moving", () => {
    const c = createClock(4);
    expect(() => c.advance(-1)).toThrow(RangeError);
    expect(() => c.advance(1.5)).toThrow(RangeError);
    expect(() => c.advance(Number.NaN)).toThrow(RangeError);
    expect(c.now()).toBe(4);
  });

  it("rejects advanceTo into the past without moving", () => {
    const c = createClock(10);
    expect(() => c.advanceTo(9)).toThrow(RangeError);
    expect(c.now()).toBe(10);
  });

  it("rejects a non-integer start", () => {
    expect(() => createClock(0.5)).toThrow(RangeError);
  });
});
