# Requirements: Night Desk

## Introduction
A solo rehearsal of a resident assistant's duty night, for one person on one laptop. The mechanic is attention: things reach you through several sources, and doing anything takes simulated minutes during which other things arrive, wait, or are missed. The kit's channel models that. At the end the kit's replay shows what had reached you at each decision. Scripted, deterministic, no server. Visual rules: `.kiro/steering/design-language.md`. Content rules: `.kiro/steering/product.md`.

## Glossary
- **Source**: duty phone, door, floor group chat, handoff note from the previous RA, message from the staff member on call.
- **Item**: one thing arriving from a source (a call, a knock, a message).
- **Action**: something the player does that costs simulated time (answer, go to a room, call the staff member on call, write a log entry, wait).

## Requirements

### 1. Start
1. WHEN the app opens, THE App SHALL show one sentence saying who it is for, one line saying it is practice with invented scenarios, and one button. No sign-up.
2. WHEN the player starts, THE App SHALL begin the shortest scenario as a guided first run: one instruction at a time, shown only until the player has done that thing once.
3. THE player SHALL make a first meaningful choice within 60 seconds of opening the app.

### 2. The night
1. THE App SHALL show the current simulated time, the items that have reached the player, and the actions available now, on one screen without scrolling at 1280×720.
2. WHEN the player takes an action, THE App SHALL advance simulated time by that action's cost and deliver, queue or expire items according to the scenario and the kit's channel. (PBT: time never goes backwards; an item is delivered at most once.)
3. WHILE the player is away from the desk (an action marked as away), items from the duty phone and the door SHALL NOT be delivered; a missed call SHALL appear on return as a missed call with its time, not its content.
4. WHEN a scenario marks a moment as needing a professional, THE App SHALL always offer "call the staff member on call" among the actions. It SHALL NOT force it and SHALL NOT hide it.
5. WHEN the player writes a log entry, THE App SHALL let them choose which known facts to include and SHALL record the entry with its simulated time.
6. A night SHALL end within 8 real minutes for a first-time player.

### 3. Sound
1. WHERE voice clips exist for an item, THE App SHALL play the clip and show its full transcript at the same time.
2. THE App SHALL be fully playable muted, and SHALL play nothing before the first user gesture.

### 4. After the night
1. WHEN the night ends, THE App SHALL open the kit's replay without asking.
2. THE replay page SHALL read as a document: a one-paragraph plain summary, the diagram, then for each decision one sentence stating what had reached the player and what was still on its way or missed.
3. THE App SHALL show three habits as plain figures with one line each on why they matter: time from arrival to acknowledgement, what was written down compared with what was known, and time from a needs-a-professional moment to the call (or that no call was made). No score, no grade, no colour judgement.
4. THE App SHALL offer "play it again" and "choose another night", and a link that reproduces this replay on another device with no server.

### 5. Scenarios
1. THE App SHALL ship at least four nights: a guided short one, and three of about six minutes, drawn from noise, lockout, roommate conflict, guest rules, a leak, an ambiguous alarm.
2. Every scenario SHALL be invented and SHALL name no real institution, policy or procedure. Topics listed as out of scope in the product steering SHALL NOT appear.
3. WHEN more than seven nights exist, THE picker SHALL offer one search field and plain text filters that apply as the player types.
4. THE same scenario and the same choices SHALL always produce the same replay. (PBT)

### 6. Access
1. Every action SHALL be reachable by keyboard, with a visible key hint and visible focus.
2. WHERE the user prefers reduced motion, THE App SHALL change state instantly.
3. WHEN the page is reloaded mid-night, THE App SHALL restore the night from its event log.
