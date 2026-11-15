# Dead Air MVP: draft requirements

## Goal

Give two people a 5-minute fictional event-coordination exercise that reveals how delayed and incomplete information can change a decision. The facilitator uses the debrief as a discussion aid, not as an assessment of competence or real emergency policy.

## User journey

1. The facilitator opens a clearly labeled simulated exercise and starts the built-in fictional scenario. A single-browser two-role demo is the required baseline; separate browser participants are a stretch goal.
2. The facilitator switches between two roles, each of which receives different fictional information. One message arrives late according to a deterministic scripted event.
3. Each role records one choice. The exercise advances through at least three scripted events and ends with a debrief.
4. The debrief reconstructs what happened, what each role knew when they chose, and when the delayed message arrived. It offers discussion prompts without presenting the chosen actions as real-world safety advice.

## Acceptance criteria

- Every screen containing a scenario prominently states that it is a simulation. The scenario has no real names, institution-specific instructions, real alerts, or network notifications.
- An event log contains stable event IDs, ordering, event type, simulated time, audience, and payload. Given the same initial state and event log, the reducer produces the same state and debrief.
- Role-specific information is shown only in the selected role view; the facilitator/debrief view may reveal both perspectives. A single-browser baseline is a demonstration and is not secure multi-user access control.
- The scripted delayed message has a defined creation and delivery event. The debrief shows the difference between when it was created, delivered, and when a decision was recorded.
- A participant can complete the scenario and reach a replay without external accounts, paid APIs, live emergency data, or an LLM. Include a reset control and obvious explanation of demo mode.
- Keyboard-only users can navigate the core journey; essential information is conveyed in text, not color alone; reduced-motion settings are respected.
- Meaningful automated tests cover deterministic replay, role filtering, delayed-message ordering and reset. Manually exercise the complete flow and document the result.
- Public demo builds contain no secrets or real institutional data. Describe known limitations; do not claim real-world effectiveness without user evidence.

## Proposed technical direction, not yet a decision

A TypeScript web app with a deterministic pure state reducer and local JSON scenario. Choose the smallest proven UI stack after checking the environment. Start with local in-browser state; add a server and real-time multiplayer only after the baseline works and the time budget allows. Keep the simulation engine independent of rendering so it can be tested.

## Explicitly out of scope

Live operational use, location tracking, emergency notifications, physiological simulation, automated recommendations, unverified generated facts, individual performance scores, production identity, AI agents inside the simulation, and security claims for role switching in one browser.
