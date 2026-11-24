// The night as a pure fold of (script, log). Never throws for a bad log; a
// channel collision is a script bug and throws (see runItems).
import { intervalsFromLog, runItems } from "./attention";
import type {
  ActionDef,
  DeliveredItem,
  DeskScript,
  ItemDef,
  LogEntry,
  LogError,
  LogErrorKind,
  MissedItem,
  NightLog,
  NightState,
  Result,
} from "./types";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function missLabel(item: ItemDef): string {
  switch (item.kind) {
    case "call":
      return "Missed call";
    case "knock":
      return "Someone knocked";
    default:
      return "A message went unseen";
  }
}

/** The state at minute `now` after `entries` (all of which must already be valid). */
function stateAt(script: DeskScript, entries: readonly LogEntry[], now: number): NightState {
  const intervals = intervalsFromLog(script, { entries });
  const arrived = script.items.filter((i) => i.at <= now);
  const { events, reasons } = runItems(script, arrived, intervals);
  const delivered: DeliveredItem[] = [];
  const done = new Set<string>();
  const byId = new Map(arrived.map((i) => [i.id, i]));
  for (const e of events) {
    if (e.kind !== "received" || e.id === undefined || e.simTime > now) continue;
    const item = byId.get(e.id);
    if (item === undefined) continue;
    done.add(item.id);
    delivered.push({ id: item.id, source: item.source, sentAt: item.at, deliveredAt: e.simTime });
  }
  delivered.sort((a, b) => a.deliveredAt - b.deliveredAt || cmp(a.id, b.id));
  const missed: MissedItem[] = [];
  for (const item of arrived) {
    if (done.has(item.id)) continue;
    missed.push({
      id: item.id,
      source: item.source,
      sentAt: item.at,
      reason: reasons.get(item.id) ?? "expired",
      label: missLabel(item),
    });
  }
  missed.sort((a, b) => a.sentAt - b.sentAt || cmp(a.id, b.id));
  let staffCalledAt: number | null = null;
  for (const entry of entries) {
    const action = script.actions.find((a) => a.id === entry.actionId);
    if (action?.kind === "callStaff") {
      staffCalledAt = entry.at;
      break;
    }
  }
  return {
    now,
    ended: now >= script.endsAt,
    delivered,
    missed,
    entries: entries.map((e) => ({ ...e })),
    staffCalledAt,
  };
}

const fail = (kind: LogErrorKind, index: number, message: string): Result<never, LogError> => ({
  ok: false,
  error: { kind, index, message },
});

/** Check one entry against the state before it. Returns an error, or null when valid. */
function checkEntry(
  script: DeskScript,
  entries: readonly LogEntry[],
  index: number,
  now: number,
): LogError | null {
  const entry = entries[index];
  const action = script.actions.find((a) => a.id === entry.actionId);
  if (action === undefined) {
    return { kind: "unknown-action", index, message: `Entry ${index}: no action "${entry.actionId}" in this night.` };
  }
  if (entry.at !== now) {
    return {
      kind: "clock-mismatch",
      index,
      message: `Entry ${index}: recorded at minute ${entry.at}, but the clock is at ${now}.`,
    };
  }
  if (now >= script.endsAt) {
    return { kind: "night-ended", index, message: `Entry ${index}: the night had already ended.` };
  }
  const before = stateAt(script, entries.slice(0, index), now);
  const has = (id: string) => before.delivered.some((d) => d.id === id);
  if (action.requires !== undefined && !has(action.requires)) {
    return {
      kind: "unmet-requires",
      index,
      message: `Entry ${index}: "${action.id}" needs item "${action.requires}", which has not reached you.`,
    };
  }
  if (action.once === true && entries.slice(0, index).some((e) => e.actionId === action.id)) {
    return { kind: "repeated-once", index, message: `Entry ${index}: "${action.id}" can only be done once.` };
  }
  for (const fact of entry.facts ?? []) {
    if (!has(fact)) {
      return {
        kind: "unknown-fact",
        index,
        message: `Entry ${index}: fact "${fact}" has not reached you.`,
      };
    }
  }
  if (entry.itemId !== undefined && !has(entry.itemId)) {
    return {
      kind: "unknown-item",
      index,
      message: `Entry ${index}: item "${entry.itemId}" has not reached you.`,
    };
  }
  return null;
}

/** Fold a log into the night's state, or say what is wrong with it. */
export function foldNight(script: DeskScript, log: NightLog): Result<NightState, LogError> {
  if (log.scenarioId !== script.id || log.rev !== script.rev || log.seed !== script.seed) {
    return fail("wrong-script", 0, "This log was made for a different night or version.");
  }
  let now = 0;
  for (let i = 0; i < log.entries.length; i++) {
    const problem = checkEntry(script, log.entries, i, now);
    if (problem !== null) return { ok: false, error: problem };
    const action = script.actions.find((a) => a.id === log.entries[i].actionId) as ActionDef;
    now += action.cost;
  }
  return { ok: true, value: stateAt(script, log.entries, now) };
}

/** Actions the player can take now. Empty once the night has ended. */
export function availableActions(script: DeskScript, state: NightState): ActionDef[] {
  if (state.ended) return [];
  return script.actions.filter((a) => {
    if (a.requires !== undefined && !state.delivered.some((d) => d.id === a.requires)) return false;
    if (a.once === true && state.entries.some((e) => e.actionId === a.id)) return false;
    return true;
  });
}

/** The only writer of the log: append one entry at the current clock and re-fold. */
export function applyAction(
  script: DeskScript,
  log: NightLog,
  actionId: string,
  opts: { itemId?: string; facts?: string[] } = {},
): Result<NightLog, LogError> {
  const folded = foldNight(script, log);
  if (!folded.ok) return folded;
  const entry: LogEntry = { at: folded.value.now, actionId };
  if (opts.itemId !== undefined) entry.itemId = opts.itemId;
  if (opts.facts !== undefined) entry.facts = [...opts.facts];
  const next: NightLog = { ...log, entries: [...log.entries, entry] };
  const check = foldNight(script, next);
  return check.ok ? { ok: true, value: next } : check;
}
