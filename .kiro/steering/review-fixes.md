---
inclusion: manual
---
# /review-fixes

Work through the latest independent review notes in `planning/review/LATEST.md` (local file, not in the repository; read it by path).

1. Read the **Tasks** table. For each task decide: accept, reject, or defer. Reject anything that breaks a rule in the product or design steering, and say why in one line.
2. Do accepted **S** tasks now, smallest first, one at a time, with tests where behaviour changes.
3. For accepted **M** and **L** tasks, do not start them. Add each as an unchecked task to the right spec's `tasks.md`, citing the requirement it serves.
4. Run `pnpm typecheck`, `pnpm test`, `pnpm build`.
5. Report as a table: task ID, decision, what was done, evidence. Then the usual **Commit** block.

Do not edit anything under `planning/`.
