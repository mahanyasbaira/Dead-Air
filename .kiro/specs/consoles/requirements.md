# Requirements: Dead Air interface

> This file replaces the earlier "consoles" requirements. `design.md` and `tasks.md` in this folder were generated from the old version (a CRT teletype and a pager) and must be regenerated from this one. Visual rules: `.kiro/steering/design-language.md`. The modem itself is specified in `signal-chain`.

## Introduction
Dead Air is the kit's second application: two people, two devices, and a link made of sound. The interface is quiet and typographic. The only instrument on screen is the line itself.

## Requirements

### 1. Start, and one person alone
1. WHEN the app opens, THE App SHALL show one sentence saying what it is, and three ways in: "Hear it" (one device), "Two devices", "Two tabs".
2. WHEN a person alone chooses "Hear it", THE App SHALL send a short message through the speaker, decode it from the same device's microphone, and show the bytes arriving, within 20 seconds of opening the app. IF the device cancels its own speaker in the microphone, THEN THE App SHALL say so in text and play the same demonstration over the simulated channel.
3. WHEN microphone permission is denied or unavailable, THE App SHALL fall back to the simulated channel and say so in one sentence.
4. THE App SHALL offer a solo run against a scripted partner that reaches the replay in under four minutes.

### 2. Pairing
1. WHEN two devices choose "Two devices", THE App SHALL pair them by sound alone: one plays a short handshake, the other answers, and each shows the other's role. No code to type, no network.
2. WHEN pairing fails three times, THE App SHALL offer "Two tabs" with one sentence explaining why.

### 3. The line
1. THE App SHALL show the state of the line in words (`idle`, `sending`, `receiving`, `collision`) and as one thin level trace. No spectrum display, no decoration.
2. WHEN the player writes a message, THE App SHALL limit it to 64 bytes and show bytes left and airtime in seconds as the player types.
3. WHEN a message arrives damaged, THE App SHALL show it with the unreadable bytes marked, never hidden and never silently corrected.
4. WHEN the player sends while the line shows `receiving`, THE App SHALL send anyway, record a collision for both sides, and state in text that the line was busy.
5. THE App SHALL provide a one-key read-back that transmits the last received message prefixed `RB:`; the kit SHALL record it as a read-back.
6. Received text SHALL appear at the rate it is decoded, character by character. WHERE the user prefers reduced motion, it SHALL appear at once.

### 4. The drill
1. Each role SHALL see only its own part of the scenario and the messages that reached it intact.
2. WHEN a beat asks for a decision, THE App SHALL record the choice with its simulated time and SHALL NOT say whether it was right.
3. WHEN the drill ends, both devices SHALL open the kit's replay. Each device holds only its own log; THE App SHALL merge the two logs by sound or by a link, and SHALL show a one-sided replay clearly labelled as such if the merge does not happen.

### 5. Listener
1. THE App SHALL offer a listen-only mode that decodes and shows traffic from both roles with times and never transmits.

### 6. Access and resilience
1. Every action SHALL be reachable by keyboard with visible focus; every sound SHALL have a text equivalent; one mute control SHALL always be visible.
2. WHEN the page is reloaded mid-drill, THE App SHALL restore from its event log.
3. THE App SHALL work offline after first load.
