// Guided first night: a short, invented noise night in the fictional Linden Hall.
// Text only. The mechanics (costs, keys, guide) live in scenarios/desk/guided-first-night.ts.
import type { Scenario } from "hindsight";

export const guidedFirstNight: Scenario = {
  id: "guided-first-night",
  title: "Guided first night",
  simulationNotice:
    "This is practice with an invented hall and invented people. It does not replace your own organisation's training.",
  summary:
    "About twenty minutes of a quiet duty night in the fictional Linden Hall. A text, a chat message and a knock reach you while you are busy with something else.",
  roles: [
    { id: "ra", name: "Jo Marlowe", blurb: "The resident assistant on duty, at the desk in the lounge." },
    { id: "phone", name: "Duty phone", blurb: "The phone you carry on duty." },
    { id: "chat", name: "Floor chat", blurb: "The group chat for the second floor." },
    { id: "door", name: "The door", blurb: "Whoever knocks at the lounge." },
    { id: "staff", name: "Ms Alder", blurb: "The staff member on call, a phone call away." },
  ],
  events: [
    {
      id: "i1",
      type: "message_created",
      simTime: 0,
      audience: "phone",
      title: "Text on the duty phone",
      body: "Priya in 204 writes: The music in 206 is loud again. Could someone come and ask them to turn it down?",
    },
    {
      id: "i2",
      type: "message_created",
      simTime: 3,
      audience: "chat",
      title: "Floor chat",
      body: "Someone in the floor chat writes: Is that bass from 206 or is it just me? Anyone else hearing it?",
    },
    {
      id: "i3",
      type: "message_created",
      simTime: 11,
      audience: "door",
      title: "A knock at the door",
      body: "A student from the next floor knocks and asks if the noise is being dealt with.",
    },
    {
      id: "end",
      type: "debrief",
      simTime: 20,
      audience: "all",
      title: "Night ends",
      body: "The hall settles. The replay shows what had reached you at each choice.",
    },
  ],
  decisionPrompts: {
    ra: {
      prompt: "Priya has texted about the music. What do you do?",
      options: [
        { id: "read-text", label: "Read the text and reply that you are on your way" },
        { id: "reply-chat", label: "Answer the floor chat" },
        { id: "answer-door", label: "Open the door to the student who knocked" },
        { id: "call-staff", label: "Phone Ms Alder, the staff member on call" },
        { id: "log", label: "Write a log entry" },
        { id: "wait", label: "Wait a couple of minutes" },
      ],
    },
  },
  discussionPrompts: [
    "What had reached you when you made your first choice, and what was still on its way?",
    "Which message arrived while you were busy, and when did it reach you?",
  ],
};
