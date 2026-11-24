// Synthetic night used by model tests. Invented and neutral; no scenario content.
import type { Scenario } from "hindsight";
import type { DeskScript, NightLog } from "./types";

export const fixtureScript: DeskScript = {
  id: "synthetic-night",
  rev: 1,
  seed: 4101,
  order: 1,
  startClock: 23 * 60 + 10,
  endsAt: 25,
  guided: true,
  tags: ["synthetic"],
  items: [
    { id: "i1", source: "chat", at: 0, kind: "message" },
    { id: "i2", source: "phone", at: 8, kind: "call" },
    { id: "i3", source: "chat", at: 9, kind: "message" },
    { id: "i5", source: "chat", at: 12, kind: "message", expiresAfter: 2 },
    { id: "i4", source: "chat", at: 13, kind: "message" },
    { id: "i7", source: "door", at: 16, kind: "knock" },
    { id: "i6", source: "phone", at: 17, kind: "call", lapse: 1 },
    { id: "i8", source: "phone", at: 19, kind: "call", needsProfessional: true },
  ],
  actions: [
    { id: "read", label: "Read the message", key: "1", kind: "respond", cost: 5, attention: "desk", requires: "i1" },
    { id: "go", label: "Go to the room", key: "2", kind: "go", cost: 6, attention: "away" },
    { id: "text", label: "Reply by text", key: "3", kind: "respond", cost: 4, attention: "busy", requires: "i3" },
    { id: "board", label: "Check the board", key: "4", kind: "respond", cost: 1, attention: "desk", once: true },
    { id: "call-staff", label: "Call the staff member", key: "c", kind: "callStaff", cost: 3, attention: "busy" },
    { id: "log", label: "Write a log entry", key: "l", kind: "log", cost: 2, attention: "busy" },
    { id: "wait", label: "Wait", key: "w", kind: "wait", cost: 1, attention: "desk" },
  ],
  guide: [
    { id: "g1", text: "Read the message and choose what to do.", done: { actionId: "read" } },
    { id: "g2", text: "Notice the clock moved.", done: { kind: "wait" } },
  ],
};

export const unguidedScript: DeskScript = { ...fixtureScript, guided: undefined };

export const fixtureScenario: Scenario = {
  id: "synthetic-night",
  title: "Synthetic night",
  simulationNotice: "Practice only.",
  summary: "A synthetic night for model tests.",
  roles: [
    { id: "ra", name: "You", blurb: "The player." },
    { id: "phone", name: "Phone", blurb: "Calls." },
    { id: "chat", name: "Chat", blurb: "Messages." },
    { id: "door", name: "Door", blurb: "Knocks." },
    { id: "staff", name: "Staff", blurb: "On call." },
  ],
  events: [
    ...fixtureScript.items.map((i) => ({
      id: i.id,
      type: "message_created" as const,
      simTime: i.at,
      audience: i.source,
      title: `Item ${i.id}`,
      body: `Body of ${i.id}`,
    })),
    { id: "end", type: "debrief", simTime: 25, audience: "all", title: "End", body: "" },
  ],
  decisionPrompts: {},
  discussionPrompts: [],
};

export function emptyLog(script: DeskScript = fixtureScript): NightLog {
  return { v: 1, scenarioId: script.id, rev: script.rev, seed: script.seed, entries: [] };
}
