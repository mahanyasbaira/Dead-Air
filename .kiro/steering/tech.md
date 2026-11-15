---
inclusion: always
---
# Tech

- **Stack:** Vite 5, React 18, TypeScript strict, Vitest, fast-check (property tests), pnpm. Static site, no backend.
- **Audio:** Web Audio API. Modem demodulation runs in an AudioWorklet; the DSP core is pure TypeScript over `Float32Array` so it is testable in Node without audio hardware.
- **Rendering:** React for structure and controls; Canvas 2D / WebGL (hand-written, no 3D framework) for the CRT, waterfall and Séance diagram. No CSS framework, no component library.
- **State:** append-only event log + pure reducer (`src/engine`). UI never mutates state directly; it dispatches events.
- **Randomness:** only through the seeded PRNG in `src/channel/prng.ts`. `Math.random` and `Date.now` are banned inside `src/engine`, `src/channel`, `src/modem`.
- **Sharing:** a finished run serialises to a compressed URL fragment (CompressionStream + base64url). Nothing is uploaded.
- **Dependencies:** add one only when it removes real work and say why in the PR/commit. Current allowance: `fast-check`. Ask before adding anything over ~30 kB gzipped.
- **Commands:** `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`. All three checks must pass before a task is called done.
- **Browsers:** current Chrome, Safari, Firefox on desktop; Chrome and Safari on phones. Microphone needs HTTPS or localhost.
