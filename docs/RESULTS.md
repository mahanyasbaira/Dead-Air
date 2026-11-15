# Slice 1 results — "Static on Channel 9"

Record of what was actually built and verified in this session. No claims here are
asserted without a corresponding command and observed result.

## Scope delivered

The first vertical slice of the deterministic single-browser two-role demo:

- One fictional scenario (`src/engine/scenario.ts`), fully synthetic, labeled SIMULATION.
- Role switch between Dispatch and Field Lead sharing one timeline.
- A scripted delayed message (created sim-minute 2, delivered sim-minute 5).
- One recorded decision per role, stamped with the sim-minute reached.
- A debrief reconstructing created/delivered/decided timing and the full timeline.
- Reset control and an explicit demo-mode explanation.
- Accessible markup: keyboard navigation, text-not-color state, reduced-motion support.

## Key engineering choices

- **Vite + React + TypeScript, Vitest.** Smallest proven stack for a testable TS web
  app; Vitest reuses the Vite config so there is one toolchain. Only runtime deps are
  React and ReactDOM.
- **Pure engine, independent of rendering.** `src/engine/` has no React/DOM imports.
  The timeline is the single source of truth; `replay(scenario, log)` is a pure
  function, so determinism is directly unit-testable.
- **Deterministic ordering** by `(simTime, id)`; decisions are keyed by role and sorted,
  so replay is order-independent and recording a role's choice twice replaces the first.
- **Sim-time is scripted integers**, not wall-clock, to keep replay reproducible.
- **Single-browser role switch is a UI toggle**, not authentication — matches the spec's
  explicit non-goal of access control for the baseline.

## Verification (commands run and observed)

- `pnpm test` → **13 passed** (11 engine + 2 rendered-UI journey tests).
  - Engine: deterministic replay (incl. order-independence), role filtering,
    delayed-message ordering/dead-air gap, reset.
  - UI (jsdom + Testing Library): full journey — start, role switch, delayed message
    hidden before delivery and shown at delivery, decision recorded with sim-time,
    debrief shows the 3-sim-minute dead-air gap, reset returns to intro; plus a test
    that role-specific info stays out of the other role's view.
- `pnpm build` → typecheck (`tsc --noEmit`) clean; production build succeeded.
- Dev server (`pnpm dev`): started cleanly, served HTTP 200 with the correct document
  and transformed module graph. (Automated check via curl; not a human click-through.)

## Known limitations

- The "manual UI exercise" here was driven by an automated rendered-UI test and a
  server smoke check, not a human sighted/AT walkthrough. A real keyboard-and-
  screen-reader pass is still recommended before any demo.
- No persistence across refresh (in-memory only); reset is the intended way to restart.
- One scenario, one decision per role — breadth (more events/scenarios), polished visual
  design, and user feedback are deliberately out of this slice (tasks 4 and 6).
- No deployment, license, public repo, or workflow run performed.

## Suggested next step

Pick the next `tasks.md` item: either the accessible visual-design pass (task 4) or a
human keyboard/AT walkthrough to confirm the accessibility claims before widening scope.
