# Implementation Plan: Night Desk

## Overview

Generated from `requirements.md` (approved, unchanged) and `design.md`. Night Desk is a solo attention model built on the Hindsight kit. Everything here lives in `apps/night-desk` (`src/` and `scenarios/`), plus evidence in `docs/`. The kit is not edited. The app imports it only as `hindsight` and `hindsight/replay`.

**Order matters.** Phase A is a vertical slice that is playable end to end as early as possible: a pure attention model, one guided short night, a start screen, the night screen and the kit's minimal replay at the end. Task 1.3 is marked **FIRST PLAYABLE (unblocks skeleton 6.2)**. Everything after it adds nights, depth and polish on top of something a person can already play.

**Baseline.** At the start of task 1.1, run `pnpm test` at the root and record the per-package counts in `docs/RESULTS.md`. The last recorded total is 240 (kit 125, dead-air 73, night-desk 4, tooling 38); use the fresh number as the floor.

**Done means, for every task:** at the repository root `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` all exit 0; the total test count is at or above the previous task's count (a task that deletes a test names it and says why); and the task's own new tests pass. Property tests use `fast-check`, run at least 100 runs, live in `x.prop.test.ts` beside the code, and carry a `// Feature: night-desk, Property N: <text>` comment. UI tests use Testing Library through visible text and roles, never class names, and opt into jsdom with a per-file `// @vitest-environment jsdom` docblock. Mark an item `[x]` only on a confirmed re-run, never on an assertion. The developer commits by hand; no task runs `git add`, `git commit` or `git push`.

**Out of scope (say so rather than assume).**

- Voice generation: no clips, no `public/voice/` files and no `MANIFEST.md` are produced by this plan. Task 5.1 builds only the playback layer, which is inert with no clips.
- IBM Plex font files and their OFL licence are **absent from the repository today**. Task 6.1 adds them; until then the CSS falls back to the system font stack.
- The real replay view (selection, scrubber, counterfactual, discussion prompts, print layout) belongs to `seance-replay`, whose `design.md` is empty today. Night Desk uses the kit's `ReplayView` through its props `{ ledger, scenario }` only.
- A `⌘K` command list is in the design language but not in the Night Desk requirements and is not planned.
- Real-user timing (60 seconds to a first choice, 8 minutes per night) and layout at 1280x720 are **manual checks** recorded in `docs/RESULTS.md`. They are never reported as passed without a person having done them.

## Tasks

- [ ] 1. **Phase A: first playable vertical slice**

  - [x] 1.1 **Attention model, pure, with the replay adapter.** In `apps/night-desk/src/model/` add `types.ts` (`DeskScript`, `ItemDef`, `ActionDef`, `GuideStep`, `NightLog`, `LogEntry`, `NightState`, `Result`) exactly as in the design. Add `attention.ts` (`intervalsFromLog`, `attentionLoss` as a kit `LossSource`: open busy intervals, away drops phone and door, queue to the end of the action, `expiresAfter`, `lapse`, one `prng.nextFloat()` drawn per send before any branch). Add `night.ts` (`foldNight`, `availableActions`, `applyAction`, `endsAt` handling; typed errors for a bad action, `at` mismatch, unmet `requires`, repeated `once`, unknown fact, finished night; a `collision` outcome throws a message naming the item). Add `replay-input.ts` (`toLedger`, `toReplayScenario`) and `clock-format.ts` (minutes after midnight to "11:10 pm"). Add `guide.ts` (`currentStep`). Tests (examples, in `attention.test.ts`, `night.test.ts`, `replay-input.test.ts`, `guide.test.ts`, using a small synthetic `DeskScript` fixture in `model/fixtures.ts`): the worked example from the design (a phone call inside an away action is missed with its time; a chat message in the same interval is queued to the end); an item arriving during a `busy` action is delivered at the action's end; an item past its `expiresAfter` is missed; `at` mismatch is rejected; a repeated `once` action is rejected; the replay scenario gains one `decision` event per entry and `layoutReplay` over it has a row per role; the guide returns one step at a time and `null` when all are done. Imports from the kit only as `hindsight` and `hindsight/replay`. _Req 2.2, 2.3, 2.4, 1.2._

  - [x] 1.2 **The guided first night: brief, scenario file, mechanics file.** Add `scenarios/briefs/guided-first-night.md` (an invented fictional hall, about 20 simulated minutes, three items: a text on the duty phone, a message in the floor chat that arrives while the player is busy, a knock at the door; a noise-style topic; one decision prompt). Add `scenarios/guided-first-night.ts` (exports one kit `Scenario`: roles `ra`, `phone`, `chat`, `door`, `staff`; `simulationNotice`; `message_created` events for the items; a `debrief` event; `decisionPrompts.ra.options` listing every action id). Add `scenarios/desk/guided-first-night.ts` (default-exports the `DeskScript`: `guided: true`, fixed `seed`, `rev: 1`, three items at distinct minutes, an action list with a `callStaff` action that has no `requires`, a `wait` action, one `respond` action per item, a `guide` of two steps: "Read the text and choose what to do" and "Notice the clock moved and the new message that arrived while you were busy"). Add `src/nights.ts` (registry built with `import.meta.glob` over `../scenarios/*.ts` and `../scenarios/desk/*.ts`, joined by id, sorted by `order`; exports `nights` and `findNight(id)`). Add `scenarios/desk/desk.test.ts`: for every desk file, same id as its scenario, every item id is a `message_created` event id, arrival minutes distinct integers below `endsAt`, keys unique and single characters, costs integers of at least 1, a `callStaff` action with no `requires`, and every `requires` and guide reference exists. Existing `scenarios.test.ts` now validates the first real scenario with no edit. Fiction only; none of the out-of-scope topics in `product.md`. If the `scenario-from-brief` hook fires on saving the brief, it writes only the scenario file (the brief grammar cannot carry the mechanics); say in `docs/RESULTS.md` whether the hook ran. _Req 5.1, 5.2, 1.2, 2.4._

  - [-] 1.3 **FIRST PLAYABLE (unblocks skeleton 6.2): start screen, night screen, end of night with the kit's replay.** Add dev dependencies to `apps/night-desk` that Dead Air already uses (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`; no new runtime dependency), `src/test-setup.ts`, and `setupFiles` in `vite.config.ts` (default environment stays `node`; UI tests opt into jsdom per file). Replace the placeholder `main.tsx` with `App.tsx` as a state machine `start -> night -> document`. `screens/Start.tsx`: one sentence saying who it is for, one line saying it is practice with invented scenarios, one button with initial focus, no sign-up (Req 1.1). `screens/Night.tsx`: the clock, the items that have reached the player (source, time, text), the guided instruction shown one at a time with a thin progress line, and the actions with a visible key hint each, plus the `callStaff` action always present; pressing an action's key or clicking it calls `applyAction`; focus is visible (Req 2.1, 1.2, 6.1). `screens/Document.tsx` (minimal for now): a heading, the kit's `ReplayView` from `hindsight/replay` fed by `toLedger` and `toReplayScenario`, shown at once when the night ends with no extra click (Req 4.1). `src/styles.css`: paper and ink tokens from `design-language.md`, system font stack naming IBM Plex first, 2 px ink focus outline, two-column layout sized to the viewport; no gradient, shadow or animation. Test `App.flow.test.tsx` (jsdom, visible text and roles only, no class names): the start screen shows the sentence, the practice line and exactly one button; pressing Start shows the clock and the first item; the first guide instruction is shown and disappears after its action; a second item that arrived while the player was busy appears after the action with its arrival time; every action is reachable by its key and shows its hint; the staff call is on screen; taking actions until the night ends renders the replay (a list labelled "Replay: ..." with a row for the player) without any extra click. **Exit criteria, all required:** (a) a person can open `/night-desk/` (checked by `pnpm build` then `pnpm --filter night-desk exec vite preview`, run by the developer, not by this task), press Start, make a choice, finish the night and see the replay; (b) the flow test above passes in jsdom; (c) `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` exit 0 at the root; (d) `docs/RESULTS.md` records the new counts and states that the manual 60-second check has **not** been run yet. When the exit criteria hold, skeleton task 6.2 may start. _Req 1.1, 1.2, 1.3 (choice available at first render), 2.1, 4.1, 5.1, 6.1._

  - _Checkpoint: the guided night is playable from start to replay. Ensure all tests pass, ask the user if questions arise._

- [x] 2. **Phase B: mechanics on screen and the other three nights**

  - [x] 2.1 **Missed and queued items, and the staff call, on the night screen.** In `Night.tsx` show each missed item as a line "Missed call at 11:19" (door: "Someone knocked at 11:42"; expired message: "A message went unseen") using the colour accent only on that line, with time and no content, and show for each delivered item that waited the time it was sent and the time it reached the player. For an item marked `needsProfessional`, add the one plain line "The staff member on call is a phone call away." beside it. Add an away action (go to a room, cost 6, `attention: "away"`) and a late phone item to the guided night's script only if the guided scenario stays under about 3 minutes of play; otherwise keep the guided night unchanged and cover the away path with the synthetic fixture. Tests: `Night.test.tsx` (jsdom) with the fixture: an away action makes a phone item appear as "Missed call at ..." with no body text; a queued item shows both times; the staff action is present before and after any action. `availableActions.prop.test.ts` — **Property 4**: for any reachable state of every shipped night and the fixture, a `callStaff` action is available and the fold never inserts a call. _Req 2.3, 2.4._

  - [x] 2.2 **Content lint over briefs and scenario text.** Add `scenarios/desk/content.test.ts`: reads every brief (`import.meta.glob` with `?raw`) and every scenario's text fields, and fails on out-of-scope vocabulary (self-harm, sexual misconduct, medical emergency, weapons; a plain word list kept in `scenarios/desk/banned-words.ts` with a comment that it is a heuristic) and on obvious real-institution markers (".edu", "university of", "college of", real city and country names kept as a short list). Test the lint itself with a fixture string that must fail and a clean one that must pass. State in `docs/RESULTS.md` that a human read of each night is still required. _Req 5.2._

  - [x] 2.3 **Night 2: a noise night (about 6 minutes).** Brief `scenarios/briefs/loud-music-harlow-3.md` (start from the existing `example-noise-complaint.md` content and keep it parseable by `parseBrief`), scenario `scenarios/loud-music-harlow-3.ts`, mechanics `scenarios/desk/loud-music-harlow-3.ts` (six to eight items across phone, door, chat and a handoff note; an away action to go to the room; a busy action to text; one `needsProfessional` item; the staff call; `endsAt` giving about six minutes of play for a first-time reader; `tags` such as `noise`). Existing `scenarios.test.ts`, `desk.test.ts` and `content.test.ts` cover it with no edit. Add one example test that plays a scripted path through the night with `applyAction` and asserts the replay has a decision per action and at least one missed or queued item. Record the simulated length and item count in `docs/RESULTS.md`; the real-time length is not claimed. _Req 5.1, 5.2, 2.2._

  - [x] 2.4 **Night 3: a lockout and a roommate disagreement (about 6 minutes).** Same four files as 2.3 (`lockout-marsh-2`), tags `lockout`, `roommate`, `guest-rules`. Fiction only: a student locked out, two roommates and a quiet-hours disagreement, a handoff note that mentions a spare-key rule that is invented in the scenario text. No real policy named. At least one `needsProfessional` item. Add the same scripted-path example test. _Req 5.1, 5.2, 2.2._

  - [x] 2.5 **Night 4: a leak and an ambiguous alarm (about 6 minutes).** Same four files (`leak-ferris-1`), tags `leak`, `alarm`. A water leak noticed on a corridor and a short alarm sound that may or may not be real, with a `needsProfessional` item for the leak. Nothing in the scenario depicts injury, medical situations or weapons. Add the same scripted-path example test, and assert in `nights.test.ts` that there are four nights, the first is `guided`, and the other three each have between 6 and 10 items (a proxy for "about six minutes"; the real length is a manual check). _Req 5.1, 5.2, 2.2._

  - _Checkpoint: four nights exist and pass the kit's validation and Night Desk's own checks. Ensure all tests pass, ask the user if questions arise._

- [x] 3. **Phase C: log entries, habits, and the replay as a document**

  - [x] 3.1 **Write a log entry.** Add a `log` action kind to each script (cost 2, `attention: "busy"`). In `Night.tsx` the log action opens an inline list of the facts the player knows (the items delivered so far, by title) as checkboxes with keys; confirming records `{ at, actionId, facts }` through `applyAction`; unknown facts are rejected by the model. Add one guide step to the guided night ("Write down what you know") and keep it under the same length. Tests: `Night.log.test.tsx` (jsdom): choosing two facts records an entry with the clock shown, a fact that has not arrived is not offered; `log-entry.prop.test.ts` — **Property 5** over reachable states and subsets. _Req 2.5._

  - [x] 3.2 **Habits, as plain figures.** Add `model/habits.ts` per the design: acknowledgement (mean, longest, not acknowledged), written versus known, and time from the first needs-a-professional moment to the call (or "No call was made", or "no such moment"). Add the fixed one-line "why it matters" text beside each figure in one table in the same file. No score, no total, no colour. Tests: `habits.test.ts` (examples: a log with a call at minute N gives N minutes; a log with no call and a marked moment gives `minutes: null`; a night with no marked moment gives `moments: 0`); `habits.prop.test.ts` — **Property 8**. _Req 4.3._

  - [x] 3.3 **Replay narration.** Add `model/narrate.ts` per the design: one-paragraph plain summary and one sentence per decision, using `knownAt` and `inTransitAt` from the kit to say what had reached the player and what was still on its way or missed at that minute. Facts only, no judgement words. Tests: `narrate.test.ts` (examples with the fixture: a decision before a queued item arrives says it was still on its way; a missed call is named as missed with its time); `narrate.prop.test.ts` — **Property 9**. _Req 4.2._

  - [x] 3.4 **The replay page as a document.** Rewrite `screens/Document.tsx` as a document: heading, the summary paragraph, the kit's `ReplayView` (props only; when `seance-replay` replaces the view, only this file changes), an ordered list with one sentence per decision, then the three habits as a definition list with one line each, then the actions "Play it again", "Choose another night" and "Copy link" (wired in 4.2 and 4.3; here the buttons exist and are disabled with a visible reason only if their task is not yet merged; remove that state when they are). Headings use real heading levels. Tests: `Document.test.tsx` (jsdom): the summary, one sentence per decision, three habit figures and their lines are on screen, there is no word "score", and the replay list is labelled. _Req 4.1, 4.2, 4.3._

  - _Checkpoint: a finished night reads as a document. Ensure all tests pass, ask the user if questions arise._

- [x] 4. **Phase D: persistence, sharing, and navigation**

  - [x] 4.1 **Log codec and reload restore.** Add `model/codec.ts` (`encodeLog`, `decodeLog`: base64url of UTF-8 JSON, shape-checked, over 8 KB rejected, never throws) and `model/storage.ts` (`loadSaved`, `save`, `clear`, `markCompleted`, `completed`; every call catches `Storage` errors). In `App.tsx`, save the log after every action; on load restore a saved night in progress to the night screen and a finished one to the document, after checking `scenarioId`, `rev` and a successful `foldNight`; otherwise clear it and show the start screen. Tests: `codec.test.ts` (example tokens; truncated, non-base64, wrong version, wrong shape each return an error); `storage.test.ts` (a throwing fake `Storage` does not break `save`); `App.reload.test.tsx` (jsdom): play two actions, unmount, mount again, same clock and same items; `codec.prop.test.ts` — **Property 7** (round trip and restore through a fake `Storage`). _Req 6.3, 4.4._

    _Developer override, 2026-11-23: "otherwise clear it and show the start screen" is replaced by the saved-run rule already used in Dead Air. An unreadable, unsupported, other-`rev` or non-folding save is kept untouched and `clear()` is never called automatically; one sentence names the reason, then the start screen shows; the new night stays in memory and is not saved while that save exists; the only caller of `clear()` is a "Discard the saved night" button; a throwing `Storage` means the night continues in memory with one line saying so._

  - [x] 4.2 **Share link.** In `Document.tsx`, "Copy link" builds `<origin><base>#r=<token>` with `encodeLog` and copies it with `navigator.clipboard` when present; otherwise it shows the link in a read-only field the person can select. On load, a valid `#r=` token opens the document directly (precedence over storage; it does not overwrite the visitor's own saved night). A bad token, unknown night or old `rev` shows one plain sentence and the start screen. Tests: `App.share.test.tsx` (jsdom): finish a night, read the link text, mount a fresh `App` with that fragment and a different empty storage, and assert the same replay sentences appear; each bad-link case shows its sentence; the app makes no `fetch` call in either direction (spy on `globalThis.fetch`). _Req 4.4._

  - [x] 4.3 **Play it again, choose another night, and the picker.** "Play it again" clears the saved log for that night and starts it again at once; "Choose another night" opens `screens/Picker.tsx` listing the nights by title, tags and simulated length, each a button. `Start` opens the guided night until it is in `completed`, and the picker afterwards (assumption 4 in the design). Tests: `Picker.test.tsx` (jsdom): four nights are listed, choosing one starts it, there is no search field with four nights; `App.nav.test.tsx`: finishing the guided night marks it completed, and the next Start opens the picker. _Req 4.4, 1.2._

  - [x] 4.4 **Picker search above seven nights.** Add `model/picker.ts` (`filterNights(nights, query)` by title and tags, case-insensitive, trimmed, order preserved). `Picker.tsx` shows one search field and plain text filters (one per tag) only when the list has more than seven nights, and filters as the player types. Tests: `picker.test.ts` (examples); `picker.prop.test.ts` — **Property 10**; `Picker.search.test.tsx` (jsdom): with eight synthetic nights passed as a prop, typing narrows the list on each keystroke and clearing restores it; with seven, no field appears. _Req 5.3._

  - _Checkpoint: close the tab mid-night and reopen it; share a replay by link. Ensure all tests pass, ask the user if questions arise._

- [x] 5. **Phase E: sound (optional layer)**

  - [x] 5.1 **Voice playback, gated and optional.** Add `voice/voice.ts` (`createVoice(factory)`; plays an item's clip only after the first `pointerdown` or `keydown`, only when sound is on; swallows load and play errors). Add the always-visible sound control to the night screen (a text button "Sound on" and "Sound off"; on, it does nothing until a clip exists). When an item has `voice`, the transcript is already its text on screen; show it next to the clip, never instead of it. No clip, no `public/voice/` file and no `MANIFEST.md` is added by this task (voice generation is out of scope here). Tests (`voice.test.ts` and `Night.sound.test.tsx`, with a fake audio factory and a fixture item that has a `voice` field): nothing plays on render; nothing plays on the first gesture if sound is off; with sound on, the first gesture plus a delivered item with a clip calls play once and the transcript is visible; the whole first-night flow test still passes with zero clips. _Req 3.1, 3.2._

- [x] 6. **Phase F: design-language pass**

  - [x] 6.1 **Self-host IBM Plex and its licence.** Add the IBM Plex Sans (regular, medium) and IBM Plex Mono (regular) `woff2` files under `apps/night-desk/public/fonts/` with the SIL Open Font License text as `OFL.txt` beside them and a `README.md` there naming the source URL, version and date fetched. Fetch only from the official IBM Plex release, and record the checksums. Add `@font-face` rules with `font-display: swap` in `styles.css` and drop the system-first stack. Test `fonts.test.ts` (node): the three files and `OFL.txt` exist, each `@font-face` URL in `styles.css` points to a file that exists, and the total font bytes are under 200 KB. If the agent has no network access, stop and ask the developer to place the files; do not generate substitutes. Note in `docs/RESULTS.md` that the fonts were absent before this task. _Supports Req 2.1 (type) and the tech steering; no requirement text depends on it._
    - _Note 2026-11-23: developer decision: fonts downloaded from the official IBM Plex GitHub release into Night Desk only. Dead Air's own font files have no recorded source; that gap is open and they were left untouched._

  - [x] 6.2 **Tokens, dark appearance, reduced motion, focus, contrast.** Move colours, sizes (13, 15, 18, 24, 40, 72), radius (2 px controls, 0 surfaces) and spacing (8 px baseline) into CSS custom properties in `styles.css`; add the dark appearance (`#141311` with paper text) via `prefers-color-scheme`; set every `transition` and `animation` to `none` under `prefers-reduced-motion: reduce`; keep the 2 px ink focus outline. Remove anything that fails the three tests in `design-language.md`. Tests: `contrast.test.ts` (node): a small WCAG contrast function; every declared text and background pair in both appearances is at least 4.5:1 (body) or 3:1 (large and non-text), with the grey `#A9A59B` allowed only for non-text hairlines (the test fails if it is used for text); `styles.test.ts`: the stylesheet contains the reduced-motion block and no `gradient`, `box-shadow` deeper than one hairline, or `backdrop-filter`. Reduced motion in a real browser is a manual check. _Req 6.2, 6.1 (visible focus)._

  - [x] 6.3 **Keyboard and 1280x720 sweep.** Add `App.keyboard.test.tsx` (jsdom): play a whole night with the keyboard only (Tab, Enter and the action keys) and finish on the document; every action on the night screen shows its key. Then run the manual checks and record them in `docs/RESULTS.md` with the date, browser and what was seen: the start, night and document screens at 1280x720 with no scrolling (a Playwright screenshot may be saved under `docs/evidence/` if available; otherwise a hand note), focus visible on every control, reduced motion on and off, both appearances. Fix any overflow found in `styles.css` and re-run. Mark a manual line "not run" until it has been. _Req 2.1, 6.1, 6.2._

  - _Checkpoint: the interface is complete and meets the design language. Ensure all tests pass, ask the user if questions arise._

- [x] 7. **Phase G: properties and close-out**

  - [x] 7.1 **Property tests for the attention model (Req 2.2, 2.3).** Add `model/night.prop.test.ts`. A generator builds a valid action sequence for a script by repeatedly choosing among `availableActions`, over every shipped night and the synthetic fixture script that has every mechanic. **Property 1** (time never goes backwards; each `at` equals the clock before it; a log with a wrong `at` is rejected), **Property 2** (an item is delivered at most once; delivered no earlier than sent; queued items delivered at the action's end; expired items never delivered; every item that has arrived is in exactly one of delivered or missed), **Property 3** (no phone or door item inside an away interval is delivered; each is missed with its time; no missed item contains its body text). Any counterexample found is fixed in the model and pasted into an example test. _Req 2.2, 2.3._

  - [x] 7.2 **Property test for determinism (Req 5.4).** Add `model/determinism.prop.test.ts`: **Property 6**. For any generated sequence of choices, two folds of the same log, and a log rebuilt through `applyAction` calls, give equal `NightState`, equal `toLedger` result and equal `layoutReplay` output. Also assert that two different seeds on the synthetic script with a `lapse` item can give different missed sets (an example, to show the seed is used). _Req 5.4._

  - [x] 7.3 **Evidence and final check.** Run `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` at the root and paste the real results into `docs/RESULTS.md`: test counts per phase, the boundary output, and the `dist/night-desk` file list. Add a `docs/KIRO-USAGE.md` entry for what actually ran (this spec, any hook run, any session); claim nothing unrun. Record in `docs/RESULTS.md` the manual checks and their status, one line each: first choice within 60 seconds (Req 1.3), a night within 8 real minutes (Req 2.6, per night), no scrolling at 1280x720 (Req 2.1), keyboard-only completion (Req 6.1), reduced motion (Req 6.2), AA contrast (both appearances), a screen-reader pass of the document page, and the human read of each night's text (Req 5.2). A line that has not been done says "not run". Confirm `.kiro/` is not in `.gitignore`. _Req 1.3, 2.1, 2.6, 5.2, 6.1, 6.2._

## Requirement to task coverage

| Req | Statement (short) | Task(s) | Property / how verified |
|---|---|---|---|
| 1.1 | Start screen: one sentence, practice line, one button | 1.3 | example (jsdom) |
| 1.2 | Guided first run, one instruction at a time | 1.1, 1.2, 1.3, 3.1, 4.3 | example (guide and flow tests) |
| 1.3 | First meaningful choice within 60 s | 1.3 (a choice exists at first render), 7.3 | manual, recorded in `RESULTS.md` |
| 2.1 | Time, items, actions on one screen at 1280x720 | 1.3, 6.3 | example for content; layout is manual |
| 2.2 | Action advances time; deliver, queue, expire | 1.1, 2.3 to 2.5, 7.1 | Property 1, Property 2 |
| 2.3 | Away blocks phone and door; missed call shows time, not content | 1.1, 2.1, 7.1 | Property 3 |
| 2.4 | Staff call always offered at professional moments | 1.1, 1.2, 2.1 | Property 4 |
| 2.5 | Log entry chooses known facts, records with time | 3.1 | Property 5 |
| 2.6 | A night ends within 8 real minutes | 2.3 to 2.5, 7.3 | manual, per night, recorded |
| 3.1 | Voice clip plays with full transcript | 5.1 | example (fake audio) |
| 3.2 | Fully playable muted; nothing plays before a gesture | 1.3, 5.1 | example |
| 4.1 | Night end opens the replay without asking | 1.3, 3.4 | example (flow test) |
| 4.2 | Replay as a document | 3.3, 3.4 | Property 9 plus example |
| 4.3 | Three habits as plain figures, no score | 3.2, 3.4 | Property 8 plus example |
| 4.4 | Play again, choose another night, link with no server | 4.1, 4.2, 4.3 | Property 7 plus examples |
| 5.1 | At least four nights: guided and three of about six minutes | 1.2, 2.3, 2.4, 2.5 | example (`nights.test.ts`, `scenarios.test.ts`) |
| 5.2 | Invented, no real institution, no out-of-scope topics | 1.2, 2.2 to 2.5, 7.3 | heuristic lint plus human read (manual) |
| 5.3 | Picker search above seven nights | 4.3, 4.4 | Property 10 plus example |
| 5.4 | Same scenario and choices give same replay | 7.2 | Property 6 |
| 6.1 | Every action by keyboard, key hint, visible focus | 1.3, 6.2, 6.3 | example; focus visibility is manual |
| 6.2 | Reduced motion changes state instantly | 6.2, 6.3 | stylesheet example; browser check is manual |
| 6.3 | Reload mid-night restores from the log | 4.1 | Property 7 plus example |

## Notes

- Tasks here are all required. None is marked optional, because each pairs its code with the test that proves it.
- **Skeleton coupling.** Skeleton task 6.2 (retire the Dead Air prototype UI) starts only after task 1.3 here is done and its exit criteria hold. This plan does not touch Dead Air.
- **Parallel work and shared files.** Tasks 2.3 to 2.5 each add new files only (the registry in `src/nights.ts` globs the folders), so they do not conflict. Tasks 1.3, 2.1, 3.1, 3.4, 4.1, 4.2, 4.3, 5.1 and 6.x all edit `Night.tsx`, `Document.tsx`, `App.tsx` or `styles.css` and must run one at a time.
- **Properties by task.** Property 4 in 2.1, Property 5 in 3.1, Property 8 in 3.2, Property 9 in 3.3, Property 7 in 4.1, Property 10 in 4.4, Properties 1 to 3 in 7.1, Property 6 in 7.2.
- **Brief grammar limit.** Briefs cannot carry mechanics. The hook can write a scenario file from a brief; the `scenarios/desk/` file is always hand-written and checked by `desk.test.ts`.
- **Collisions.** The kit treats any two sends in the same minute as a collision, so every night keeps distinct arrival minutes; `desk.test.ts` enforces it.
- Each phase ends with a checkpoint: all tests pass; ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "3.2", "3.3"] },
    { "id": 5, "tasks": ["2.3", "2.4", "2.5"] },
    { "id": 6, "tasks": ["3.1"] },
    { "id": 7, "tasks": ["3.4"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["4.2"] },
    { "id": 10, "tasks": ["4.3"] },
    { "id": 11, "tasks": ["4.4"] },
    { "id": 12, "tasks": ["5.1"] },
    { "id": 13, "tasks": ["6.1"] },
    { "id": 14, "tasks": ["6.2"] },
    { "id": 15, "tasks": ["6.3"] },
    { "id": 16, "tasks": ["7.1", "7.2"] },
    { "id": 17, "tasks": ["7.3"] }
  ]
}
```
