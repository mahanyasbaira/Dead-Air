---
inclusion: always
---
# Tech

- **Workspace:** pnpm workspaces. `packages/hindsight` is a plain TypeScript library; `apps/night-desk` and `apps/dead-air` are Vite + React 18 apps that depend on it as `workspace:*`. TypeScript strict everywhere.
- **Tests:** Vitest and fast-check. Root scripts `pnpm test`, `pnpm typecheck`, `pnpm build` run across the whole workspace and must all pass before a task is called done.
- **Kit boundaries:** `packages/hindsight` has no DOM, no audio, no React in its core entry. The replay view is exported from a separate entry (`hindsight/replay`) so the core stays headless.
- **Audio (Dead Air only):** Web Audio API. Demodulation runs in an AudioWorklet; the DSP core is pure TypeScript over `Float32Array`, testable in Node.
- **Rendering:** React for structure; SVG for the replay (it must stay sharp, selectable and printable). No canvas effects, no CSS framework, no component library.
- **Randomness and time:** only through the kit's seeded PRNG and simulated clock. `Math.random` and `Date.now` are banned in `packages/hindsight` and in any `engine`, `channel` or `modem` folder.
- **Assets:** fonts are IBM Plex Sans and Mono, self-hosted, with the OFL licence file beside them. Voice clips for Night Desk are pre-generated files under `apps/night-desk/public/voice/` with a `MANIFEST.md` naming the model, its licence and the date; every clip has a transcript and the app works fully without sound.
- **Dependencies:** add one only when it removes real work, and say why. Allowed now: `fast-check`. Ask before adding anything over 30 kB gzipped.
- **Hosting:** one static site: `/` landing, `/night-desk`, `/dead-air`. HTTPS (the microphone needs it).
