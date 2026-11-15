# Kiro cheat-sheet for Dead Air

Use this for this. Everything named here already exists in `.kiro/` unless marked **you do**.

## Which thing do I use?

| I want to… | Use | How |
|---|---|---|
| Build a real feature (more than one file) | **Spec** | Kiro panel → Specs → open `signal-chain`, `consoles` or `seance-replay` → "Generate design" → "Generate tasks" → run tasks one at a time |
| Make a small fix or try an idea | **Vibe chat** | Just ask. If it grows past ~3 files, stop and move it into a spec task |
| Prove a rule holds for every input | **Property-based tests** | In the spec's design phase, accept the "correctness properties". Requirements marked `(PBT)` are written for this |
| Work on the modem or channel | **Agent `signal-engineer`** | Agent picker → `signal-engineer` |
| Work on consoles, CRT, sound, the Séance | **Agent `phosphor`** | Agent picker → `phosphor`. It looks at its own screenshots |
| Write or balance a scenario | **Agent `scenario-writer`** | Agent picker → `scenario-writer` |
| Get an honest second opinion | **Agent `cold-reader`** | Agent picker → `cold-reader`. It cannot edit source |
| Build a slice hands-off with a review gate | **Workflow `dead-air-slice`** | Chat: `/workflow-run` → `dead-air-slice` → type the task. Plans, builds, cold-reviews, loops up to 3 times, then pauses |
| Check everything before deploy or submit | **Workflow `ship-check`** or **`/ship-check`** | Workflow = three reviewers in parallel, one merged report. Slash command = same idea in one session, cheaper |
| Understand unfamiliar code | **Workflow `investigate`** (built in) | "Use the investigate workflow to explain X. Read-only." |
| Let Kiro see and click the app | **Playwright MCP** | Already in `.kiro/settings/mcp.json`. Say "open the app and screenshot it" |
| Get current library docs (Web Audio, fast-check) | **Context7 MCP** | Say "use context7 for the AudioWorklet docs" |
| Record what Kiro did, for the write-up | **`/kiro-log`** | Type it at the end of a session. Spec tasks are logged automatically by a hook |
| Work from your phone or while in class | **Kiro Web** | **You do:** after the repo is on GitHub, connect it at app.kiro.dev. Good for scenario writing, docs, the blog draft |
| Script or batch things in a terminal | **Kiro CLI** | **You do:** install it (not on this Mac yet). Same `.kiro/` works there |
| Add bundled expertise | **Powers** | **You do:** Kiro panel → Powers → browse. Install only what you will use (a deploy power for your host is the useful one) |
| Motion and animation polish | **Skills** | Already installed globally: `animate`, `review-animations`, `emil-design-eng`. Kiro picks them up when you ask about motion |
| Nightly automated test runs | **Kiro Crew** | Stretch goal only. See `docs/END-GOAL.md` |

## What runs by itself (hooks)

| Hook | When | What it does | Cost |
|---|---|---|---|
| `guard` | Before any shell command | Blocks `git push`, deploys, publishes, `rm -rf`. You do those by hand | Free |
| `verify-on-stop` | When Kiro finishes a turn | Runs typecheck + tests. If they fail, sends Kiro back with the real error, at most twice | Free unless it fails |
| `evidence-log` | After each spec task | Appends a dated line to `docs/KIRO-USAGE.md` | Free |
| `property-companion` | Kiro creates a file in `src/engine`, `src/channel`, `src/modem` | Writes a property test beside it | Uses credits |

## What Kiro always knows (steering)

| File | Loaded | Holds |
|---|---|---|
| `product.md`, `tech.md`, `structure.md` | Always | What we are building, the stack, where files go |
| `design-language.md` | When touching `src/ui` | Colours, type, motion, sound rules |
| `modem-dsp.md` | When touching modem, channel, transport | Signal chain rules and the Nov 21 cut-off |
| `testing.md` | When touching tests | How we test |
| `ship-check.md`, `kiro-log.md` | Only when you type `/ship-check` or `/kiro-log` | The two slash commands |

## The daily loop

1. Open `docs/END-GOAL.md`, find today's row.
2. Pick the next unchecked task in that spec. Run it. Read the diff.
3. Open the app yourself and try it. Kiro's "done" is a claim until you have seen it.
4. Commit (you, by hand). Small commits make the history part of the evidence.
5. `/kiro-log` if something interesting happened, especially something that went wrong.

## Do first, in this order

1. In the IDE: trust the workspace, open the Kiro panel, check that 4 hooks, 4 agents, 2 workflows and 2 MCP servers show up.
2. Ask Kiro: `Run validate_workflow on both files in .kiro/workflows. Report errors and warnings. Do not launch.` Fix what it reports.
3. `git add -A && git commit` (first commit), add an MIT `LICENSE`, create the public GitHub repo.
4. Open spec `signal-chain` → generate design → generate tasks → start task 1.

## Not verified yet

- The hook, agent and workflow files follow the current Kiro docs and the JSON parses, and the hook scripts were run with sample events. None has run inside Kiro yet.
- `cold-reader` and `phosphor` are used as workflow step agents. Kiro checks custom-agent names only when a run starts.
- The `permissions` rules in `cold-reader` use the documented shape; confirm in its first run that it cannot write to `src/`.
