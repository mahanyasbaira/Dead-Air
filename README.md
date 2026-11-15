# Dead Air

A haunted two-player comms drill for Kiroween 2026 (category: Resurrection). Two people share one fictional incident at a radio station and can only talk over a resurrected acoustic modem: one device plays the message as sound, the other hears it. Afterwards the Séance replays who knew what, when.

> Everything is fiction. No real people, places, alerts, procedures or advice.

Plan: [`docs/END-GOAL.md`](docs/END-GOAL.md) · Kiro feature map: [`KIRO-CHEATSHEET.md`](KIRO-CHEATSHEET.md) · Kiro evidence log: [`docs/KIRO-USAGE.md`](docs/KIRO-USAGE.md)

## Run the demo

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # engine + rendered-UI journey tests
pnpm build      # typecheck + production build
```

## First vertical slice (implemented)

One playable fictional scenario, "Static on Channel 9":

- **Two roles** (Dispatch, Field Lead) sharing one deterministic timeline, switchable in a single browser.
- **A delayed message**: Dispatch writes a wind note at sim-minute 2; it reaches the Field Lead at sim-minute 5 — the "dead air" gap.
- **Recorded decisions**: each role records one choice at the sim-minute it had reached.
- **A debrief** reconstructing who knew what, when: the created/delivered gap, each decision's sim-time, and the full ordered timeline.
- Accessibility: keyboard-navigable, info conveyed in text (not color alone), `prefers-reduced-motion` respected, skip link, ARIA tabs/panels.

The simulation engine (`src/engine/`) is pure TypeScript with no UI dependency, so replay is deterministic and unit-tested. See `docs/RESULTS.md` for verification evidence.

## Status

The first slice (deterministic engine, two-role single-browser demo, 13 passing tests) is built. The Wire, the Consoles and the Séance are specified in `.kiro/specs/` and not built yet. Not done: licence, public repository, deployment, user sessions.
