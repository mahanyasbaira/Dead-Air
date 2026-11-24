# Implementation Plan: seance-replay (the replay)

## Overview

Generated from `requirements.md` (approved, unchanged) and `design.md`. The work is in the kit (`packages/hindsight/src/ledger/` and `src/replay/`) plus small adapter changes in `apps/dead-air` and `apps/night-desk`. Apps import the kit only as `hindsight` and `hindsight/replay`. `layoutReplay` stays exported.

**Order matters.** Phase A makes in-transit, lost and arrivals-only messages visible, with the pure layout and its properties, the view, and both callers wired. Phase B adds selection and the scrubber (Req 2.2, 2.3). Phase C adds the counterfactual (Req 3). Phase D adds facilitation and sharing (Req 4). Phase E adds habits (Req 5). Phase F is the print, keyboard and evidence pass. Every phase ends with the apps still building and the replay still working.

**Baseline.** At the start of task 1.1, run `pnpm test` at the root and record the per-package counts in `docs/RESULTS.md`. The last recorded counts are hindsight 126, night-desk 68, dead-air 425, tooling 57; use the fresh numbers as the floor.

**Done means, for every task:** at the repository root `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` all exit 0; the total test count is at or above the previous task's count (a task that deletes or replaces a test names it and says why); and the task's own new tests pass. Property tests use `fast-check`, run at least 100 runs, live in `x.prop.test.ts` beside the code, and carry a `// Feature: seance-replay, Property N: <title>` comment. UI tests use Testing Library through visible text and roles, never class names, drive input with `fireEvent` (no `user-event` is added to the kit), and opt into jsdom with a `// @vitest-environment jsdom` docblock. There are no image snapshots; tests check the layout geometry. Tests sit beside the code. Mark an item `[x]` only on a confirmed re-run, never on an assertion. The developer commits by hand; no task runs `git add`, `git commit`, `git push`, `git reset` or `git stash`.

**Optional tasks.** Following the other specs, property-test sub-tasks carry `*` and may be skipped for a faster first version. Example tests are part of the task that writes the code and are not optional. Properties 5, 6 and 7 (span equals delay, nothing invented, in-transit clipping) are what make the diagram truthful; skip them only knowingly.

**Ownership, to avoid duplicate work.**

- **night-desk 3.2 (its three habits) and 3.3 (its narration) stay in night-desk.** This spec does not build them. Night Desk turns the kit's habits and summary sections off.
- **night-desk 3.4 (its document page) does not build selection, a scrubber or a counterfactual.** It uses the kit's view. Its per-decision sentences stay its own; the kit's text timeline is collapsed and the kit's moment sentence appears only after a decision is selected.
- **night-desk 4.1 and 4.2 (the `NightLog` codec, reload restore, share link) stay in night-desk.** They also serve "Play it again" and reload.
- **The replay token codec (Req 4.1) is the kit's** (task 4.2). Dead Air has no log codec and uses it (task 4.5).

**Out of scope (said plainly).**

- A read-back control in the Dead Air consoles. Until one exists, read-back shows "Not recorded".
- Recovering what the log does not hold: messages lost on the way from an arrivals-only participant are never drawn, counted or restored.
- A server, accounts, a short-link service. The link is a URL fragment.
- Changing `requirements.md`. The "caused" wording in Req 5.1 is handled in the design and flagged to the developer.
- Printing in black and white, 1280x720 as a still image, a screen-reader pass, reduced motion in a real browser and both appearances are **manual checks**. They are recorded in `docs/RESULTS.md` and say "not run" until a person has done them.

## Tasks

- [x] 1. **Phase A: make in-transit, lost and arrivals-only messages visible**

  - [x] 1.1 **Ledger: arrivals, send sizes, lost messages, closed fates.** In `packages/hindsight/src/ledger/ledger.ts` add the `arrival` and `readback` event kinds and optional `bytes` and `airtime` on `sent`, per the design. `knownAt` also adds the id of a `received` arrival to its recipient. Add `lostAt(l, p, t)` and `closedFates(l)`. `buildLedger` sorts and keys the new kinds (kind order: sent, learned, outcome and arrival, readback). In `from-channel.ts`, `ledgerFromChannel` accepts optional `bytes` and `airtime` on a send and turns an outcome whose id has no send into an `arrival` using the entry's `sender` and `recipient`; entries with no id are still skipped; `orphanOutcomes` still counts bare `outcome` events. Export `lostAt`, `closedFates` and the new types from `src/index.ts` and update the pinned list in `replay/core-headless.test.ts`. Add `ledger/arbitraries.ts` (test-only generators: every event kind, small id pool, delays 0 to 40, drops, repeats, shuffled order). Example tests in `ledger/arrival.test.ts`: an arrival is known from its time and has no send; a garbled arrival is lost and not known; a dropped send is in transit until the record closes and `closedFates` says never-arrived; a send with bytes and airtime survives `buildLedger`; `ledgerFromChannel` makes an arrival for an unmatched id. All existing ledger tests pass unchanged. _Req 1.1, 1.3._

  - [x]* 1.2 **Write property test for the known set.**
    - **Property 1: The known set is exactly what was delivered intact or observed**
    - `ledger/known-set.prop.test.ts`, at least 100 runs, uses `ledger/arbitraries.ts`.
    - **Validates: Requirements 1.1**

  - [x]* 1.3 **Write property test for growth of the known set.**
    - **Property 2: Known sets only grow**
    - `ledger/known-grows.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 1.2**

  - [x]* 1.4 **Write property test for lost messages.**
    - **Property 3: Lost messages are excluded and listed, and every message is in exactly one group**
    - `ledger/lost.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 1.3**

  - [x] 1.5 **Pure layout: participants, provenance, signals, arrivals, in-transit clipping.** In `packages/hindsight/src/replay/` add `types.ts` (`ReplayParticipant`, `HistoryKnowledge`, `WorldlineInput`, `LayoutOptions`, `WorldlineLayout`, `Signal`, `ArrivalMark`, `KnowledgeMark`, `DecisionNode`, `KnowledgeLimit`, `LegendKey`, `Fate`, `Tone`, `VIEW`), `participants.ts` (defaults from `scenario.roles` and ledger senders, role styles by index, source style, the two generic limit sentences and `formatLimit(labels)`; no word on the boundary list), `declutter.ts` (pure label spreading), and `worldlines.ts` (`layoutWorldlines`, `timeToY`). Behaviour exactly as in the design: x by order, y linear in time, received signals end on the receiver's line with span equal to the scaled delay, garbled and collided lines stop `VIEW.gap` short with the delay span kept, never-arrived lines are a fixed stub with `spanIsDelay: false` and appear only when the record is closed (`at` null or at or past the end), `at` cuts in-transit signals at `y(at)`, signals sent after `at` are `faded`, arrivals become ticks, a `sent` from an arrivals-only sender is ignored and a limit is returned once for the arrivals-only participants that have arrivals, a bad log goes into `skipped`. `focus` is accepted and ignored until task 2.1. Add `replay/arbitraries.ts` (participants mixing `complete` and `arrivals-only`, cursors, focus). Export `layoutWorldlines`, `timeToY`, `formatLimit` and the types from `replay/index.ts`; update the pinned list in `replay/entries.test.ts`. Example tests in `replay/worldlines.test.ts` (no React): a delivered message with delay 5 has span 5 times the scale; a collided message ends short of the receiver and is dotted; a dropped message is a stub only when closed and in transit before; at a cursor inside a delay the line is cut at the cursor; an arrivals-only partner gives ticks, no diagonal and one limit with the label in both sentences; a `sent` from an arrivals-only sender is ignored; one role plus four sources gives five lines with the sources in the source style; two roles differ by weight and dash and share one colour; the legend lists only the styles present; an empty ledger gives an empty layout; a log with an outcome before its send puts the id in `skipped`. The existing `layoutReplay` tests pass unchanged. _Req 2.1, 2.4, 6.1, 6.2._

  - [x]* 1.6 **Write property test for layout determinism.**
    - **Property 4: The layout is deterministic**
    - `replay/layout-deterministic.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 2.4**

  - [x]* 1.7 **Write property test for signal geometry.**
    - **Property 5: A signal's vertical span is its delay, and a lost line never reaches the receiver**
    - `replay/signal-geometry.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 2.1**

  - [x]* 1.8 **Write property test for provenance.**
    - **Property 6: Nothing is drawn that the log cannot know**
    - `replay/provenance.prop.test.ts`, at least 100 runs. The generator includes `sent` events from arrivals-only senders.
    - **Validates: Requirements 2.1, 6.1**

  - [x]* 1.9 **Write property test for in-transit clipping.**
    - **Property 7: A message in transit ends at the selected moment**
    - `replay/in-transit.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 2.2, 2.3**

  - [x]* 1.10 **Write property test for decision labels.**
    - **Property 14: Decision labels do not overlap**
    - `replay/declutter.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 2.1**

  - [x] 1.11 **Ordered text timeline (pure).** Add `replay/timeline.ts`: `timelineText(layout, names, formatTime)` returns one `TimelineEntry` per decision, signal, arrival mark and fact mark, ordered by time, each naming its fate ("sent at 11:10, arrived 11:14", "sent at 11:10, did not arrive", "arrived at 11:19, send time not known"). Wording is kit-generic and free of boundary words and of judgement words. Export it from `replay/index.ts` and update `entries.test.ts`. Example tests in `replay/timeline.test.ts`: the three arrival styles each read correctly; ties keep a stable order; a cursor changes in-transit entries to "on its way". _Req 4.3._

  - [x]* 1.12 **Write property test for the text timeline.**
    - **Property 12: The text timeline says what the diagram shows**
    - `replay/timeline.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 4.3**

  - [x] 1.13 **Rebuild `ReplayView` on the layout.** Rewrite `replay/ReplayView.tsx` to draw `layoutWorldlines` output in an SVG (viewBox 840 x 560, `width: 100%`): worldline labels at the top in each role's weight, mono time labels down the left, signals, ticks, fact circles, decision squares with labels. All text is `<text>` and selectable. Colours come from CSS custom properties with the light values as fallbacks (`--ink`, `--paper`, `--loss`, three greys); lost items are dotted and in `var(--loss, #9A3B26)`. An inline `<style>` holds a print block (one page, loss black and dotted, faded mid grey) and a 120 ms opacity transition that is removed under `prefers-reduced-motion: reduce`; it holds no `animation`, gradient, shadow or filter. Under the SVG, a `<figcaption>` carries the key (only styles present) and the limit notice, once. Below, a closed `<details>` "Text timeline" holds the `<ol>` from 1.11. New optional props: `participants`, `names`, `formatTime`, `at`. Keep what the existing kit test pins: the SVG is a `role="list"` labelled "Replay: {title}" with one `role="listitem"` per participant, `tabindex="0"`, labelled "{label}: {n} marks". Update `ReplayView.test.tsx` only where the label count now follows the new marks, and say so in `docs/RESULTS.md`. New `ReplayView.signals.test.tsx` (jsdom, text and roles only): a lost message shows the "did not arrive" entry in the text timeline (the dotted loss line itself is asserted on the `layoutWorldlines` output in `worldlines.test.ts`, not on the DOM); an arrivals-only participant shows the notice exactly once, with the caller's `limitNote` after it; with all participants complete the notice is absent; the figure contains `<text>` elements; the inline style has the print block, has no `animation`, `gradient`, `box-shadow` or `filter`, and the reduced-motion rule. `ReplayView.warnings.test.tsx` still passes. _Req 2.1, 4.3, 6.2, 6.3._

  - [x] 1.14 **Dead Air adapter: stop inventing sends, declare the limit.** In `apps/dead-air/src/ui/shell/replay-input.ts`: `toLedger` no longer gives an unmatched outcome a send at its arrival time or a made-up send id; an outcome matched to a send (same id, not earlier) behaves as today; any other outcome becomes an `arrival` with its own sender, recipient and the id form used today; sends pass `bytes` to `ledgerFromChannel`. Add `toParticipants(scenario, log, { mode, localRole })`: the local role is `complete`; the other role is `complete` only in `solo`, and only if the log has a `send` entry from it or no arrival from it; in `loopback` and `acoustic`, and for runs saved before `send` entries, it is `arrivals-only` with the app-owned `limitNote` "Their sends happen elsewhere and are not recorded here." Update the header comment of the file to match. `RunEnd.tsx` takes `mode` and `localRole` (RunHost already holds both) and passes `participants` to `ReplayView`. Replace, and name in `docs/RESULTS.md`, any test that asserts a fabricated send for an unmatched outcome; keep `replay-input.prop.test.ts` passing. New tests: a Two tabs run shows an arrivals-only partner with ticks and the notice once; a Solo run shows complete lines with diagonals; an old save (outcomes only) shows ticks, no diagonals; a dropped Solo partner message shows a never-arrived line. `RunEnd` tests (jsdom) check the visible notice sentence. _Req 2.1, 6.1._

  - [x] 1.15 **Night Desk adapter: one player, sources as lines.** In `apps/night-desk/src/model/replay-input.ts` add `toParticipants(scenario)`: `ra` is the one role and is listed first; `phone`, `chat`, `door` and `staff` are `source`, all `complete`. `screens/Document.tsx` passes `participants` and its existing clock format as `formatTime`. Night Desk's own `toLedger`, `toReplayScenario` and tests keep working unchanged. Add a test beside `replay-input.test.ts`: the guided night's replay has five lines, a missed item is a never-arrived line and a delivered item is a signal with its delay, and no notice appears. The existing flow test (a list labelled "Replay: ..." with a row for the player) passes unchanged. _Req 2.1, 6.2._

  - _Checkpoint A: a lost, in-transit and arrivals-only message is visible in both apps, and the notice appears only where it is true. Ensure all tests pass, ask the user if questions arise._

- [x] 2. **Phase B: selection and the scrubber**

  - [x] 2.1 **Moment sentences and the focus tone (pure).** Add `replay/moment.ts`: `missingAt(l, f, t)` returning `{ inTransit, lost, elsewhere }` sorted and without duplicates (`inTransit` from `inTransitAt`, `lost` from `lostAt`, `elsewhere` the facts known to another participant and not to `f`, leaving out `f`'s own sends), and `momentSentences(input, f, t, formatTime)`. Sentences are plain facts; for a counterpart that is arrivals-only no "not yet arrived" list is produced for its sends. In `worldlines.ts` implement `focus`: tone `ink` for what `f` knew at `t` (including its own sends), `loss` only for fates settled by `t`, `faded` for the rest. Export `missingAt` and `momentSentences`; update `entries.test.ts`. Example tests in `replay/moment.test.ts`: a message still on its way is listed as not yet arrived; a collided one as lost; a fact known to the other role as known elsewhere; no template contains should, ought, better, mistake, wrong or correct. _Req 2.2, 2.3, 3.2._

  - [x]* 2.2 **Write property test for the missing list.**
    - **Property 9: What was missing is the complement of what was known**
    - `replay/moment.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 2.2**

  - [x]* 2.3 **Write property test for the focus tone.**
    - **Property 8: What is drawn in ink is what the role knew**
    - `replay/tone.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.4 **Selection, scrubber and sentence panel in the view.** In `ReplayView.tsx` hold `at` and `focus` in state (`at` prop is the initial value). Decision nodes become `<g role="button" tabindex="0" aria-pressed>`: Enter or Space selects and sets both `at` (the decision time) and `focus`; Up and Down move between decisions in time order; Escape clears. Add a native `<input type="range">` over the time range with `aria-valuetext` and a visible output ("At 11:10" or "End of the record"); moving it sets `at` and clears `focus`. Render the sentence panel beside the figure (8 and 4 columns at 1280 wide): `momentSentences` for the cursor, or a short plain line when there is none. Items faded to `var(--grey-3, #DDD9CF)`, 120 ms opacity only. Replace the phase A list structure test in `ReplayView.test.tsx` with the new keyboard structure in the same task, and say so in `docs/RESULTS.md`; keep the label "Replay: {title}" on the SVG (`role="group"`) so Night Desk's flow test still finds it, and keep one labelled group per participant. Tests (`ReplayView.select.test.tsx`, jsdom): selecting a decision by keyboard shows "Not yet arrived" with the message; the scrubber changes both participants' sentences; Escape returns to the closed record; the selected node has `aria-pressed` true. _Req 2.2, 2.3, 4.3._

  - [x] 2.5 **Callers give the view readable names.** Dead Air `RunEnd` passes `names` ("Message from {role} at {time}") and a `formatTime`. Night Desk's `Document.tsx` passes `names` for delivered items only, so a missed item shows its time and never its content. Tests: Dead Air shows a named message in the sentence for a selected decision; Night Desk's missed item appears by time only and its text is not in the document. _Req 2.2._

  - _Checkpoint B: selecting a decision fades what the role did not know and says what was missing, in both apps, by keyboard. Ensure all tests pass, ask the user if questions arise._

- [x] 3. **Phase C: counterfactual**

  - [x] 3.1 **Clear line (pure).** Add `ledger/clear-line.ts`: `clearLine(l)` turns every `sent` from a complete history into a `received` outcome at its own send time and leaves `learned`, `arrival` and `readback` alone; `gainAt(l, p, t)` is `knownAt(clearLine(l), p, t)` minus `knownAt(l, p, t)`. Export both from `src/index.ts`; update `core-headless.test.ts`. Example tests in `ledger/clear-line.test.ts`: a dropped message to a role appears in the gain at a later decision; a garbled one too; an arrival is untouched; a ledger with no loss gives an empty gain. _Req 3.1._

  - [x]* 3.2 **Write property test for the clear line.**
    - **Property 10: A clear line only adds knowledge**
    - `ledger/clear-line.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 3.1**

  - [x] 3.3 **"Clear line" toggle in the view.** Add the `clearLine` option to `layoutWorldlines` (it lays out `clearLine(ledger)`: every signal with a send gets zero span and no lost line; arrivals stay) and a button with `aria-pressed` in `ReplayView.tsx` (`sections.counterfactual`, default on). With it on, under each decision show "With a clear line, {label} would also have had: ..." from `gainAt`, or "Nothing more would have arrived." The limit notice also says arrivals-only participants are unchanged by the toggle (kit-generic sentence added to `participants.ts`). Tests (`ReplayView.clear.test.tsx`, jsdom): toggling shows the gains for a lost message; with no loss it shows the plain sentence; no sentence in the view contains should, ought, better, mistake, wrong or correct; toggling back restores the lost lines. _Req 3.1, 3.2._

  - _Checkpoint C: the counterfactual adds facts and never advises. Ensure all tests pass, ask the user if questions arise._

- [x] 4. **Phase D: facilitation and sharing**

  - [x] 4.1 **Summary, prompts and Copy summary.** Add `replay/summary.ts`: `summarise(input, formatTime)` returns one plain paragraph (participants; messages sent, arrived intact, lost or never arrived; longest delay; decisions made; "sends not known" for an arrivals-only participant). In `ReplayView.tsx`, `sections.prompts` shows `scenario.discussionPrompts.slice(0, 3)` as a list (fewer if the scenario has fewer; none invented) and `sections.summary` shows the paragraph with a "Copy summary" button (`navigator.clipboard` when present, otherwise a read-only field with the text selected). Export `summarise`; update `entries.test.ts`. Tests: `summary.test.ts` (same input same paragraph; names every participant; Night Desk-shaped input counts sources' messages); `ReplayView.share.test.tsx` (jsdom): three prompts are shown and a fourth is not; Copy summary calls the clipboard with the paragraph; with no clipboard the field appears. _Req 4.2._

  - [x] 4.2 **Replay token codec.** Add `replay/token.ts`: `encodeReplayRecord` and `decodeReplayRecord` per the design (version 1, compact tuples, base64url written by hand over `Uint8Array`, 6 KB limit, shape-checks every field, never throws, no `Math.random`, no `Date.now`, no DOM global). Export both and the `ReplayRecord` type; update `entries.test.ts`. Example tests in `replay/token.test.ts`: a worked record round-trips; wrong version, bad characters, truncation, wrong shape, an unknown participant kind and an oversize record each return `{ ok: false, reason }`. _Req 4.1._

  - [x]* 4.3 **Write property test for the token.**
    - **Property 13: The share token round-trips and never throws**
    - `replay/token.prop.test.ts`, at least 100 runs, including arbitrary strings.
    - **Validates: Requirements 4.1**

  - [x] 4.4 **"Copy link" in the view.** Add the optional `shareUrl` prop. When given, `ReplayView` shows a "Copy link" button (clipboard when present, otherwise a read-only field with the text selected). The kit never builds the URL. Test in `ReplayView.link.test.tsx` (jsdom): the button appears only with `shareUrl`; copying uses the exact string; the fallback field shows it. _Req 4.1._

  - [x] 4.5 **Dead Air: link out and link in.** `RunEnd.tsx` builds the record from `toLedger`, `toParticipants` and the decisions, encodes it with the kit codec, and passes `shareUrl` (`<origin><base>#s=<token>`); when encoding is too large it shows one sentence and no link. On load, a valid `#s=` token opens a replay-only page (the scenario is found by `scenarioId` in the app's bundle; no run, no transport, no microphone) and has precedence over a saved run without overwriting it; a bad token or unknown scenario shows one plain sentence and the entry screen. Tests (jsdom): finish a Solo run, read the link, mount a fresh app with that fragment and empty storage, and see the same replay sentences; each bad-link case shows its sentence; `fetch` is never called (spy). The RunHost save, restore and discard behaviour from the consoles spec is untouched. _Req 4.1._

  - _Checkpoint D: a finished Dead Air run links to the same replay on another device; a copyable summary and prompts are on the page. Ensure all tests pass, ask the user if questions arise._

- [x] 5. **Phase E: habits (facts, not scores)**

  - [x] 5.1 **Habits (pure).** Add `ledger/habits.ts`: `computeHabits(l, decisions, participants, options)` and `HABIT_WHY` (one fixed generic line per column), per the design: figures are `null` for an arrivals-only participant, for missing bytes or airtime, and for read-back unless `readBackRecorded`; collisions involved and collisions begun second (needs airtime on both); read-back counted until the participant's next decision. Rows in participant order, no sort, no total. Export `computeHabits`, `HABIT_WHY` and the types from `src/index.ts`; update `core-headless.test.ts`; `ledger` imports no `replay` code (it takes a local structural participant type). Example tests in `ledger/habits.test.ts`: worked counts for two roles; mean bytes and airtime; a collision where one role began second; an instruction read back before the next decision counts and one read back after does not; an arrivals-only participant is all `null`. _Req 5.1, 5.2._

  - [x]* 5.2 **Write property test for habits.**
    - **Property 11: Habit figures are a pure function of the log, never lower with another collision, and never invented**
    - `ledger/habits.prop.test.ts`, at least 100 runs.
    - **Validates: Requirements 5.1, 5.2**

  - [x] 5.3 **`HabitsTable` and the view section.** Add `replay/HabitsTable.tsx` (a real `<table>` with a caption, one row per participant, plain counts, the `HABIT_WHY` line under each column heading, "Not known here" for an arrivals-only participant and "Not recorded" for other `null`s) and render it from `ReplayView` when `sections.habits` is on (default off). Export `HabitsTable`; update `entries.test.ts`. Tests (`HabitsTable.test.tsx`, jsdom): counts and one-line explanations are on screen; no total row; none of the words score, rank, best, worst, good or bad; rows keep participant order; no element has a loss or any other colour class (check the style attributes). _Req 5.1, 5.3._

  - [x] 5.4 **Dead Air turns habits on.** `RunEnd.tsx` passes the decisions and `habitOptions` (`readBackRecorded: false`) and sets `sections.habits`. Add an optional `airtime` to `SendRecord` and record it where RunHost builds a send, only if the validator in `persist.ts` accepts an optional numeric field without a version change (otherwise leave airtime unrecorded and say so in `docs/RESULTS.md`; the table then reads "Not recorded"). Night Desk keeps habits off (assert in its document test that no habits table appears). Tests: a Solo run shows transmissions and mean bytes for both roles; a Two tabs run shows "Not known here" for the partner; read-back reads "Not recorded". _Req 5.1, 5.3._

  - _Checkpoint E: habits are plain counts in Dead Air and absent from Night Desk. Ensure all tests pass, ask the user if questions arise._

- [x] 6. **Phase F: keyboard, print, evidence**

  - [x] 6.1 **Keyboard-complete pass.** Add `ReplayView.keyboard.test.tsx` (jsdom): using only Tab, Enter, Space, Up, Down, Escape and the scrubber keys, a person can select each decision, move the cursor, toggle the clear line, copy the summary and copy the link, and reach the text timeline; every control has an accessible name; focus is never trapped. Fix what it finds. Add the same flow to one app test per app (Dead Air `RunEnd`, Night Desk `Document`) in its existing keyboard test file if one exists, or a new one. _Req 4.3._

  - [x] 6.2 **Print, theme and contrast rules.** Add `ReplayView.style.test.tsx` (node or jsdom): the inline style has the print block (figure avoids page breaks; loss lines black and dotted; faded mid grey), uses only custom properties with the light fallbacks, has no gradient, `box-shadow` deeper than one hairline, `filter` or `animation`, and removes the opacity transition under reduced motion; a small WCAG contrast function checks ink, `#6B6861` and loss on paper and on `#141311` at 4.5:1 for text and 3:1 for non-text, and `#A9A59B` and `#DDD9CF` are never used for text. Fix what it finds. _Req 6.3._

  - [x] 6.3 **Evidence and final check.** Run `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` at the root and paste the real results into `docs/RESULTS.md`: counts per phase, the boundary output, the tests replaced or renamed in 1.13, 1.14 and 2.4 with the reason, and the new export lists. Add a `docs/KIRO-USAGE.md` entry for what actually ran; claim nothing unrun. Record the manual checks one line each, with "not run" until a person has done them: black-and-white print on one page; the diagram read as a still image at 1280x720 (a screenshot may be saved under `docs/evidence/` if a browser is available); a screen-reader pass of the text timeline; reduced motion in a browser; both appearances; two real tabs and two devices for the arrivals-only notice. Decide and record whether `layoutReplay` is kept (default: kept). Confirm `.kiro/` is not in `.gitignore`. _Req 2.1, 4.3, 6.3._

  - _Final checkpoint: all checks pass. Ensure all tests pass, ask the user if questions arise._



## Requirement to task coverage

| Req | Statement (short) | Task(s) | Property / how verified |
|---|---|---|---|
| 1.1 | Known set is what was delivered or observed | 1.1, 1.2 | Property 1 |
| 1.2 | Known set only grows | 1.1, 1.3 | Property 2 |
| 1.3 | Lost messages excluded and listed | 1.1, 1.4 | Property 3 |
| 2.1 | Worldlines, signals, lost lines, decision nodes | 1.5, 1.7, 1.8, 1.10, 1.13, 1.14, 1.15 | Properties 5, 6, 14 plus examples |
| 2.2 | Selection highlights, dims, lists what had not arrived | 1.9, 2.1 to 2.5 | Properties 7, 8, 9 plus examples |
| 2.3 | Scrubber updates both known sets and text | 1.9, 2.1, 2.3, 2.4 | Properties 7, 8 plus example |
| 2.4 | Layout is pure | 1.5, 1.6 | Property 4 |
| 3.1 | Clear line shows additional facts | 3.1 to 3.3 | Property 10 plus example |
| 3.2 | Never says what should have been decided | 2.1, 3.3 | example (wording check) |
| 4.1 | Link reproduces the replay with no server | 4.2 to 4.5 | Property 13 plus example |
| 4.2 | Three prompts and a copyable summary | 4.1 | example |
| 4.3 | Keyboard-complete, ordered text timeline | 1.11, 1.12, 1.13, 2.4, 6.1 | Property 12 plus examples; screen reader is manual |
| 5.1 | Habit figures per role | 5.1, 5.3, 5.4 | Property 11 plus examples |
| 5.2 | Habits pure; collisions never lower | 5.1, 5.2 | Property 11 |
| 5.3 | Plain counts, no ranking, no colour, no total | 5.3, 5.4 | example |
| 6.1 | Only a log and participants; no app wording | 1.5, 1.8, 1.14, 1.15 | Property 6; `pnpm check:boundaries` |
| 6.2 | Single participant: player plus sources | 1.5, 1.13, 1.15 | example |
| 6.3 | SVG, selectable text, prints on one page | 1.13, 6.2, 6.3 | example; print is manual |

## Notes

- Property sub-tasks carry `*` and are optional. Everything else is required, because each pairs its code with the example tests that prove it.
- **Provenance.** `ReplayParticipant.history` is the only place the knowledge limit is stated. The kit holds the two generic sentences; the app may add one reason sentence as `limitNote`. The kit never uses the boundary words (resident, booth, modem, tower, night desk, dead air, fsk, acoustic) and never says "device" or "tab".
- **Shared files and waves.** Tasks that edit the same file are in different waves: `ReplayView.tsx` (1.13, 2.4, 3.3, 4.1, 4.4, 5.3, 6.1, 6.2), `worldlines.ts` (1.5, 2.1, 3.3), `replay/index.ts` and `entries.test.ts` (1.5, 1.11, 2.1, 4.1, 4.2, 5.3), the core `index.ts` and `core-headless.test.ts` (1.1, 3.1, 5.1), `RunEnd.tsx` (1.14, 2.5, 4.5, 5.4). Each property test has its own file.
- **Compatibility.** `{ ledger, scenario }` alone still renders. The existing `layoutReplay` is untouched. The two pinned export lists change on purpose, in the task that adds the export.
- **Night Desk coordination.** night-desk 3.2, 3.3, 4.1 and 4.2 stay where they are. If night-desk 3.4 has not landed when task 1.15 runs, 1.15 edits the current `Document.tsx`; 3.4 then keeps the kit view's props.
- **Open question for the developer.** Req 5.1 says "collisions that role caused". The ledger cannot name the other sender in a collision, so the design reports collisions involved and collisions begun second (known only when airtime is). If you want the requirement reworded, change `requirements.md`; this plan does not.
- Each phase ends with a checkpoint: all tests pass; ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5"] },
    { "id": 2, "tasks": ["1.6", "1.7", "1.8", "1.9", "1.10", "1.11"] },
    { "id": 3, "tasks": ["1.12", "1.13"] },
    { "id": 4, "tasks": ["1.14", "1.15"] },
    { "id": 5, "tasks": ["1.16"] },
    { "id": 6, "tasks": ["2.1"] },
    { "id": 7, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 8, "tasks": ["2.5"] },
    { "id": 9, "tasks": ["3.1"] },
    { "id": 10, "tasks": ["3.2", "3.3"] },
    { "id": 11, "tasks": ["4.1"] },
    { "id": 12, "tasks": ["4.2"] },
    { "id": 13, "tasks": ["4.3", "4.4"] },
    { "id": 14, "tasks": ["4.5"] },
    { "id": 15, "tasks": ["5.1"] },
    { "id": 16, "tasks": ["5.2", "5.3"] },
    { "id": 17, "tasks": ["5.4"] },
    { "id": 18, "tasks": ["6.1"] },
    { "id": 19, "tasks": ["6.2"] },
    { "id": 20, "tasks": ["6.3"] }
  ]
}
```
