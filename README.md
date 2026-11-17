# Hindsight

**A small kit for drills where information arrives late, damaged, or never. Afterwards, a replay shows what each person knew at the moment they decided.**

Two applications are built on it:

- **Night Desk** — a solo rehearsal of a resident assistant's duty night. Calls, knocks and messages arrive while you are busy with something else.
- **Dead Air** — two devices whose only link is sound. One plays the message through its speaker; the other hears it through its microphone. No network.

Built for Kiroween 2026 (category: Skeleton Crew).

> All scenarios are invented. This is practice, not a substitute for any organisation's own training.

## Status

The repository is mid-move from a single prototype to a kit with two apps.

| | |
|---|---|
| Event log, reducer, seeded channel | built, tested |
| Framing, CRC-16, FSK modem on a clean signal | built, tested |
| Two-tab and scripted transports | built, tested |
| Workspace split into `packages/hindsight`, `apps/night-desk`, `apps/dead-air` | specified, not done |
| Night Desk | specified, not built |
| Dead Air interface, acoustic link | specified, not built |
| Replay view | specified, not built |
| Deployed site, sessions with real users | not yet |

The code currently lives in `src/`; the interface there is the first-day prototype.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit, property and rendered-UI tests
pnpm build      # typecheck + production build
```

Requires Node 20 or newer and pnpm 10.

## How it is built

The project is developed in [Kiro](https://kiro.dev). The `.kiro/` folder is part of the source:

| Folder | Contents |
|---|---|
| `.kiro/specs` | Requirements, designs and task lists for the kit, each app, the modem and the replay |
| `.kiro/steering` | Product, stack and structure rules loaded always; design, signal and testing rules loaded by file type |
| `.kiro/hooks` | Block pushes and deploys by the agent, verify before finishing, log each completed task, turn a scenario brief into a scenario and its tests |
| `.kiro/agents` | Four narrow agents: signal chain, interface, scenarios, independent reviewer |
| `.kiro/workflows` | A build-and-review loop and a three-way pre-release check |

Rules that must hold for every input are property tests (`*.prop.test.ts`, using fast-check).

- Plan: [`docs/PLAN.md`](docs/PLAN.md)
- Measured results and decisions: [`docs/RESULTS.md`](docs/RESULTS.md)
- Development log: [`docs/KIRO-USAGE.md`](docs/KIRO-USAGE.md)

## Licence

MIT. See [`LICENSE`](LICENSE).
