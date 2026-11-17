# Requirements: the replay

> Lives in the kit (`packages/hindsight`, entries `ledger` and `replay`) and is used unchanged by both apps. Earlier drafts called it the replay; the product calls it the replay. Visual rules: `.kiro/steering/design-language.md`, section "The replay".

## Introduction
The debrief turns the event log into a worldline diagram that shows who knew what, when. It is the reason the product is useful and the hero image of the submission.

## Glossary
- **Worldline**: a vertical line for one role; time flows downward.
- **Signal**: a line from a send point on one worldline to its arrival point on the other; slope encodes delay.
- **Known set**: every fact a role had received or observed at a given sim-time.

## Requirements

### 1. Knowledge model
1. WHEN asked for a role's known set at time t, THE Engine SHALL return exactly the facts observed by or delivered intact to that role at or before t. (PBT)
2. THE known set of a role SHALL only grow as t increases. (PBT)
3. WHEN a frame was garbled, dropped or collided, THE Engine SHALL exclude its facts from the recipient's known set and list it as a lost signal.

### 2. Diagram
1. THE Replay SHALL draw one worldline per role in that role's line weight and style (no second hue), every signal as a line whose vertical span equals its delay, lost signals as a line in the loss colour that stops short of the receiver, and decisions as labelled nodes.
2. WHEN a decision node is selected, THE Replay SHALL highlight that role's known set at that moment and dim everything else, and SHALL list in text the facts that existed elsewhere but had not arrived.
3. WHEN the time scrubber moves, THE Replay SHALL update both known sets and the text summary for that instant.
4. THE layout function SHALL be pure: same log gives the same geometry. (PBT)

### 3. Counterfactual
1. WHEN "clear line" is toggled, THE Replay SHALL replay the same log with zero delay and no loss and show, per decision, which additional facts the role would have had.
2. THE Replay SHALL NOT state what the player should have decided.

### 4. Sharing and facilitation
1. WHEN a run ends, THE Replay SHALL produce a link that reproduces the same Séance on another device with no server.
2. THE Replay SHALL show 3 scenario-specific discussion prompts and a one-paragraph plain-text summary that can be copied.
3. THE Replay SHALL be fully usable by keyboard and SHALL provide the same information as an ordered text timeline for screen readers.

### 5. Habits (facts, not scores)
1. WHEN a run ends, THE Replay SHALL show per role: number of transmissions, mean bytes and airtime per message, number of collisions that role caused, and number of received instructions that were read back before the next decision.
2. THE habit figures SHALL be computed by a pure function of the event log. (PBT: same log gives same figures; adding a collision never lowers the collision count.)
3. THE Replay SHALL present habit figures as plain counts with a one-line explanation of why the habit matters, and SHALL NOT rank roles, colour them good or bad, or produce a total score.

### 6. Shared by both apps
1. THE Replay SHALL take only a kit event log and a list of participants as input, and SHALL contain no scenario text, role names or wording specific to either app.
2. WHEN there is a single participant (Night Desk), THE Replay SHALL draw the participant's line and one line per source of information (phone, door, group chat, handoff note), with the same signal and decision rules.
3. THE Replay SHALL be rendered as SVG with selectable text, and SHALL print legibly in black and white on one page.
