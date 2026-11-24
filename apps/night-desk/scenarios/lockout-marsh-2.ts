// Night 3: a lockout and a roommate disagreement in the fictional Marsh Hall. Text only.
// The mechanics (costs, keys, attention) live in scenarios/desk/lockout-marsh-2.ts.
import type { Scenario } from "hindsight";

export const lockoutMarsh2: Scenario = {
  id: "lockout-marsh-2",
  title: "Locked out on Marsh 2",
  simulationNotice:
    "This is practice with an invented hall and invented people. It does not replace your own organisation's training.",
  summary:
    "Thirty-eight minutes of a duty night in the fictional Marsh Hall. A student is locked out of room 212 and his roommate will not open the door. Word of it reaches you by note, text, chat, knock and call while you are busy with something else.",
  roles: [
    { id: "ra", name: "Sam Okoro", blurb: "The resident assistant on duty, working at the lounge desk." },
    { id: "phone", name: "Duty phone", blurb: "The phone you carry on duty." },
    { id: "chat", name: "Floor chat", blurb: "The group chat for the second floor." },
    { id: "door", name: "The door", blurb: "Whoever knocks at the lounge." },
    { id: "staff", name: "Ms Alder", blurb: "The staff member on call, a phone call away." },
  ],
  events: [
    {
      id: "n1",
      type: "message_created",
      simTime: 0,
      audience: "staff",
      title: "Handoff note",
      body: "Ms Alder left a note: the lockbox holds the spare keys. In this hall's house rule, a spare is lent only after the student signs the sheet, and it comes back by morning. She is on call and a phone call away.",
    },
    {
      id: "p1",
      type: "message_created",
      simTime: 2,
      audience: "phone",
      title: "Text from Tomas",
      body: "Tomas in 212 writes: I left my key inside and Mei will not answer the door. Can you let me in?",
    },
    {
      id: "c1",
      type: "message_created",
      simTime: 6,
      audience: "chat",
      title: "Floor chat",
      body: "Someone in the floor chat writes: Why is a student sitting on the stairs outside 212?",
    },
    {
      id: "d1",
      type: "message_created",
      simTime: 9,
      audience: "door",
      title: "A knock at the door",
      body: "Tomas knocks at the lounge door and says he has been in the corridor for twenty minutes.",
    },
    {
      id: "p2",
      type: "message_created",
      simTime: 15,
      audience: "phone",
      title: "Call from Mei",
      body: "Mei rings the duty phone: Tomas keeps coming in late and waking me. I do not want him in tonight.",
    },
    {
      id: "c2",
      type: "message_created",
      simTime: 22,
      audience: "chat",
      title: "Floor chat again",
      body: "The floor chat says there are raised voices outside 212 and people are trying to sleep.",
    },
    {
      id: "d2",
      type: "message_created",
      simTime: 29,
      audience: "door",
      title: "Both at the lounge door",
      body: "Tomas and Mei arrive together. Each says the other should sleep somewhere else tonight. Voices are raised.",
    },
    {
      id: "end",
      type: "debrief",
      simTime: 38,
      audience: "all",
      title: "Night ends",
      body: "The hall settles. The replay shows what had reached you at each choice.",
    },
  ],
  decisionPrompts: {
    ra: {
      prompt: "A student is locked out of room 212. What do you do?",
      options: [
        { id: "check-note", label: "Read the handoff note" },
        { id: "text-tomas", label: "Text Tomas that you are on your way" },
        { id: "go-stairs", label: "Go to the stairs outside room 212" },
        { id: "answer-chat", label: "Answer the floor chat" },
        { id: "answer-door", label: "Open the lounge door to Tomas" },
        { id: "call-mei", label: "Call Mei back" },
        { id: "talk-both", label: "Talk to Tomas and Mei at the lounge door" },
        { id: "call-staff", label: "Phone Ms Alder, the staff member on call" },
        { id: "log", label: "Write a log entry" },
        { id: "wait", label: "Finish your task, then decide" },
      ],
    },
  },
  discussionPrompts: [
    "Which knocks or calls came while you were on the stairs, and when did you learn of them?",
    "What had reached you when Tomas and Mei both reached the door, and who could you have phoned?",
  ],
};
