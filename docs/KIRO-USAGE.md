# Kiro usage log

Facts only. This file becomes the "how Kiro was used" section of the submission. Add entries with `/kiro-log`; spec tasks are appended automatically by the `evidence-log` hook.

## 2026-11-15

- **IDE, workflow validation.** Asked Kiro to validate `dead-air-slice.workflow.json` without launching. It reported no `validate_workflow` tool in that session and reviewed the recipe by hand instead: no structural errors, five warnings (review step used a planner agent, no verdict gate, review read the implementer's self-report, no default for the input, unverified file path). 0.23 credits, 19 s. Outcome: the recipe was rewritten with a `cold-reader` custom agent and a repeat loop that stops only on `VERDICT: APPROVED`.
- **IDE, vibe session against a spec, first vertical slice.** Kiro chose Vite + React + TypeScript + Vitest, built a pure engine (`src/engine`) and a two-role UI, 18 files. 6.93 credits, 7 m 49 s. 13 tests pass (11 engine, 2 rendered-UI); re-run and confirmed outside Kiro the same day.
  - What went wrong: the first UI test failed. Kiro's test assumed the timeline stepped 0→1→3; the scenario steps are 0,1,2,3,5,6. Kiro read the rendered DOM in the failure output, concluded the app was right and the test was wrong, and fixed the test. Also caught and fixed its own typo in `styles.css`.
  - Limitation Kiro stated itself: the "manual UI exercise" was a jsdom test plus a `curl` smoke check, not a human or real-browser run. This is why the Playwright MCP was added.
- **Setup.** Added 8 steering files (3 always, 3 fileMatch, 2 manual slash commands), 3 pillar specs in EARS form with PBT-marked requirements, 4 hooks with scripts, 4 custom agents, 2 workflows, MCP config. Hook scripts tested with sample events outside Kiro; not yet run inside Kiro.

## Spec task log (automatic)

