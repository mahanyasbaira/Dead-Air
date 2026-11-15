import type { Audience, RoleId, SimEvent } from "./types";

/** True when an event is visible to the given role view. */
export function visibleToRole(audience: Audience, role: RoleId): boolean {
  return audience === "all" || audience === role;
}

/**
 * Events a role can see at or before a given sim-time, in deterministic order.
 * Ordering key: (simTime, then event id) so ties are stable.
 */
export function eventsForRole(
  events: SimEvent[],
  role: RoleId,
  upToSimTime: number,
): SimEvent[] {
  return orderEvents(
    events.filter(
      (e) => e.simTime <= upToSimTime && visibleToRole(e.audience, role),
    ),
  );
}

/** Every event up to a sim-time, regardless of audience (facilitator/debrief view). */
export function allEvents(events: SimEvent[], upToSimTime: number): SimEvent[] {
  return orderEvents(events.filter((e) => e.simTime <= upToSimTime));
}

/** Deterministic ordering: ascending simTime, then ascending id. */
export function orderEvents(events: SimEvent[]): SimEvent[] {
  return [...events].sort((a, b) => {
    if (a.simTime !== b.simTime) return a.simTime - b.simTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
