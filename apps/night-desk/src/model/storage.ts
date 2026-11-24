// Persistence for the night in progress. Every call catches Storage errors.
//
// Saved-night rule (developer override, 2026-11-23, same as Dead Air's RunHost): a save that cannot
// be used is kept untouched. `clear` is called from exactly one place, the "Discard the saved night"
// button in App. Nothing here calls it on its own.
import { decodeLog, encodeLog } from "./codec";
import { foldNight } from "./night";
import type { DeskScript, NightLog } from "./types";

export const LOG_KEY = "night-desk:v1:log";
export const COMPLETED_KEY = "night-desk:v1:completed";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Unusable = "unreadable" | "unsupported" | "other-version" | "unknown-night" | "does-not-replay";

export type Saved =
  | { kind: "none" }
  | { kind: "storage-error" }
  | { kind: "resume"; log: NightLog; ended: boolean }
  | { kind: "unusable"; reason: Unusable };

const WHY: Record<Unusable, string> = {
  unreadable: "it is not readable data",
  unsupported: "it was made by an unsupported version of the app",
  "other-version": "this night has changed since it was saved",
  "unknown-night": "it is for a night this version does not have",
  "does-not-replay": "its choices do not replay",
};

/** The one sentence that names why a saved night was not opened. */
export function unusableSentence(reason: Unusable): string {
  return `Your saved night could not be opened (${WHY[reason]}), so this is a new night. The saved night has been kept.`;
}
export const HELD_LINE = "This new night will not be saved while that saved night is kept.";
export const UNSAVED_LINE = "This night will not be saved on this device.";
export const DISCARDED_LINE = "The saved night was discarded. This night will be saved.";

/**
 * Read the stored night and check it against the scripts. Pure apart from `getItem`; it never writes.
 * `lookup` returns the script for a night id.
 */
export function loadSaved(
  storage: StorageLike | undefined,
  lookup: (id: string) => DeskScript | undefined,
): Saved {
  if (storage === undefined) return { kind: "storage-error" };
  let raw: string | null;
  try {
    raw = storage.getItem(LOG_KEY);
  } catch {
    return { kind: "storage-error" };
  }
  if (raw === null || raw === "") return { kind: "none" };
  const decoded = decodeLog(raw);
  if (!decoded.ok) {
    return { kind: "unusable", reason: decoded.error.kind === "wrong-version" ? "unsupported" : "unreadable" };
  }
  const log = decoded.value;
  const script = lookup(log.scenarioId);
  if (script === undefined) return { kind: "unusable", reason: "unknown-night" };
  if (log.rev !== script.rev || log.seed !== script.seed) return { kind: "unusable", reason: "other-version" };
  let folded;
  try {
    folded = foldNight(script, log);
  } catch {
    return { kind: "unusable", reason: "does-not-replay" };
  }
  if (!folded.ok) return { kind: "unusable", reason: "does-not-replay" };
  return { kind: "resume", log, ended: folded.value.ended };
}

/** Write the log. Returns false when storage refused; never throws. */
export function save(storage: StorageLike | undefined, log: NightLog): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(LOG_KEY, encodeLog(log));
    return true;
  } catch {
    return false;
  }
}

/** Remove the stored night. Only the discard button may call this. Never throws. */
export function clear(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(LOG_KEY);
  } catch {
    /* nothing to do */
  }
}

export function completed(storage: StorageLike | undefined): string[] {
  try {
    const raw = storage?.getItem(COMPLETED_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function markCompleted(storage: StorageLike | undefined, id: string): void {
  try {
    const done = completed(storage);
    if (!done.includes(id)) storage?.setItem(COMPLETED_KEY, JSON.stringify([...done, id]));
  } catch {
    /* nothing to do */
  }
}
