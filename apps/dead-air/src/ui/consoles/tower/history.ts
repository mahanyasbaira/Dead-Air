/**
 * Tower message history (requirement 3.2).
 *
 * Pure and DOM-free. The pager keeps the most recent arrivals in arrival order
 * (oldest first); anything older than the bound drops off.
 */

/** How many arrivals the Tower keeps (requirement 3.2). */
export const TOWER_HISTORY_LIMIT = 8;

/**
 * Fold one arriving message into the history. Returns a new array holding the
 * last {@link TOWER_HISTORY_LIMIT} entries of `[...history, arrival]`, oldest
 * first. The input array is never mutated.
 *
 * Fold a whole sequence with `arrivals.reduce(foldHistory, [])`.
 */
export function foldHistory<T>(history: readonly T[], arrival: T): T[] {
  const next = [...history, arrival];
  return next.length > TOWER_HISTORY_LIMIT
    ? next.slice(next.length - TOWER_HISTORY_LIMIT)
    : next;
}
