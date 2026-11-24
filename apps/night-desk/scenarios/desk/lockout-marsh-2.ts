// Mechanics for the lockout night. Text lives in ../lockout-marsh-2.ts.
// Seven items and nine actions; judged about six minutes of play for a first-time reader
// from those counts alone (the real-time length is a manual check, not run).
import type { DeskScript } from "../../src/model/types";

const script: DeskScript = {
  id: "lockout-marsh-2",
  rev: 1,
  seed: 4303,
  order: 3,
  startClock: 22 * 60 + 40,
  endsAt: 38,
  tags: ["lockout", "roommate", "guest-rules"],
  items: [
    { id: "n1", source: "staff", at: 0, kind: "note" },
    { id: "p1", source: "phone", at: 2, kind: "message" },
    { id: "c1", source: "chat", at: 6, kind: "message" },
    { id: "d1", source: "door", at: 9, kind: "knock" },
    { id: "p2", source: "phone", at: 15, kind: "call" },
    { id: "c2", source: "chat", at: 22, kind: "message" },
    { id: "d2", source: "door", at: 29, kind: "knock", needsProfessional: true },
  ],
  actions: [
    { id: "check-note", label: "Read the handoff note", key: "n", kind: "respond", cost: 1, attention: "desk", requires: "n1", once: true },
    { id: "text-tomas", label: "Text Tomas that you are on your way", key: "1", kind: "respond", cost: 2, attention: "busy", requires: "p1", once: true },
    { id: "go-stairs", label: "Go to the stairs outside room 212", key: "2", kind: "go", cost: 6, attention: "away", requires: "p1", once: true },
    { id: "answer-chat", label: "Answer the floor chat", key: "3", kind: "respond", cost: 2, attention: "busy", requires: "c1", once: true },
    { id: "answer-door", label: "Open the lounge door to Tomas", key: "4", kind: "respond", cost: 3, attention: "desk", requires: "d1", once: true },
    { id: "call-mei", label: "Call Mei back", key: "5", kind: "respond", cost: 2, attention: "busy", requires: "p2", once: true },
    { id: "talk-both", label: "Talk to Tomas and Mei at the lounge door", key: "6", kind: "respond", cost: 4, attention: "desk", requires: "d2", once: true },
    { id: "call-staff", label: "Phone Ms Alder, the staff member on call", key: "c", kind: "callStaff", cost: 3, attention: "busy" },
    { id: "log", label: "Write a log entry", key: "l", kind: "log", cost: 2, attention: "busy" },
    { id: "wait", label: "Finish your task, then decide", key: "w", kind: "wait", cost: 2, attention: "desk" },
  ],
};

export default script;
