# Requirements: the Séance (replay)

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
1. THE Séance SHALL draw one worldline per role in that role's colour, every signal as a line whose vertical span equals its delay, lost signals as dashed lines ending in a cross, and decisions as labelled nodes.
2. WHEN a decision node is selected, THE Séance SHALL highlight that role's known set at that moment and dim everything else, and SHALL list in text the facts that existed elsewhere but had not arrived.
3. WHEN the time scrubber moves, THE Séance SHALL update both known sets and the text summary for that instant.
4. THE layout function SHALL be pure: same log gives the same geometry. (PBT)

### 3. Counterfactual
1. WHEN "clear line" is toggled, THE Séance SHALL replay the same log with zero delay and no loss and show, per decision, which additional facts the role would have had.
2. THE Séance SHALL NOT state what the player should have decided.

### 4. Sharing and facilitation
1. WHEN a run ends, THE Séance SHALL produce a link that reproduces the same Séance on another device with no server.
2. THE Séance SHALL show 3 scenario-specific discussion prompts and a one-paragraph plain-text summary that can be copied.
3. THE Séance SHALL be fully usable by keyboard and SHALL provide the same information as an ordered text timeline for screen readers.
