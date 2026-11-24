// Mechanics for the guided first night. Text lives in ../guided-first-night.ts.
import type { DeskScript } from "../../src/model/types";

const script: DeskScript = {
  id: "guided-first-night",
  rev: 2,
  seed: 4101,
  order: 1,
  startClock: 23 * 60 + 10,
  endsAt: 20,
  guided: true,
  tags: ["noise", "guided"],
  items: [
    { id: "i1", source: "phone", at: 0, kind: "message" },
    { id: "i2", source: "chat", at: 3, kind: "message" },
    { id: "i3", source: "door", at: 11, kind: "knock" },
  ],
  actions: [
    { id: "read-text", label: "Read the text and reply that you are on your way", key: "1", kind: "respond", cost: 5, attention: "busy", requires: "i1", once: true },
    { id: "reply-chat", label: "Answer the floor chat", key: "2", kind: "respond", cost: 3, attention: "busy", requires: "i2", once: true },
    { id: "answer-door", label: "Open the door to the student who knocked", key: "3", kind: "respond", cost: 3, attention: "desk", requires: "i3", once: true },
    { id: "call-staff", label: "Phone Ms Alder, the staff member on call", key: "c", kind: "callStaff", cost: 3, attention: "busy" },
    { id: "log", label: "Write a log entry", key: "l", kind: "log", cost: 2, attention: "busy" },
    { id: "wait", label: "Wait a couple of minutes", key: "w", kind: "wait", cost: 2, attention: "desk" },
  ],
  guide: [
    { id: "g1", text: "Read the text and choose what to do.", done: { actionId: "read-text" } },
    { id: "g2", text: "Notice the clock moved and the new message that arrived while you were busy.", done: { actionId: "reply-chat" } },
    { id: "g3", text: "Write down what you know.", done: { kind: "log" } },
  ],
};

export default script;
