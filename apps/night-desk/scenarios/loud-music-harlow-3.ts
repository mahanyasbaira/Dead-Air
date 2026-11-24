// Night 2: a noise night in the fictional Harlow Hall. Text only.
// The mechanics (costs, keys, attention) live in scenarios/desk/loud-music-harlow-3.ts.
import type { Scenario } from "hindsight";

export const loudMusicHarlow3: Scenario = {
  id: "loud-music-harlow-3",
  title: "Loud music on Harlow 3",
  simulationNotice:
    "This is practice with an invented hall and invented people. It does not replace your own organisation's training.",
  summary:
    "Forty minutes of a duty night in the fictional Harlow Hall. Music from room 306 keeps coming back, and word of it reaches you by note, text, chat, knock and call while you are busy with something else.",
  roles: [
    { id: "ra", name: "Jo Marlowe", blurb: "The resident assistant on duty, studying in the hall lounge." },
    { id: "phone", name: "Duty phone", blurb: "The phone you carry on duty." },
    { id: "chat", name: "Floor chat", blurb: "The group chat for the third floor." },
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
      body: "Ms Alder left a note: room 306 had a quiet-hours reminder last night. She is on call and a phone call away.",
    },
    {
      id: "p1",
      type: "message_created",
      simTime: 3,
      audience: "phone",
      title: "Text from Priya",
      body: "Priya in 304 writes: Music from 306 again. It has been going for an hour. Can someone say something?",
    },
    {
      id: "c1",
      type: "message_created",
      simTime: 5,
      audience: "chat",
      title: "Floor chat",
      body: "Someone in the floor chat writes: Can anyone else hear the bass from 306, or is it just my wall?",
    },
    {
      id: "d1",
      type: "message_created",
      simTime: 11,
      audience: "door",
      title: "A knock at the door",
      body: "A student from the next floor knocks and says the bass is shaking the corridor.",
    },
    {
      id: "p2",
      type: "message_created",
      simTime: 17,
      audience: "phone",
      title: "Call from Priya",
      body: "Priya rings the duty phone: I have a lab at 8. Please come soon.",
    },
    {
      id: "c2",
      type: "message_created",
      simTime: 24,
      audience: "chat",
      title: "Floor chat again",
      body: "The floor chat says the music dropped for a while, then came back louder.",
    },
    {
      id: "d2",
      type: "message_created",
      simTime: 31,
      audience: "door",
      title: "Dev at the lounge door",
      body: "Dev from 306 comes to the lounge. He says he will not turn it down and that you cannot make him. Voices are raised in the corridor.",
    },
    {
      id: "end",
      type: "debrief",
      simTime: 40,
      audience: "all",
      title: "Night ends",
      body: "The hall settles. The replay shows what had reached you at each choice.",
    },
  ],
  decisionPrompts: {
    ra: {
      prompt: "Music is coming from room 306. What do you do?",
      options: [
        { id: "check-note", label: "Read the handoff note" },
        { id: "text-priya", label: "Text Priya that you are on your way" },
        { id: "go-306", label: "Go up and knock on room 306" },
        { id: "answer-chat", label: "Answer the floor chat" },
        { id: "answer-door", label: "Open the door to the student who knocked" },
        { id: "call-priya", label: "Call Priya back" },
        { id: "talk-dev", label: "Talk to Dev at the lounge door" },
        { id: "call-staff", label: "Phone Ms Alder, the staff member on call" },
        { id: "log", label: "Write a log entry" },
        { id: "wait", label: "Finish your page, then decide" },
      ],
    },
  },
  discussionPrompts: [
    "Which calls or knocks came while you were upstairs, and when did you learn of them?",
    "What had reached you when Dev said he would not turn it down, and who could you have phoned?",
  ],
};
