---
inclusion: always
---
# Structure

```
packages/hindsight/src/
  engine/     event types, append-only log, pure reducer, replay
  channel/    seeded PRNG, simulated clock, lossy channel
  ledger/     who knew what at time t; habits computed from the log
  replay/     the replay view (React + SVG) and its pure layout function
apps/night-desk/
  src/        attention model, screens
  scenarios/  scenario files; briefs/ holds the short specs they are generated from
  public/voice/
apps/dead-air/
  src/modem/      FSK, framing, CRC
  src/transport/  acoustic, loopback (two tabs), scripted partner
  src/            screens
  scenarios/
site/          landing page
scripts/kiro/  scripts called by .kiro/hooks
reports/       workflow outputs (never under .kiro/)
docs/          PLAN.md, KIRO-USAGE.md, RESULTS.md, evidence/
```

- Imports flow one way: apps import the kit; the kit imports nothing from apps. Inside the kit: `replay -> ledger -> engine`, `channel -> engine`.
- An app never copies kit code. If both apps need it, it moves into the kit.
- Tests sit beside code: `x.ts`, `x.test.ts`, and `x.prop.test.ts` for properties.
- Specs under `.kiro/specs/`: `skeleton` (the kit and workspace), `night-desk`, `consoles` (the Dead Air interface), `signal-chain` (the modem), `seance-replay` (the replay), `dead-air-mvp` (the first prototype, kept as history).
- `.kiro/` is submission evidence. Never add it or any subfolder to `.gitignore`.
