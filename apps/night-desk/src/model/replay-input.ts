// Adapters from a night's log to the kit's replay inputs. Neither mutates its input.
import { buildLedger, ledgerFromChannel, replayChannelLog } from "hindsight";
import type { Ledger, Scenario, SimEvent } from "hindsight";
import type { ReplayParticipant } from "hindsight/replay";
import { intervalsFromLog, runItems } from "./attention";
import type { DeskScript, NightLog, NightState } from "./types";

/** Rebuild the channel run for every item that arrives before the night ends. */
export function toLedger(script: DeskScript, log: NightLog): Ledger {
  const items = script.items.filter((i) => i.at < script.endsAt);
  const { events } = runItems(script, items, intervalsFromLog(script, log));
  const sends = items.map((i) => ({ id: i.id, sender: i.source, recipient: "ra", sendTime: i.at }));
  return buildLedger(ledgerFromChannel(sends, replayChannelLog(events)));
}

const SOURCES = ["phone", "chat", "door", "staff"] as const;

/**
 * One player (`ra`, first) and the four sources as lines. Night Desk knows every
 * source's send time, so all are complete and the view shows no limit notice.
 * Labels are the scenario's role names, never an item's text.
 */
export function toParticipants(scenario: Scenario): ReplayParticipant[] {
  const label = (id: string): string => scenario.roles.find((r) => r.id === id)?.name ?? id;
  return [
    { id: "ra", label: label("ra"), kind: "role", history: "complete" },
    ...SOURCES.map((id): ReplayParticipant => ({ id, label: label(id), kind: "source", history: "complete" })),
  ];
}

/**
 * Readable names for items that reached the player: the scenario's short title for
 * the item, never its body. A missed item gets no name, so the replay shows only
 * its id, its time and its source.
 */
export function toNames(scenario: Scenario, state: NightState): Record<string, string> {
  const names: Record<string, string> = {};
  for (const d of state.delivered) {
    const title = scenario.events.find((e) => e.id === d.id && e.type === "message_created")?.title;
    if (title !== undefined) names[d.id] = title;
  }
  return names;
}

/** The night's Scenario plus one `decision` event per log entry. */
export function toReplayScenario(scenario: Scenario, script: DeskScript, state: NightState): Scenario {
  const decisions: SimEvent[] = state.entries.map((entry, n) => ({
    id: `d${n + 1}`,
    type: "decision",
    simTime: entry.at,
    audience: "ra",
    actor: "ra",
    title: script.actions.find((a) => a.id === entry.actionId)?.label ?? entry.actionId,
    body: "",
  }));
  return { ...scenario, events: [...scenario.events, ...decisions] };
}
