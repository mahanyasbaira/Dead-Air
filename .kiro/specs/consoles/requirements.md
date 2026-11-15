# Requirements: consoles (Booth and Tower)

## Introduction
Each role plays on a different dead device. The consoles are the costume and the controls; they read engine state and dispatch events. Visual rules live in `.kiro/steering/design-language.md`.

## Requirements

### 1. Entry and modes
1. WHEN the app loads, THE Shell SHALL offer three ways to play: Solo (scripted partner), Two tabs, Two devices by sound, with one sentence each.
2. WHEN a judge picks Solo, THE Shell SHALL reach the first scenario beat within two interactions.
3. THE Shell SHALL show a `FICTION · DRILL` marker on every scenario screen and a mute control at all times.

### 2. Booth console
1. THE Booth SHALL show incoming wire text printing at the link's baud rate, a live spectrum waterfall of the audio link, and a carrier lamp with a text state (`IDLE`, `SENDING`, `RECEIVING`, `COLLISION`).
2. WHEN the Booth player composes a message, THE Booth SHALL limit it to 64 bytes and show remaining bytes and estimated airtime.
3. WHEN a frame arrives garbled, THE Booth SHALL print the damaged text with the unreadable bytes marked, never hidden.

### 3. Tower console
1. THE Tower SHALL present a pager-style handheld: a small display, three hardware-style keys, and a short list of canned codes plus free text.
2. WHEN a message arrives, THE Tower SHALL alert with sound, a lamp and a text line, and keep the last 8 messages scrollable.

### 4. Decisions
1. WHEN a scenario beat asks for a decision, THE Console SHALL present the options, record the choice with its sim-time, and allow no change after the next beat begins.
2. THE Console SHALL never tell the player whether a choice was right.

### 5. Accessibility
1. THE Consoles SHALL be fully operable by keyboard with visible focus, and every control SHALL have an accessible name.
2. WHERE the user prefers reduced motion, THE Consoles SHALL replace printing, needle and waterfall animation with instant state and a text status line.
3. THE Consoles SHALL meet WCAG AA contrast for all text with the CRT layer on.
4. WHEN any sound plays, THE Console SHALL show its text equivalent in the status line.

### 6. Resilience
1. WHEN the page is reloaded mid-run, THE Shell SHALL restore the run from the event log in local storage.
2. THE App SHALL work offline after the first load.
