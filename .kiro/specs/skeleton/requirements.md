# Requirements: the skeleton (Hindsight kit and workspace)

## Introduction
The existing code in `src/` becomes a pnpm workspace: one kit and two applications in separate folders. The kit must be small enough to read in one sitting and flexible enough that the two apps, which differ in player count and in what the "channel" is, both use it without copying from it. Generate design and tasks from this file; add correctness properties for requirements marked (PBT). Do this as a move, not a rewrite: existing tests must keep passing at every task.

## Glossary
- **Kit**: `packages/hindsight`.
- **Participant**: anything that sends or receives information in a drill: a player, a scripted partner, or a source such as a phone or a door.
- **Ledger**: the kit module that answers "what did participant P know at time t".

## Requirements

### 1. Workspace
1. THE repository SHALL be a pnpm workspace with `packages/hindsight`, `apps/night-desk` and `apps/dead-air` as separate folders, each with its own `package.json`.
2. WHEN `pnpm test`, `pnpm typecheck` or `pnpm build` is run at the root, THE workspace SHALL run it in every package and fail if any fails.
3. WHEN the move is complete, THE repository SHALL contain no `src/` folder at the root, and every test that passed before the move SHALL pass after it.

### 2. Kit surface
1. THE Kit SHALL export from its core entry: event types, the append-only log, the reducer, replay-from-log, the seeded PRNG, the simulated clock, the lossy channel, and the ledger. The core entry SHALL import nothing from React, the DOM or Web Audio.
2. THE Kit SHALL export the replay view from a separate entry so that a headless consumer does not load React.
3. THE Kit SHALL contain no scenario content and no words specific to either app (no "resident", "booth", "modem").
4. THE Kit SHALL be generic over participants: it SHALL NOT assume two players or fixed role names.
5. THE Kit's public API SHALL be documented in `packages/hindsight/README.md` in under 150 lines, including a 30-line example that builds a minimal drill.

### 3. Kit behaviour
1. WHEN the same scenario, choices and seed are replayed, THE Kit SHALL produce the identical log and ledger. (PBT)
2. THE Ledger's known set for any participant SHALL only grow as time increases. (PBT)
3. THE Ledger SHALL exclude from a participant's known set anything dropped, damaged, collided, or still in transit at time t. (PBT)
4. THE Channel SHALL accept a per-scenario profile and SHALL allow an app to supply its own source of loss (Night Desk: the player's attention; Dead Air: the acoustic link) through one documented interface.

### 4. Independence of the two apps
1. An app SHALL import the kit only through its package name, never by relative path.
2. An app SHALL NOT import from the other app.
3. WHEN code is needed by both apps, it SHALL live in the kit. A check in CI SHALL fail on a cross-app or relative-into-kit import.
4. THE modem (FSK, framing, CRC) and acoustic transport SHALL live in `apps/dead-air`, not in the kit.

### 5. Scenario generation (the kit extends itself)
1. THE repository SHALL define a short scenario brief format (Markdown: title, participants, beats with times, decisions) and a scenario file format validated by a schema in the kit.
2. WHEN a brief is added under an app's `scenarios/briefs/`, a Kiro hook SHALL produce the scenario file and a property test asserting: the scenario validates, every beat is reachable, the run always ends, and every decision has at least two options.
3. THE README SHALL show this as the way to add a third application's content.

### 6. Site
1. THE build SHALL produce one static site with a landing page at `/` and the apps at `/night-desk` and `/dead-air`.
2. THE prototype UI from the first day (`App.tsx`, `RoleView.tsx`, `Debrief.tsx`) SHALL be removed once Night Desk reaches its first playable task.
