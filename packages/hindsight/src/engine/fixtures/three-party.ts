import type { Scenario } from "../types";

/** A neutral three-participant fixture used to test the engine without app content. */
export const threeParty: Scenario = {
  id: "three-party",
  title: "Three-party fixture",
  simulationNotice: "Test fixture. Not a scenario.",
  summary: "Three participants, one shared notice, one delayed message.",
  roles: [
    { id: "p1", name: "Participant 1", blurb: "First participant." },
    { id: "p2", name: "Participant 2", blurb: "Second participant." },
    { id: "p3", name: "Participant 3", blurb: "Third participant." },
  ],
  events: [
    { id: "e1", type: "info", simTime: 0, audience: "all", title: "Start", body: "Shared notice." },
    { id: "e2", type: "info", simTime: 1, audience: "p1", title: "Private to p1", body: "Only p1." },
    { id: "e3", type: "message_created", simTime: 2, audience: "p1", title: "Message A", body: "From p1 to p2." },
    { id: "e4", type: "info", simTime: 3, audience: "p3", title: "Private to p3", body: "Only p3." },
    { id: "e5", type: "message_delivered", simTime: 6, audience: "p2", title: "Message A", body: "From p1 to p2.", linkedTo: "e3" },
    { id: "e6", type: "message_created", simTime: 7, audience: "p3", title: "Message B", body: "Never delivered." },
    { id: "e7", type: "debrief", simTime: 8, audience: "all", title: "End", body: "End of fixture." },
  ],
  decisionPrompts: {
    p1: { prompt: "Choose for p1.", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
    p2: { prompt: "Choose for p2.", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
    p3: { prompt: "Choose for p3.", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
  },
  discussionPrompts: ["What did each participant know, and when?"],
};
