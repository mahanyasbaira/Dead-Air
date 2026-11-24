// Mechanics for the noise night. Text lives in ../loud-music-harlow-3.ts.
// Seven items and nine actions; judged about six minutes of play for a first-time reader
// from those counts alone (the real-time length is a manual check, not run).
import type { DeskScript } from "../../src/model/types";

const script: DeskScript = {
  id: "loud-music-harlow-3",
  rev: 1,
  seed: 4202,
  order: 2,
  startClock: 23 * 60 + 10,
  endsAt: 40,
  tags: ["noise"],
  items: [
    { id: "n1", source: "staff", at: 0, kind: "note" },
    { id: "p1", source: "phone", at: 3, kind: "message" },
    { id: "c1", source: "chat", at: 5, kind: "message" },
    { id: "d1", source: "door", at: 11, kind: "knock" },
    { id: "p2", source: "phone", at: 17, kind: "call" },
    { id: "c2", source: "chat", at: 24, kind: "message" },
    { id: "d2", source: "door", at: 31, kind: "knock", needsProfessional: true },
  ],
  actions: [
    { id: "check-note", label: "Read the handoff note", key: "n", kind: "respond", cost: 1, attention: "desk", requires: "n1", once: true },
    { id: "text-priya", label: "Text Priya that you are on your way", key: "1", kind: "respond", cost: 3, attention: "busy", requires: "p1", once: true },
    { id: "go-306", label: "Go up and knock on room 306", key: "2", kind: "go", cost: 6, attention: "away", requires: "p1", once: true },
    { id: "answer-chat", label: "Answer the floor chat", key: "3", kind: "respond", cost: 2, attention: "busy", requires: "c1", once: true },
    { id: "answer-door", label: "Open the door to the student who knocked", key: "4", kind: "respond", cost: 3, attention: "desk", requires: "d1", once: true },
    { id: "call-priya", label: "Call Priya back", key: "5", kind: "respond", cost: 2, attention: "busy", requires: "p2", once: true },
    { id: "talk-dev", label: "Talk to Dev at the lounge door", key: "6", kind: "respond", cost: 4, attention: "desk", requires: "d2", once: true },
    { id: "call-staff", label: "Phone Ms Alder, the staff member on call", key: "c", kind: "callStaff", cost: 3, attention: "busy" },
    { id: "log", label: "Write a log entry", key: "l", kind: "log", cost: 2, attention: "busy" },
    { id: "wait", label: "Finish your page, then decide", key: "w", kind: "wait", cost: 2, attention: "desk" },
  ],
};

export default script;
