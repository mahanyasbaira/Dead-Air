---
inclusion: always
---
# Structure

```
src/engine/     pure reducer, event types, replay, knowledge queries  (no DOM, no audio)
src/channel/    seeded PRNG, simulated channel (delay, drop, garble, collision)
src/modem/      FSK encode/decode, framing, CRC  (pure DSP + AudioWorklet wrapper)
src/transport/  Transport interface + acoustic, loopback (BroadcastChannel), scripted
src/scenarios/  scenario JSON + schema validator
src/ui/         consoles/ (booth, tower), seance/, shell/, fx/ (crt, waterfall, audio)
scripts/kiro/   scripts called by .kiro/hooks
reports/        workflow outputs (never put outputs under .kiro/)
docs/           END-GOAL.md, KIRO-USAGE.md, RESULTS.md
```

- Imports flow one way: `ui -> transport -> modem/channel -> engine`. `engine` imports nothing from the others.
- Tests sit next to code: `x.ts` + `x.test.ts`; property tests are `x.prop.test.ts`.
- One spec per pillar under `.kiro/specs/`: `signal-chain`, `consoles`, `seance-replay`. `dead-air-mvp` is the finished first slice; keep it as history.
- `.kiro/` is submission evidence. Never add it or any subfolder to `.gitignore`.
