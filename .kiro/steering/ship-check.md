---
inclusion: manual
---
# /ship-check

Run this before any deploy or submission step. Do not fix anything; report.

1. Run `pnpm typecheck`, `pnpm test`, `pnpm build`. Paste the real tail of each.
2. Open the app with the Playwright MCP. Play solo mode to the Séance. Screenshot each console and the Séance at 1440 px and 390 px.
3. Keyboard-only pass of the same journey. List any trap or unlabeled control.
4. Check the Kiroween rules in `docs/END-GOAL.md` "Submission checklist" item by item against the repo.
5. Output a table: check, pass/fail, evidence. Then the three highest-impact fixes.
