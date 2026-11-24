/**
 * Simulated clock. Sim-time is the engine's integer unit. The clock reads no
 * wall clock; it moves only when told to.
 */
export interface SimClock {
  /** Current integer sim-time. */
  now(): number;
  /** Move forward by `by` (integer, >= 0). Returns the new time. */
  advance(by: number): number;
  /** Move to `t` (integer, >= now()). Throws RangeError otherwise. */
  advanceTo(t: number): number;
}

export function createClock(start = 0): SimClock {
  if (!Number.isInteger(start)) {
    throw new RangeError(`clock start must be an integer, got ${start}`);
  }
  let t = start;
  return {
    now: () => t,
    advance(by) {
      if (!Number.isInteger(by) || by < 0) {
        throw new RangeError(`advance must be a non-negative integer, got ${by}`);
      }
      t += by;
      return t;
    },
    advanceTo(to) {
      if (!Number.isInteger(to) || to < t) {
        throw new RangeError(`advanceTo ${to} is before now (${t}) or not an integer`);
      }
      t = to;
      return t;
    },
  };
}
