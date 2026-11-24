import type { Scenario } from "hindsight";

/**
 * "Static on Channel 9" — a fully fictional community-radio field exercise.
 *
 * Everything here is synthetic: invented names, an invented station, an invented
 * drill. There are NO real alerts, no real institutions, no real procedures, and
 * nothing in here is real-world emergency advice. It exists only to show how a
 * delayed message changes what each role knew when they chose.
 *
 * The timeline is the single source of truth. The "dead air" is the gap between
 * event msg-created (simTime 2) and msg-delivered (simTime 5).
 */
export const staticOnChannel9: Scenario = {
  id: "static-on-channel-9",
  title: "Static on Channel 9",
  simulationNotice:
    "SIMULATION — a fictional tabletop exercise. No real people, places, alerts, or advice.",
  summary:
    "A small volunteer radio crew is running a pretend outdoor-festival coverage drill. " +
    "Two roles share one timeline, but one weather note takes a while to get through.",
  roles: [
    {
      id: "dispatch",
      name: "Dispatch (fictional)",
      blurb:
        "Sits at the make-believe base table and hears incoming notes first.",
    },
    {
      id: "field",
      name: "Field Lead (fictional)",
      blurb: "Out at the pretend stage area; relies on radio to learn anything.",
    },
  ],
  events: [
    {
      id: "evt-01-brief",
      type: "info",
      simTime: 0,
      audience: "all",
      title: "Drill begins",
      body:
        "Both roles are told the pretend festival is calm and the sky is clear. " +
        "This is a practice exercise only.",
    },
    {
      id: "evt-02-field-note",
      type: "info",
      simTime: 1,
      audience: "field",
      title: "Field sees a gust",
      body:
        "Field Lead notices a sudden pretend gust knock over a banner. " +
        "Only the Field Lead sees this yet.",
    },
    {
      id: "msg-created-wind",
      type: "message_created",
      simTime: 2,
      audience: "dispatch",
      title: "Dispatch writes a wind note",
      body:
        "Dispatch composes a fictional note: \"Wind picking up near the stage — " +
        "consider pausing the acoustic set.\" It is sent over a flaky radio link.",
      linkedTo: "msg-delivered-wind",
    },
    {
      id: "evt-03-crowd",
      type: "info",
      simTime: 3,
      audience: "all",
      title: "Crowd grows",
      body: "Both roles hear that more pretend attendees are arriving at the stage.",
    },
    {
      id: "msg-delivered-wind",
      type: "message_delivered",
      simTime: 5,
      audience: "field",
      title: "Wind note finally arrives",
      body:
        "The wind note from Dispatch reaches the Field Lead now — three sim-minutes " +
        "after it was written. This gap is the \"dead air\".",
      linkedTo: "msg-created-wind",
    },
    {
      id: "evt-04-debrief",
      type: "debrief",
      simTime: 6,
      audience: "all",
      title: "Exercise ends",
      body: "The drill is over. Review who knew what, and when.",
    },
  ],
  decisionPrompts: {
    dispatch: {
      prompt:
        "As Dispatch, what do you note in the pretend log before the drill ends? " +
        "(Discussion only — not real advice.)",
      options: [
        { id: "d-hold", label: "Suggest holding the acoustic set" },
        { id: "d-continue", label: "Suggest continuing as planned" },
        { id: "d-ask", label: "Ask Field Lead for a status check" },
      ],
    },
    field: {
      prompt:
        "As Field Lead, what do you do at the stage before the drill ends? " +
        "(Discussion only — not real advice.)",
      options: [
        { id: "f-pause", label: "Pause the acoustic set" },
        { id: "f-watch", label: "Keep going but watch the banners" },
        { id: "f-radio", label: "Radio base for more information" },
      ],
    },
  },
  discussionPrompts: [
    "When did each role first have the wind information? How big was the gap?",
    "Did a decision get recorded before the delayed note arrived? What changed after?",
    "What low-tech habit might shrink the dead air next time? (Discussion, not policy.)",
  ],
};
