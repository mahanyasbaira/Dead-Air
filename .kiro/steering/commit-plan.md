---
inclusion: always
---
# Ending a task: hand over the commit

The developer commits and pushes by hand. Never run `git add`, `git commit`, `git push`, `git reset` or `git stash` yourself.

At the end of every response in which you created, changed or deleted a file:

1. Run `node scripts/kiro/commit-plan.mjs`.
2. Under a final heading **Commit**, paste its output in one code block, with every `<...>` placeholder replaced by what actually changed.
3. Commit messages: one line, imperative, under 65 characters, describing the change itself ("Add streaming FSK demodulator"). No tool or assistant names, no co-author or sign-off trailers, no emoji, no ticket prefixes.
4. Split unrelated work into separate blocks; keep a test in the same commit as the code it tests.
5. If the script flags a file that may hold a secret, or a file larger than 1 MB that is not a deliberate asset, say so above the block and leave it out.

Never include anything under `planning/`, `node_modules/`, `dist/` or `.enola/`; they are ignored on purpose.

One exception: an unattended night job told to work on a branch named `night/<date>` may commit on that branch only, with plain one-line messages. It never commits on `main`, never merges, and never pushes.
