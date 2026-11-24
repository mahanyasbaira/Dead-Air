import { describe, expect, it } from "vitest";
import { foldHistory, TOWER_HISTORY_LIMIT } from "./history";

const fold = (arrivals: readonly number[]): number[] =>
  arrivals.reduce<number[]>((h, a) => foldHistory(h, a), []);
const seq = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe("foldHistory", () => {
  it("bounds the history at 8", () => {
    expect(TOWER_HISTORY_LIMIT).toBe(8);
  });

  it("keeps nothing for 0 arrivals", () => {
    expect(fold([])).toEqual([]);
  });

  it("keeps a single arrival", () => {
    expect(fold(seq(1))).toEqual([1]);
  });

  it("keeps all 8 arrivals", () => {
    expect(fold(seq(8))).toEqual(seq(8));
  });

  it("drops the oldest on the 9th arrival", () => {
    expect(fold(seq(9))).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("keeps arrival order, oldest first", () => {
    expect(fold([5, 3, 9, 1])).toEqual([5, 3, 9, 1]);
  });

  it("does not mutate its input", () => {
    const before = Object.freeze(seq(8));
    const after = foldHistory(before, 9);
    expect(before).toEqual(seq(8));
    expect(after).not.toBe(before);
  });
});
