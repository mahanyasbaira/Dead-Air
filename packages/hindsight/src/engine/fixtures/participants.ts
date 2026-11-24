import type { Scenario } from "../types";
/**
 * Builds a neutral scenario fixture for any set of participant ids.
 * Each participant gets one private event; two shared events bracket the timeline.
 * Throws on the reserved id "all" and on duplicate ids. The empty string is allowed.
 */
export function buildParticipantsFixture(ids: readonly string[]): Scenario {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === "all") throw new Error('Participant id "all" is reserved for the shared audience.');
    if (seen.has(id)) throw new Error(`Duplicate participant id: ${JSON.stringify(id)}.`);
    seen.add(id);
  }
  const option = [{ id: "a", label: "Option A" }];
  return {
    id: "participants-fixture",
    title: "Participants fixture",
    simulationNotice: "Test fixture. Not a scenario.",
    summary: `${ids.length} participant(s), one shared notice each end, one private event each.`,
    roles: ids.map((id, i) => ({ id, name: `Participant ${i + 1}`, blurb: "Fixture participant." })),
    events: [
      { id: "s0", type: "info", simTime: 0, audience: "all", title: "Start", body: "Shared notice." },
      ...ids.map((id, i) => ({
        id: `x${i}`,
        type: "info" as const,
        simTime: 1 + (i % 5),
        audience: id,
        title: `Private ${i + 1}`,
        body: "Private notice.",
      })),
      { id: "z9", type: "debrief", simTime: 9, audience: "all", title: "End", body: "End." },
    ],
    // Object.fromEntries defines own data properties, so "__proto__" stays an ordinary key.
    decisionPrompts: Object.fromEntries(ids.map((id) => [id, { prompt: "Choose.", options: option }])),
    discussionPrompts: ["What did each participant know, and when?"],
  };
}
