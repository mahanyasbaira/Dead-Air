---
inclusion: manual
---
# /ship-check

Run this before any deploy or submission step. Do not fix anything; report.

1. Run `pnpm typecheck`, `pnpm test`, `pnpm build`. Paste the real tail of each.
2. Open the site with the Playwright MCP. Play Night Desk to the replay, then Dead Air alone to the replay. Screenshot every screen at 1440 px and 390 px, in light and dark.
2a. Compare each screenshot against `.kiro/steering/design-language.md`, section "Never". List every violation.
3. Keyboard-only pass of the same journey. List any trap or unlabeled control.
4. Check the Kiroween rules in `docs/PLAN.md` "Submission checklist" item by item against the repo.
5. Output a table: check, pass/fail, evidence. Then the three highest-impact fixes.
