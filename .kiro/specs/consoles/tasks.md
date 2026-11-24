# Implementation Plan: consoles (Booth and Tower)

## Overview

This plan builds the UI layer of Dead Air on top of the finished signal-chain
(`src/transport`, `src/channel`, `src/modem`) and the pure engine
(`src/engine`). It starts from the pure, DOM-free logic the consoles depend on
(carrier state, composer budget, print-line marking, Tower history, decision
lock, audio status twin, run persistence) so the seven correctness properties
land early, then wires React structure, the two consoles, the CRT/waterfall/audio
effects, and the Shell around that logic.

All new code lives in `src/ui/` (`shell/`, `consoles/booth/`, `consoles/tower/`,
`fx/crt/`, `fx/waterfall/`, `fx/audio/`). Imports stay one-way
(`ui -> transport -> modem/channel -> engine`); consoles dispatch engine events
and append to the log, never mutating engine state. No CSS framework, no
component library, no 3D framework.

**Done means:** `pnpm typecheck`, `pnpm test`, `pnpm build` all pass, and the
task's own tests (example + property) pass. Property tests run ≥ 100 iterations
and carry their `Feature: consoles, Property N` tag. Contrast (Req 5.3) and
offline (Req 6.2) results are recorded in `docs/RESULTS.md`. Mark an item `[x]`
only on confirmed re-run evidence.

### Decisions (developer, 2026-11-23)

- **11.1 is brought forward** ahead of the dependency waves so the transport choice and the microphone fallback reason become visible. It lands beside the prototype and does not replace it. Mounting the shell as the app entry is still task 13.1.
- **No CRT treatment.** `design-language.md` bans scanlines, barrel curve, glow, bloom and blur. Task 7.1 is superseded: build a plain static surface, or nothing.
- **Drill marker is sentence case.** Exact text: "Fiction. Practice drill." This is the single plain statement `product.md` requires. The all-caps `FICTION · DRILL` in older text below is replaced by it.
- **Layout follows the design language** (11.3 and every screen): 12-column grid, 8 px baseline, left-aligned, nothing centred unless it is alone on the screen. Not a centred fixed-aspect panel.

## Tasks

- [x] 1. Set up UI module structure and shared types
  - Create `src/ui/shell/`, `src/ui/consoles/booth/`, `src/ui/consoles/tower/`, `src/ui/fx/crt/`, `src/ui/fx/waterfall/`, `src/ui/fx/audio/`.
  - Add `src/ui/shell/types.ts` with UI-only models from the design: `PlayMode`, `CarrierState`, `ConsoleLogEntry`, `PersistedRun`, `PrintLine`, `ComposerBudget`.
  - Re-export the engine/transport types the consoles consume (`Scenario`, `SimEvent`, `SimState`, `RecordedDecision`, `RoleId`, `Transport`, `TransportEvent`, `TransportFrame`, `TransportMode`) without redefining them; keep imports one-way (`ui -> transport -> engine`).
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.2, 4.1, 6.1_

- [x] 2. Booth pure logic: carrier lamp, composer budget, garbled print line
  - [x] 2.1 Implement `carrierState` in `src/ui/consoles/booth/carrier.ts`
    - Pure function `carrierState(mode: TransportMode, recentOutcomeKind?: TransportEventKind): CarrierState` following the design rule: `transmitting` ⇒ `SENDING`; else recent `collision` ⇒ `COLLISION`; else recent `received`/`garbled` ⇒ `RECEIVING`; else `IDLE`.
    - No DOM; total mapping to exactly one of the four labels.
    - _Requirements: 2.1_

  - [x]* 2.2 Write property test for carrier state mapping
    - `src/ui/consoles/booth/carrier.prop.test.ts`, ≥ 100 iterations.
    - **Property 1: Carrier state is a total mapping to one of four labels**
    - Tag: `Feature: consoles, Property 1: Carrier state is a total mapping to one of four labels`
    - **Validates: Requirements 2.1**

  - [x] 2.3 Implement `composerBudget` in `src/ui/consoles/booth/composer.ts`
    - Pure function computing `usedBytes` (UTF-8 encoded length), `remainingBytes = max(0, 64 - usedBytes)`, `estimatedAirtime` (from frame length + link baud), and `overLimit = usedBytes > 64`.
    - Expose a payload-builder that never returns more than 64 bytes.
    - _Requirements: 2.2_

  - [x]* 2.4 Write property test for composer budget
    - `src/ui/consoles/booth/composer.prop.test.ts`, ≥ 100 iterations.
    - **Property 2: Composer budget respects the 64-byte limit**
    - Tag: `Feature: consoles, Property 2: Composer budget respects the 64-byte limit`
    - **Validates: Requirements 2.2**

  - [x] 2.5 Implement `toPrintLine` in `src/ui/consoles/booth/garbled.ts`
    - Pure function mapping a received payload + set of undecodable positions to a `PrintLine`: one glyph per payload position (nothing dropped), undecodable positions flagged `garbled: true` and rendered with a visible marker glyph, plus an accessible `label` summary.
    - _Requirements: 2.3_

    - _Note (developer-approved, 2026-11-23): reworked to decode UTF-8 and tile byte spans; see design.md, Property 3 change note._
  - [x]* 2.6 Write property test for garbled marking
    - `src/ui/consoles/booth/garbled.prop.test.ts`, ≥ 100 iterations.
    - **Property 3: Garbled bytes are marked, never hidden**
    - Tag: `Feature: consoles, Property 3: Garbled bytes are marked, never hidden`
    - **Validates: Requirements 2.3**

    - _Note (developer-approved, 2026-11-23): Property 3 restated as byte-span tiling plus an `invalid` flag; see design.md._
- [x] 3. Tower pure logic: message history fold
  - [x] 3.1 Implement `foldHistory` in `src/ui/consoles/tower/history.ts`
    - Pure reducer folding arriving messages into a bounded list keeping `min(8, count)` most-recent arrivals in arrival order; older messages drop off.
    - _Requirements: 3.2_

  - [x]* 3.2 Write property test for Tower history
    - `src/ui/consoles/tower/history.prop.test.ts`, ≥ 100 iterations.
    - **Property 4: Tower keeps exactly the last 8 messages in order**
    - Tag: `Feature: consoles, Property 4: Tower keeps exactly the last 8 messages in order`
    - **Validates: Requirements 3.2**

- [x] 4. Run log, decision lock, and persistence (pure)
  - [x] 4.1 Implement the console log + decision-lock logic in `src/ui/shell/log.ts`
    - Pure functions over `ConsoleLogEntry[]`: append a wire `TransportEvent`, record a decision with role/option/sim-time, and derive `SimState` by replaying the log through the engine reducer.
    - Decision lock: once the timeline advances past the decision's beat, a later change for that role is rejected; the stored decision keeps its original option id and sim-time (the engine reducer is the authority).
    - _Requirements: 4.1, 6.1_

  - [x]* 4.2 Write property test for decision lock
    - `src/ui/shell/decision-lock.prop.test.ts`, ≥ 100 iterations.
    - **Property 5: A recorded decision locks after the next beat begins**
    - Tag: `Feature: consoles, Property 5: A recorded decision locks after the next beat begins`
    - **Validates: Requirements 4.1**

  - [x] 4.3 Implement run persistence in `src/ui/shell/persist.ts`
    - `serialize(run): PersistedRun` and `restore(raw): SimState | null`: write `PersistedRun` (version 1, scenarioId, seed, mode, append-only log) to local storage; restore by validating and replaying the log through the reducer.
    - On bad JSON / unknown `version` / unknown `scenarioId`, return a discard signal (no throw) so the Shell can start fresh.
    - _Requirements: 6.1_

  - [x]* 4.4 Write property test for persistence round-trip
    - `src/ui/shell/persist.prop.test.ts`, ≥ 100 iterations.
    - **Property 7: A run restores exactly from its persisted log**
    - Tag: `Feature: consoles, Property 7: A run restores exactly from its persisted log`
    - **Validates: Requirements 6.1**

- [x] 5. Checkpoint — pure console logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Audio bus with mandatory status twin
  - [x] 6.1 Implement the audio bus in `src/ui/fx/audio/bus.ts`
    - Thin Web Audio wrapper (carrier tone, modem chirp, static bed, key click). Respects global mute, plays nothing before a user gesture (queues silently), and for every sound emits exactly one status-line text entry describing it. _(Note 2026-11-23: following the design language, no key click and no static bed; only carrier tone and modem chirp. Sounds before the first gesture are dropped, not queued, since they describe stale live state; the text entry is still emitted.)_
    - Extract the sound→text mapping as a pure function so it is testable in Node without Web Audio.
    - _Requirements: 5.4_

  - [x]* 6.2 Write property test for sound text twin
    - `src/ui/fx/audio/status-twin.prop.test.ts`, ≥ 100 iterations.
    - **Property 6: Every sound has a text twin**
    - Tag: `Feature: consoles, Property 6: Every sound has a text twin`
    - **Validates: Requirements 5.4**

  - [x] 6.3 Implement `StatusLine` in `src/ui/shell/StatusLine.tsx`
    - Single `aria-live="polite"` region rendering the text twin of every sound and every lamp/colour state.
    - _Requirements: 5.4, 2.1, 3.2_

- [x] 7. FX layers: CRT post-process and waterfall
  - [x] 7.1 Implement `CrtLayer` in `src/ui/fx/crt/CrtLayer.tsx`
    - One Canvas/WebGL post-process layer (scanlines, slight barrel curve, phosphor persistence, bloom) that can be switched off; honours `prefers-reduced-motion` by rendering a static surface.
    - _Note (developer, 2026-11-23): superseded. See Decisions above; render a plain static surface, no scanlines, curve, glow, bloom or blur._
    - _Note (2026-11-23): superseded by the design language (no CRT, scanlines, glow, bloom or blur); nothing to build._
    - _Requirements: 5.2, 5.3_

  - [x] 7.2 Implement the static SVG signal indicator in `src/ui/fx/waterfall/SignalIndicator.tsx`
    - Pure model `signalIndicator(mode, lastMeasurement?)` in `signal.ts`: `unavailable` (with text) or `measured` (dbfs, rms, peak, airtimeMs, text, bar).
    - Draw only a real measurement: the acoustic transport's per-burst `airtimeMs`, `rms`, `dbfs`, `peak`. In solo and loopback show "Signal level: not measured in this mode."; in acoustic mode before any burst show "Signal level: no message heard yet." No synthesised data, no bars when unavailable.
    - The SVG has `role="img"` and an `aria-label` equal to the visible text beside it. Static: no animation, so reduced motion needs nothing extra.
    - _Note (developer, 2026-11-23): replaces the Canvas scrolling waterfall (tech.md: SVG, no canvas effects; design-language: no chart unless it shows what a sentence cannot). The folder keeps the name `waterfall` to avoid churn._
    - _Requirements: 2.1, 5.2_

  - [x]* 7.3 Write unit tests for the pure signal indicator model (`signal.ts`)
    - Solo and loopback unavailable; acoustic without a measurement unavailable; acoustic with a measurement measured, with the right text; bar clamped; no NaN for silence. Component test for `SignalIndicator.tsx` covers text and accessible name.
    - _Note (developer, 2026-11-23): replaces the tests for the spectrum-frame builder._
    - _Requirements: 2.1_

- [x] 8. Booth console component
  - [x] 8.1 Implement `BoothConsole` and its parts in `src/ui/consoles/booth/`
    - `BoothConsole` composing `Teleprinter` (prints at baud rate, uses `toPrintLine` so garbled bytes are marked), `Waterfall`, `CarrierLamp` (uses `carrierState`, shows coloured lamp + text state), and `Composer` (uses `composerBudget`, shows remaining bytes + estimated airtime, blocks over-limit sends).
    - Reads role-visible events and `transport.mode` from the Shell; builds a `TransportFrame` and calls `transport.send(...)`.
    - _Note (2026-11-23): the Teleprinter shows each received line at once with its airtime ("0.42 s on air"), not at baud rate; no character-by-character animation (design language: state changes are instant)._
    - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 8.2 Write unit tests for Booth rendering and over-limit block
    - Teleprinter marks (does not hide) garbled bytes; carrier lamp shows all four states with text; composer shows live budget and blocks send when `overLimit`.
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 9. Tower console component
  - [x] 9.1 Implement `TowerConsole` and its parts in `src/ui/consoles/tower/`
    - `TowerConsole` with `PagerDisplay` (current message + scrollable history via `foldHistory`), `PagerKeys` (exactly three keyboard-operable keys with visible focus and accessible names), canned-code list plus free text, and `InboundAlert` (sound + lamp + text line on arrival, pushes to history).
    - _Requirements: 3.1, 3.2_

  - [x]* 9.2 Write unit tests for Tower chrome and inbound alert
    - Display, exactly three keyboard-operable keys, canned-code list, free-text entry (Req 3.1); inbound alert fires sound + lamp + text line on a single arrival (Req 3.2).
    - _Requirements: 3.1, 3.2_

- [x] 10. Shared decision prompt
  - [x] 10.1 Implement `DecisionPrompt` in `src/ui/shell/DecisionPrompt.tsx`
    - Renders options from `scenario.decisionPrompts[role]`, records the choice with its reached `cursorSimTime` via the decision-lock logic, locks once the next beat begins, and shows no correctness affordance (no check/cross, no colour-coding, no score).
    - _Requirements: 4.1, 4.2_

  - [x]* 10.2 Write unit test for no-correctness-affordance
    - Decision view shows no check/cross, no score, no "correct" label for any option.
    - _Requirements: 4.2_

- [x] 11. Shell: Entry, RunHost, ConsoleFrame
  - [x] 11.1 Implement `Entry` in `src/ui/shell/Entry.tsx`
    - Renders the three modes (Solo, Two tabs, Two devices by sound) with one sentence each and accessible names; resolves the matching `Transport` factory (scripted / loopback / acoustic). Surfaces a plain-text reason and keeps Solo available if a mode cannot start.
    - Persistent `FICTION · DRILL` marker and mute control.
    - _Note (developer, 2026-11-23): brought forward ahead of the waves. Lands beside the prototype, does not replace it; opt-in preview via `?shell` in `main.tsx` until 13.1. The marker reads "Fiction. Practice drill." (sentence case)._
    - _Requirements: 1.1, 1.3_

  - [x] 11.2 Implement `RunHost` in `src/ui/shell/RunHost.tsx`
    - Holds `useReducer(reduce, scenario, initialState)` and the append-only `ConsoleLogEntry[]` log; subscribes to the transport and appends each `received | garbled | collision` outcome as one engine event with no reshaping; exposes `append` and `recordDecision` to children; persists via `serialize` on every append and restores via `restore` on load (fresh run + message on discard).
    - Routes to the active role's console with `eventsForRole(...)`; Solo reaches the first beat within two interactions (Entry choice + role choice); hands the finished log to the Séance (owned by `seance-replay`).
    - _Note (developer, 2026-11-23): a saved run that cannot be used (any `restore` discard reason) is kept, never cleared. RunHost calls `clear()` only from the explicit "Discard the saved run" button, says why in one sentence, and holds the fresh run in memory unsaved until then. A throwing `Storage` continues in memory with one line._
    - _Note (2026-11-23, follow-up): the audio bus closes on final unmount (one bus per page, kept through "Run again"); transports report `ended`/`error` through optional `onStatus` and RunHost says so in one sentence without switching modes; the log gains `send` entries (own sends, and the Solo partner's schedule) matched to outcomes by frame id, so the replay shows time in transit and sends that never arrived (save `version` stays 1). Not reproduced: the kit `ReplayView` "key is not a prop" warning; a no-warning test was added._
    - _Requirements: 1.1, 1.2, 1.3, 6.1_

  - [x] 11.3 Implement `ConsoleFrame` in `src/ui/shell/ConsoleFrame.tsx`
    - Fixed-aspect panel chrome centred on the viewport, works from 360 px wide, wraps either console, mounts the `CrtLayer`, and holds the global mute and reduced-motion switches and the `StatusLine`.
    - _Note (developer, 2026-11-23): follow the design language layout (12-column grid, 8 px baseline, left-aligned, nothing centred unless alone on the screen). Not a centred fixed-aspect panel, and no `CrtLayer` (see 7.1)._
    - _Requirements: 1.3, 5.2_

  - [x]* 11.4 Write unit tests for Entry and RunHost
    - Entry renders three modes each with a one-sentence description and accessible name (Req 1.1); Solo reaches the first beat within two interactions (Req 1.2); `FICTION · DRILL` marker and mute control present across modes and phases (Req 1.3).
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 12. Accessibility pass
  - [x]* 12.1 Write keyboard and focus accessibility tests
    - Every interactive control in each console has an accessible name and is reachable by keyboard with a visible focus indicator.
    - _Requirements: 5.1_

  - [x]* 12.2 Write reduced-motion tests
    - With `prefers-reduced-motion`, printing / waterfall / needle animation loops do not run and the status line carries current state instantly.
    - _Requirements: 5.2_

- [x] 13. Wire the app together and record non-PBT checks
  - [x] 13.1 Mount the Shell as the app entry
    - Wire `Entry → RunHost → ConsoleFrame → (Booth | Tower)` from `src/main.tsx`; ensure a run restores from local storage on reload and all assets are static for offline use.
    - _Note (developer, 2026-11-23): until this task, `main.tsx` carries a temporary `?shell` preview hook that renders `Entry`; this task replaces it by mounting the Shell as the entry._
    - _Note (2026-11-23): `main.tsx` mounts `RunHost` by default; `?prototype` keeps the old UI until skeleton 6.2; `?shell` dropped. No service worker, so a reload with the network off fails: offline after first load is open for 13.2. Evidence in `docs/evidence/consoles-13.1/`._
    - _Requirements: 1.1, 6.1, 6.2_

  - [x]* 13.2 Write offline smoke test and record contrast audit
    - Offline (Req 6.2): load once, disable the network, reload, confirm the app loads and a run restores from local storage.
    - Contrast (Req 5.3): audit each role palette against its backgrounds with the CRT layer composited on; verify WCAG AA and record in `docs/RESULTS.md`.
    - _Note (2026-11-23): offline part done with one scoped service worker per app (developer's choice). `scripts/site/service-worker.mjs` generates `dist/dead-air/sw.js` and `dist/night-desk/sw.js` at assemble time: cache `<app>-<hash of built files>`, precache of the built files, network-first navigation with a 3.5 s timeout, cache-first assets, no `skipWaiting` (a new version takes over once every tab of that app is closed). Each app registers it from `src/register-sw.ts`, production only. The landing page has none. Browser evidence in `docs/evidence/offline-sw/`. Not verified: a real HTTPS host, browsers other than Chromium._
    - _Requirements: 5.3, 6.2_
    - _Note (developer, 2026-11-24): the service worker no longer writes navigation responses to the cache (offline page is always the precached `index.html`) and runtime-caches only precache-listed urls and `voice/`; evidence in `docs/evidence/offline-sw/` (`stale-*`)._

- [x] 14. Final checkpoint — all checks pass
  - Ensure `pnpm typecheck`, `pnpm test`, `pnpm build` all pass; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests and recorded audits) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements for traceability; property tasks also name their design property and carry the `Feature: consoles, Property N` tag.
- The seven correctness properties map to tasks 2.2 (P1), 2.4 (P2), 2.6 (P3), 3.2 (P4), 4.2 (P5), 6.2 (P6), 4.4 (P7); each property test runs ≥ 100 iterations.
- Consoles dispatch engine events and append to the log; they never mutate engine state. Imports stay one-way (`ui -> transport -> modem/channel -> engine`).
- Contrast (Req 5.3) and offline (Req 6.2) are recorded checks, not property tests, consistent with the design Testing Strategy.

## Requirement → task coverage

| Req | Marked | Task(s) | Property |
| --- | --- | --- | --- |
| 1.1 | — | 11.1, 11.2, 13.1 | — |
| 1.2 | — | 11.2 | — |
| 1.3 | — | 11.1, 11.2, 11.3 | — |
| 2.1 | (PBT) | 2.1, 6.3, 7.2, 8.1 | P1 |
| 2.2 | (PBT) | 2.3, 8.1 | P2 |
| 2.3 | (PBT) | 2.5, 8.1 | P3 |
| 3.1 | — | 9.1 | — |
| 3.2 | (PBT) | 3.1, 9.1 | P4 |
| 4.1 | (PBT) | 4.1, 10.1 | P5 |
| 4.2 | — | 10.1, 10.2 | — |
| 5.1 | — | 9.1, 12.1 | — |
| 5.2 | — | 7.1, 7.2, 11.3, 12.2 | — |
| 5.3 | — | 7.1, 13.2 | — |
| 5.4 | (PBT) | 6.1, 6.3 | P6 |
| 6.1 | (PBT) | 4.1, 4.3, 11.2, 13.1 | P7 |
| 6.2 | — | 13.1, 13.2 | — |

All seven properties (P1–P7) have a dedicated property-test sub-task. Pure logic
(tasks 2–4) lands before components (tasks 8–11) so the properties catch errors
before UI wiring.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.5", "3.1", "4.1", "4.3", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "3.2", "4.2", "4.4", "6.2", "6.3", "7.1", "7.2"] },
    { "id": 3, "tasks": ["7.3", "8.1", "9.1", "10.1"] },
    { "id": 4, "tasks": ["8.2", "9.2", "10.2", "11.1", "11.2", "11.3"] },
    { "id": 5, "tasks": ["11.4", "12.1", "12.2", "13.1"] },
    { "id": 6, "tasks": ["13.2"] }
  ]
}
```
