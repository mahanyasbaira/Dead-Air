// Replay narration: plain facts about what had reached the player at each choice.
// Pure. A missed or late item is named by its source and time, never by its text.
import { inTransitAt, knownAt } from "hindsight";
import type { Ledger, Scenario } from "hindsight";
import { formatClock } from "./clock-format";
import type { DeskScript, ItemDef, NightLog, NightState } from "./types";

const PLAYER = "ra";
const FOREVER = Number.MAX_SAFE_INTEGER;

function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function narrate(
  scenario: Scenario,
  script: DeskScript,
  log: NightLog,
  state: NightState,
  ledger: Ledger,
): { summary: string; decisions: string[] } {
  const clock = (minute: number): string => formatClock(script.startClock + minute);
  const sourceName = (id: string): string => scenario.roles.find((r) => r.id === id)?.name ?? id;
  const itemById = new Map<string, ItemDef>(script.items.map((i) => [i.id, i]));
  /** "a call from Phone, sent at 11:18 pm": source and time only. */
  const described = (id: string): string => {
    const item = itemById.get(id);
    return item === undefined ? id : `a ${item.kind} from ${sourceName(item.source)}, sent at ${clock(item.at)}`;
  };
  const title = (id: string): string =>
    scenario.events.find((e) => e.id === id && e.type === "message_created")?.title ?? described(id);
  const everReceived = knownAt(ledger, PLAYER, FOREVER);
  const order = new Map(state.delivered.map((d, n) => [d.id, n]));
  const byDelivery = (ids: Iterable<string>): string[] =>
    [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
  const bySend = (ids: Iterable<string>): string[] =>
    [...ids].sort((a, b) => (itemById.get(a)?.at ?? 0) - (itemById.get(b)?.at ?? 0) || (a < b ? -1 : a > b ? 1 : 0));

  const decisions = log.entries.map((entry) => {
    const label = script.actions.find((a) => a.id === entry.actionId)?.label ?? entry.actionId;
    const known = byDelivery([...knownAt(ledger, PLAYER, entry.at)].filter((id) => itemById.has(id)));
    const transit = bySend(inTransitAt(ledger, PLAYER, entry.at));
    const onItsWay = transit.filter((id) => everReceived.has(id));
    const missed = transit.filter((id) => !everReceived.has(id));
    const parts = [`At ${clock(entry.at)} you chose "${label}"`];
    parts.push(known.length === 0 ? "nothing had reached you yet" : `you had ${list(known.map(title))}`);
    if (onItsWay.length > 0) parts.push(`still on its way was ${list(onItsWay.map(described))}`);
    if (missed.length > 0) parts.push(`missed was ${list(missed.map(described))}`);
    return `${parts.join("; ")}.`;
  });

  const choices = log.entries.length;
  const sentences = [
    `You made ${choices} ${choices === 1 ? "choice" : "choices"} between ${clock(0)} and ${clock(state.now)}.`,
    `${state.delivered.length} ${state.delivered.length === 1 ? "item" : "items"} reached you and ${state.missed.length} did not.`,
  ];
  if (state.missed.length > 0) {
    const named = bySend(state.missed.map((m) => m.id)).map((id) => {
      const item = itemById.get(id) as ItemDef;
      return `${item.kind} from ${sourceName(item.source)} at ${clock(item.at)}`;
    });
    sentences.push(`Missed: ${list(named)}.`);
  }
  sentences.push(
    state.staffCalledAt === null
      ? "The staff member on call was not called."
      : `The staff member on call was called at ${clock(state.staffCalledAt)}.`,
  );
  return { summary: sentences.join(" "), decisions };
}
