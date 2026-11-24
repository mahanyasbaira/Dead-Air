// Night 4: a leak and an ambiguous alarm sound in the fictional Ferris Hall. Text only.
// The mechanics (costs, keys, attention) live in scenarios/desk/leak-ferris-1.ts.
import type { Scenario } from "hindsight";

export const leakFerris1: Scenario = {
  id: "leak-ferris-1",
  title: "Leak on Ferris 2",
  simulationNotice:
    "This is practice with an invented hall and invented people. It does not replace your own organisation's training.",
  summary:
    "Forty minutes of a duty night in the fictional Ferris Hall. Water spreads along a corridor and a short beep may or may not mean anything, and word of both reaches you by note, chat, text, knock and call while you are busy with something else.",
  roles: [
    { id: "ra", name: "Sam Reyes", blurb: "The resident assistant on duty, finishing a reading in the hall lounge." },
    { id: "phone", name: "Duty phone", blurb: "The phone you carry on duty." },
    { id: "chat", name: "Floor chat", blurb: "The group chat for the second floor." },
    { id: "door", name: "The door", blurb: "Whoever knocks at the lounge." },
    { id: "staff", name: "Ms Okoro", blurb: "The staff member on call, a phone call away." },
  ],
  events: [
    {
      id: "n1",
      type: "message_created",
      simTime: 0,
      audience: "staff",
      title: "Handoff note",
      body: "Ms Okoro left a note: the building's maintenance line is closed tonight, and the water shut-off is not for residents to touch. She is on call and a phone call away.",
    },
    {
      id: "c1",
      type: "message_created",
      simTime: 3,
      audience: "chat",
      title: "Floor chat",
      body: "Someone in the floor chat writes: Did anyone else hear a single short beep from the ceiling on 2, or was that just me?",
    },
    {
      id: "p1",
      type: "message_created",
      simTime: 8,
      audience: "phone",
      title: "Text from Tobin",
      body: "Tobin in 210 writes: There is a puddle by the laundry room door and it is getting bigger.",
    },
    {
      id: "d1",
      type: "message_created",
      simTime: 13,
      audience: "door",
      title: "A knock at the door",
      body: "A student knocks and says the beep came again, from the stairwell end of the corridor.",
    },
    {
      id: "p2",
      type: "message_created",
      simTime: 19,
      audience: "phone",
      title: "Call from Mina",
      body: "Mina rings the duty phone: Water has reached my doorway and my rug is wet.",
    },
    {
      id: "c2",
      type: "message_created",
      simTime: 24,
      audience: "chat",
      title: "Floor chat again",
      body: "The floor chat says the beeping stopped. One person says it is probably a low battery. Another is not so sure.",
    },
    {
      id: "d2",
      type: "message_created",
      simTime: 33,
      audience: "door",
      title: "Tobin at the lounge door",
      body: "Tobin comes to the lounge. He says the water now reaches past two doors and a ceiling tile is dripping.",
    },
    {
      id: "end",
      type: "debrief",
      simTime: 40,
      audience: "all",
      title: "Night ends",
      body: "The corridor goes quiet. The replay shows what had reached you at each choice.",
    },
  ],
  decisionPrompts: {
    ra: {
      prompt: "Water and a short beep on Ferris 2. What do you do?",
      options: [
        { id: "check-note", label: "Read the handoff note" },
        { id: "answer-chat", label: "Answer the floor chat" },
        { id: "text-tobin", label: "Text Tobin that you are on your way" },
        { id: "go-laundry", label: "Go up and look at the laundry room corridor" },
        { id: "answer-door", label: "Open the door to the student who knocked" },
        { id: "call-mina", label: "Call Mina back" },
        { id: "talk-tobin", label: "Talk to Tobin at the lounge door" },
        { id: "call-staff", label: "Phone Ms Okoro, the staff member on call" },
        { id: "log", label: "Write a log entry" },
        { id: "wait", label: "Finish your page, then decide" },
      ],
    },
  },
  discussionPrompts: [
    "Which calls or knocks came while you were upstairs, and when did you learn of them?",
    "What had reached you about the water when Tobin came to the door, and who could you have phoned?",
  ],
};
