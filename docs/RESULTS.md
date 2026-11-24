# Slice 1 results — "Static on Channel 9"

Record of what was actually built and verified in this session. No claims here are
asserted without a corresponding command and observed result.

## Scope delivered

The first vertical slice of the deterministic single-browser two-role demo:

- One fictional scenario (`src/engine/scenario.ts`), fully synthetic, labeled SIMULATION.
- Role switch between Dispatch and Field Lead sharing one timeline.
- A scripted delayed message (created sim-minute 2, delivered sim-minute 5).
- One recorded decision per role, stamped with the sim-minute reached.
- A debrief reconstructing created/delivered/decided timing and the full timeline.
- Reset control and an explicit demo-mode explanation.
- Accessible markup: keyboard navigation, text-not-color state, reduced-motion support.

## Key engineering choices

- **Vite + React + TypeScript, Vitest.** Smallest proven stack for a testable TS web
  app; Vitest reuses the Vite config so there is one toolchain. Only runtime deps are
  React and ReactDOM.
- **Pure engine, independent of rendering.** `src/engine/` has no React/DOM imports.
  The timeline is the single source of truth; `replay(scenario, log)` is a pure
  function, so determinism is directly unit-testable.
- **Deterministic ordering** by `(simTime, id)`; decisions are keyed by role and sorted,
  so replay is order-independent and recording a role's choice twice replaces the first.
- **Sim-time is scripted integers**, not wall-clock, to keep replay reproducible.
- **Single-browser role switch is a UI toggle**, not authentication — matches the spec's
  explicit non-goal of access control for the baseline.

## Verification (commands run and observed)

- `pnpm test` → **13 passed** (11 engine + 2 rendered-UI journey tests).
  - Engine: deterministic replay (incl. order-independence), role filtering,
    delayed-message ordering/dead-air gap, reset.
  - UI (jsdom + Testing Library): full journey — start, role switch, delayed message
    hidden before delivery and shown at delivery, decision recorded with sim-time,
    debrief shows the 3-sim-minute dead-air gap, reset returns to intro; plus a test
    that role-specific info stays out of the other role's view.
- `pnpm build` → typecheck (`tsc --noEmit`) clean; production build succeeded.
- Dev server (`pnpm dev`): started cleanly, served HTTP 200 with the correct document
  and transformed module graph. (Automated check via curl; not a human click-through.)

## Known limitations

- The "manual UI exercise" here was driven by an automated rendered-UI test and a
  server smoke check, not a human sighted/AT walkthrough. A real keyboard-and-
  screen-reader pass is still recommended before any demo.
- No persistence across refresh (in-memory only); reset is the intended way to restart.
- One scenario, one decision per role — breadth (more events/scenarios), polished visual
  design, and user feedback are deliberately out of this slice (tasks 4 and 6).
- No deployment, license, public repo, or workflow run performed.

## Suggested next step

Pick the next `tasks.md` item: either the accessible visual-design pass (task 4) or a
human keyboard/AT walkthrough to confirm the accessibility claims before widening scope.

---

# Signal-chain slice — "The Wire"

## A1 — Seeded PRNG (`src/channel/prng.ts`)

Record of parameters and verification for the deterministic PRNG that backs the
channel's reproducibility (property P4, requirement 3.1).

### Chosen parameters

- **Algorithm:** Mulberry32 — a compact 32-bit generator. Single uint32 of state,
  pure integer arithmetic (`Math.imul`, shifts, XOR), no platform entropy, so it
  runs identically in Node and the browser.
- **API:** `nextUint32()` → `[0, 2^32)`; `nextFloat()` = `nextUint32() / 2^32` in
  `[0, 1)`; `nextBool(p)` = `nextFloat() < p` with `p ≤ 0` always false and
  `p ≥ 1` always true. `reseed(seed)` restarts the stream for reproducible replay.
- **Seed coercion:** seeds are coerced to uint32 via `>>> 0`, so `0` and `2^32`
  (for example) share a stream.
- **Dependency added:** `fast-check` 4.10.2 (devDependency) for the property test —
  this is the dependency the tech steering already allows.

### Known-seed vector (frozen in `prng.test.ts`)

`new Prng(1)` → first five `nextUint32()`:
`[2693262067, 11749833, 2265367787, 4213581821, 4159151403]`.

### Verification (commands run and observed)

- `pnpm test --run src/channel/prng.test.ts src/channel/prng.prop.test.ts`
  → **12 passed** (6 example + 6 property).
- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **25 passed** across 4 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests).
- `pnpm build` → typecheck clean, production build succeeded.

## A2 — CRC-16 (`src/modem/crc.ts`)

Record of the polynomial choice (design open point 2) and verification for the
frame check sequence that backs property P2 (requirement 1.2).

### Chosen variant

- **Decision (open point 2 — CCITT vs IBM/ARC):** CRC-16/**CCITT-FALSE**.
- **Polynomial:** `0x1021` (x¹⁶ + x¹² + x⁵ + 1), normal / non-reflected form.
- **Initial value:** `0xFFFF`. No input or output bit reflection; no final XOR.
- **Why:** either variant satisfies P2 (any single-bit flip changes a 16-bit CRC);
  CCITT-FALSE has a widely published check value, so the implementation can be
  pinned against a reference rather than against itself. API is a single pure
  function `crc16(bytes: Uint8Array): number` returning a uint16, no randomness.

### Frozen check values (in `crc.test.ts`)

- Published check string `"123456789"` (ASCII) → **`0x29B1`** — the standard
  CRC-16/CCITT-FALSE check value, used as the reference vector.
- Empty input → `0xFFFF` (register never advanced).
- Single `0x00` byte → `0xE1F0`.
- Single `0xFF` byte → `0xFF00`.

### Verification (commands run and observed)

- `pnpm test --run src/modem/crc.test.ts src/modem/crc.prop.test.ts`
  → **9 passed** (6 example + 3 property). The P2 property (any single-bit flip of
  the input changes the CRC) held with no counterexample.
- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **34 passed** across 6 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests).
- `pnpm build` → typecheck clean, production build succeeded.

## A3 — Framing + parse (`src/modem/frame.ts`)

Record of the frame layout, the sync-word and preamble choices (design open
point 1), and verification for properties P1 (requirement 1.1) and P2
(requirement 1.2), plus the typed-error example (requirement 1.3).

### Frame layout

```
[preamble][sync word][length: 1 byte][payload: 0–64 bytes][CRC-16: 2 bytes]
```

- CRC-16/CCITT-FALSE covers the **length byte + payload** only (not the preamble
  or sync word, which exist solely for clock recovery and frame-start detection).
- CRC is stored big-endian (high byte first).
- Fixed overhead is 7 bytes (2 preamble + 2 sync + 1 length + 2 CRC); total frame
  length is `7 + payload.length`.

### Chosen values (open design point 1)

- **Preamble length:** 16 bits — two `0xAA` bytes (`10101010 10101010`), a clean
  alternating-bit run for the demodulator's clock recovery. (Starting value; may
  be lengthened in B1/B2 if clock lock needs more lead-in, with the change and its
  bit-error-rate recorded here.)
- **Sync word:** 2 bytes `0x2D 0xD4`. Asymmetric (not an `0xAA`-like alternating
  pattern) so it is unlikely to appear inside the preamble's alternating run, which
  keeps frame-start detection unambiguous.

### Parse-result contract

Discriminated union: `{ ok: true, payload }` or
`{ ok: false, reason: "garbled" | "bad-sync" | "bad-length" }`.

- Bad CRC → `garbled`. The payload is never delivered as valid and never silently
  repaired (requirement 1.2).
- Preamble/sync mismatch or a short buffer → `bad-sync`.
- Declared length out of range (> 64) or inconsistent with the buffer →
  `bad-length`.
- Payload > 64 bytes is rejected by `frame()` with a typed `PayloadTooLargeError`
  before transmission (requirement 1.3).

### Verification (commands run and observed)

- `pnpm test --run src/modem/frame.test.ts src/modem/frame.prop.test.ts`
  → **11 passed** (9 example + 2 property). P1 (round-trip for any 0–64-byte
  payload, incl. empty and 64-byte boundaries) and P2 (any single-bit flip of the
  whole frame → not-ok, original payload never delivered) held with no
  counterexample.
- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **45 passed** across 8 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests).
- `pnpm build` → typecheck clean, production build succeeded.

## A4 — Simulated channel (`src/channel/channel.ts`)

Record of the two open design points this task resolves, the impairment model,
and verification for properties P4 (requirement 3.1) and P5 (requirement 3.3),
plus the collision example (requirement 3.2).

### Decisions on the open design points

- **Open point 3 — collision definition:** a send occupies the **half-open**
  airtime interval `[sendTime, sendTime + airtime)`. Two frames collide when their
  intervals **strictly overlap** (`a.start < b.end && b.start < a.end`). Frames
  that merely touch at an endpoint (one ends exactly where the next begins) do
  **not** collide. A collided frame is delivered to neither party and surfaces a
  `collision` to both (requirement 3.2). Sends without an explicit airtime use
  `DEFAULT_AIRTIME = 1`, so distinct integer send times never spuriously collide
  while identical send times do.
- **Open point 4 — channel event time unit:** the channel works directly in the
  engine's **integer sim-time unit**. `sendTime`, `airtime`, the profile's delays
  and the emitted `simTime` are all in that one unit; nothing is converted at the
  transport boundary. A channel event can therefore be appended to the engine log
  as-is (requirement 5.1) and the Séance reads one consistent timeline.

### Impairment model

- **Profile:** `{ minDelay, maxDelay, dropProb, bitFlipProb }` (delays in sim-time
  units, probabilities in [0, 1]).
- **Determinism (P4):** all randomness comes from the A1 PRNG seeded by the run's
  seed. Sends are processed in a stable order (`sendTime`, then original index);
  collisions are decided first from send geometry alone (no PRNG draw), so adding
  or removing a collision never shifts the impairment stream of the surviving
  frames. For each surviving send the draws happen in a fixed sequence: drop, then
  delay (uniform integer in `[minDelay, maxDelay]`), then one draw per payload bit
  for flips. The emitted list is sorted by `(simTime, sender, recipient, kind)`.
- **Outcomes:** a dropped frame emits nothing; a frame with any flipped payload bit
  emits `garbled` (modelled end-to-end via frame/parse so a bad CRC never delivers
  a repaired payload, requirement 1.2); an intact frame emits `received` with the
  recovered payload at `sendTime + delay` (≥ `sendTime + minDelay`, so P5 holds;
  dropped/collided frames satisfy the bound vacuously).

### Verification (commands run and observed)

- `pnpm test --run src/channel/channel.prop.test.ts` → **2 passed** (P4 and P5),
  no counterexample.
- `pnpm test --run src/channel/channel.test.ts` → **8 passed** (collision to both
  with no delivery; half-open touching boundary does not collide; three-way
  overlap; clean delivery; default-airtime non-collision; identical-time
  collision; drop; garble).
- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **55 passed** across 10 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests).
- `pnpm build` → typecheck clean, production build succeeded.

## A5 — Transport interface + loopback + scripted (`src/transport/`)

Record of the transport-boundary decisions and verification for the one
`Transport` interface (requirement 4.1) and the transport-level half-duplex
state (requirement 2.3). All impairment behaviour is inherited from the A4
seeded channel, so the transports add no new randomness.

### Files

- `src/transport/types.ts` — the `Transport` interface: `send(frame)`, `on(listener)`
  (event emitter), `mode` (`idle | transmitting`) and `close()`. `TransportEvent`
  is exactly the A4 `ChannelEvent` shape `{ kind, simTime, sender, recipient,
  payload? }`, so a listener appends it to the engine log unchanged (requirement
  5.1, delivered fully in A6).
- `src/transport/halfduplex.ts` — shared, pure `HalfDuplexState` + `ListenerRegistry`.
  The half-duplex rule (requirement 2.3) is defined once here and composed by both
  transports, so it is testable without audio or `BroadcastChannel`.
- `src/transport/scripted.ts` — solo-partner transport. Pure core `runScripted`
  runs the partner schedule + local sends through `runChannel` once; deterministic.
- `src/transport/loopback.ts` — two-tab transport over `BroadcastChannel`. Pure
  core `resolveInbound` decides one inbound send's outcome through `runChannel`.

### Transport-boundary decisions

- **Airtime source (A4/B1 boundary).** The real FSK sample length arrives in B1.
  Until then transports use a nominal carrier airtime `NOMINAL_AIRTIME = 4`
  sim-time units (overridable per frame), chosen `> 1` so a local send and a
  near-simultaneous partner/inbound send can realistically collide and so the
  half-duplex transmit window is wide enough to suppress an inbound delivery
  landing one unit after a send. This is a placeholder: B1/C1 will supply real
  airtime from the modulated sample count and this constant will be replaced,
  with the change and its effect recorded here.
- **`BroadcastChannel` test double.** `BroadcastChannel` is not available in
  Node/Vitest, so the loopback transport takes its channel via a
  `BroadcastChannelLike` interface (`postMessage`, `onmessage`, `close`). The
  tests inject a minimal in-memory double (`Bus` + `FakeBroadcastChannel`) that
  fans a posted message out to every *other* channel on the same bus — mirroring
  the browser's "not echoed to self" behaviour — so the channel core is exercised
  with no DOM.
- **Loopback determinism without shared mutable PRNG.** Two tabs cannot share a
  single advancing PRNG. Each send carries a monotonic per-sender `seq`; the
  receiver derives a per-send seed from `(runSeed, senderId, seq)` via FNV-1a and
  runs that single send through `runChannel`. The outcome therefore depends only
  on data both tabs agree on, never on cross-tab arrival order. Collisions are
  detected locally from the receiver's own on-air sends (requirement 3.2).
- **Half-duplex at the transport level (requirement 2.3).** A device entering a
  send is `transmitting` for the half-open window `[sendTime, sendTime + airtime)`
  (matching the A4 collision definition). An inbound `received`/`garbled` outcome
  landing inside that window is suppressed (not decoded); a `collision` is always
  surfaced because it is the defined outcome of overlapping transmissions and must
  reach both parties.

### Verification (commands run and observed)

- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **74 passed** across 12 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests). New:
  `src/transport/scripted.test.ts` (9) and `src/transport/loopback.test.ts` (10)
  — Req 4.1 (both implement the one interface and emit `received | garbled |
  collision`) and Req 2.3 (transmit window suppresses inbound decode; collision
  still surfaced) both pass, plus determinism of the pure cores.
- `pnpm build` → typecheck clean, production build succeeded (36 modules).

## A6 — Engine integration + replay (`src/engine/channel-log.ts`)

Record of the boundary/adapter decision and verification for requirement 5.1
(one transport event → exactly one appended engine event) and property P6
(requirement 5.2: replay reaches the same state, touches no transport).

### Boundary / adapter decision

- **Where the mapping lives.** The channel→engine mapping is a small engine-side
  adapter, `src/engine/channel-log.ts`, not a change to the existing reducer,
  `audience.ts`, `scenario.ts` or `types.ts` (all left untouched). The existing
  `SimEvent`/reducer models the *scripted* timeline; channel outcomes are a new,
  separate event kind, so adding them as a new pure append-only log keeps current
  behaviour unchanged while still satisfying requirement 5 "the engine understands
  the event the transport emits".
- **Import direction preserved (`transport -> modem/channel -> engine`).** The
  adapter imports **nothing** from `transport/`, `channel/` or `modem/`. It
  declares its own local structural type `ChannelOutcome`
  (`{ kind, simTime, sender, recipient, payload? }`). The channel's `ChannelEvent`
  and the transport's `TransportEvent` are structurally assignable to it, so a
  transport listener hands its event straight to `appendChannelEvent` with no
  reshaping. That assignability is pinned by a compile-time check in
  `replay-channel.test.ts` (type-only imports, in a test file — production code
  stays one-way).
- **Exactly one entry per outcome (Req 5.1).** `appendChannelEvent(log, event)`
  returns a new log with one appended `ChannelLogEntry` carrying the four fields
  the requirement names — `outcome`, `simTime`, `sender`, `recipient` — plus a
  defensive **copy** of the recovered payload on (and only on) a `received`
  outcome. `garbled` and `collision` never carry a payload, even if one is present
  on the input.
- **Replay (Req 5.2 / P6).** `replayChannelLog(events)` folds the outcomes through
  `appendChannelEvent` from the empty log. Pure and append-only: same outcomes in
  the same recorded order → equal final log, and it reads only the plain outcome
  objects, so it calls no transport. The property test holds a transport test
  double whose every method throws; replay never invokes it.

### Verification (commands run and observed)

- `pnpm test --run src/engine/replay-channel.test.ts src/engine/replay-channel.prop.test.ts`
  → **14 passed** (9 example + 5 property). P6 (determinism of channel-event
  replay; one entry per outcome; order preserved; payload only on `received`;
  transport never touched) held with no counterexample.
- `pnpm typecheck` → clean (includes the compile-time boundary assertion that
  `ChannelEvent`/`TransportEvent` fit `ChannelOutcome`).
- `pnpm test` (full suite) → **88 passed** across 14 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests), untouched.
- `pnpm build` → typecheck clean, production build succeeded (36 modules).

## B1 — FSK modulate/demodulate (`src/modem/fsk.ts`)

Record of the DSP parameters and verification for property P3 (requirement 2.1):
a noise-free modulate→demodulate round-trip recovers the identical frame at both
supported sample rates.

### Line code

- **Binary FSK, continuous phase.** One bit per symbol. A `1` bit is the mark
  tone, a `0` bit the space tone. A single phase accumulator advances every sample
  by the current tone's per-sample radian step, so the waveform stays continuous
  across symbol boundaries (CPFSK / AFSK, as Bell 202 does) — no click, no
  spectral splatter when the tone switches.
- **Bit order:** most-significant bit first within each byte, matching the frame
  header description in `frame.ts`. `0xAA` (`10101010`) therefore modulates as a
  clean alternating mark/space run, which is exactly what the preamble needs for
  clock recovery.

### Chosen parameters (from modem steering — unchanged, no measurement-driven change needed)

- **Mark tone:** 1200 Hz (carries `1`).
- **Space tone:** 2200 Hz (carries `0`).
- **Baud:** 150 symbols/sec.
- **Amplitude:** 0.75 peak (headroom below full scale).
- **Samples per symbol** = `round(sampleRate / baud)`:
  - 44.1 kHz → **294 samples/symbol**.
  - 48 kHz → **320 samples/symbol**.
  Both windows hold many cycles of each tone, so the per-symbol Goertzel energy of
  the two tones separates unambiguously and the noise-free round-trip is exact at
  both rates. **No change was made to the starting tones/baud** — the steering
  values round-trip cleanly, so there was nothing to tune for P3. (Any tuning for
  the noisy trial happens in B2 and will be logged there with its bit-error rate.)

### Demodulation

- **Per-symbol detection:** Goertzel energy at the mark and space bins over each
  symbol window; the bit is the tone with greater energy (mark ≥ space → `1`).
  Only the two tone bins are computed per symbol, so it is cheaper than a full FFT.
- **Clock recovery from the preamble (resolves design open point 1 for the DSP
  side):** the first-symbol sample offset is unknown (acoustic lead-in), so the
  demodulator scans every candidate offset across one symbol and picks the one
  whose decoded leading bits best match the known `preamble + sync` prefix
  (16-bit `0xAA 0xAA` preamble + `0x2D 0xD4` sync word, both fixed in A3 and left
  unchanged here). It stops early on a perfect prefix match. From that locked
  offset it reads the length byte, then payload + CRC, clamped to the available
  samples so a garbage length never reads past the buffer (it surfaces as a
  `parse` failure instead). `parse` from `frame.ts` then validates sync and CRC.

### Scope / boundaries

- `src/modem/fsk.ts` added; no edits to `engine/`, `crc.ts`, `frame.ts`,
  `types.ts`, `scenario.ts`, `audience.ts`, `reducer.ts`.
- Pure functions over `Float32Array` / `Uint8Array`: no DOM, no audio hardware, no
  randomness (`Math.random`/`Date.now` not used). The AudioWorklet shell is task
  C1.

### Verification (commands run and observed)

- `pnpm test --run src/modem/fsk.test.ts src/modem/fsk.prop.test.ts`
  → **9 passed** (8 example + 1 property). P3 (noise-free round-trip for any
  0–64-byte payload at both 44.1 kHz and 48 kHz, end-to-end through the real
  `frame()` layout) held with no counterexample. Example tests cover: samples/
  symbol arithmetic (294/320), amplitude bounds, mark/space tone dominance per
  symbol, continuous phase across a mark→space boundary, a known short frame
  round-trip, an empty-payload frame, and clock lock despite a half-symbol silent
  lead-in.
- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **97 passed** across 16 files; the existing
  `src/engine/engine.test.ts` suite stayed green (11 tests).
- `pnpm build` → typecheck clean, production build succeeded (36 modules,
  `dist/assets/index-*.js` 154.95 kB / 49.89 kB gzip).

## B2 — Noise-tolerance trial (`src/modem/fsk.noise.test.ts`)

Record of the measured recovery rate for requirement 2.2 (≥95% frame recovery at
≥12 dB SNR over a 200-frame seeded trial).

### Method

- **Frames:** 200 per run. Payload length is 1–16 bytes, and the bytes are drawn
  from the seeded PRNG (`src/channel/prng.ts`, seed `0xB2`). No `Math.random` or
  `Date.now`.
- **Path:** `frame` → `modulate` → add noise → `demodulate` → `parse`. A frame
  counts as recovered only if `parse` returns `ok` with a payload identical to the
  input.
- **Noise:** white Gaussian noise (Box-Muller over the same PRNG), added at the
  sample rate. SNR is the mean power of the modulated burst divided by the noise
  variance, so the noise covers the whole 0 to fs/2 band and is not filtered
  to the tone band.
- **Bit-error rate (BER):** demodulated frame bits compared with the transmitted
  frame bits, before CRC. A missing byte counts as all 8 bits wrong.
- **Assertion:** recovery ≥ 95% at 12 dB at both 44.1 kHz and 48 kHz. A third test
  checks that two runs with the same seed give identical results.

### Measured results (seed `0xB2`, run via `pnpm vitest --run src/modem/fsk.noise.test.ts`)

| Sample rate | SNR | Recovered | Recovery rate | BER |
| --- | --- | --- | --- | --- |
| 44.1 kHz | 12 dB | 200/200 | 100.0% | 0 (0/25024 bits) |
| 48 kHz | 12 dB | 200/200 | 100.0% | 0 (0/24712 bits) |

Requirement 2.2 is met with the starting parameters.

### Margin check (informational, not asserted)

I ran the same 200-frame trial at lower SNR with a temporary script, since deleted,
to see how much margin there is.

| Sample rate | SNR | Recovered | BER |
| --- | --- | --- | --- |
| 44.1 kHz | 9, 6, 3, 0 dB | 200/200 at each | 0 at each |
| 48 kHz | 9, 6, 3, 0 dB | 200/200 at each | 0 at each |

### Tuning log

| Change | Parameter | BER result |
| --- | --- | --- |
| None | mark 1200 Hz, space 2200 Hz, 150 baud, preamble 16 bits, sync `0x2D 0xD4` | 0 at 12 dB, both rates |

No tuning was done, because the starting values already pass with no bit errors.
I did not change tones, baud or sync, so there is no before/after BER to report.

### Limits of this result

- This is a simulated, full-band white-noise channel. Real speaker-to-microphone
  paths add room reverb, band-limiting, clock drift and non-white noise. Those
  are covered by the manual checks in C3, not by this trial.
- Noise-free alignment in this trial starts at sample 0. Clock recovery with a
  silent lead-in under noise has not been measured here.

### Verification (commands run and observed)

- `pnpm vitest --run src/modem/fsk.noise.test.ts` → **3 passed**.
- Full `pnpm typecheck`, `pnpm test`, `pnpm build` results are listed below.
- `pnpm typecheck` → clean.
- `pnpm test` (full suite) → **100 passed** across 17 files; `src/engine/engine.test.ts` unchanged and green.
- `pnpm build` → typecheck clean, production build succeeded.

## Skeleton: workspace baseline and root scripts (task 1.1)

### Baseline test count (re-measured before any change)
`pnpm test` in the flat repo → **100 passed, 17 files**. This is the floor for every later skeleton task.

### What was added
- `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `tsconfig.base.json` (the strict options); root `tsconfig.json` now extends it and still typechecks `src`.
- Root scripts renamed to `test:flat`, `typecheck:flat`, `build:flat`. Root `test`, `typecheck`, `build` run the flat script, then `pnpm -r --filter "./packages/*" --filter "./apps/*" <script>`. `test` also runs `test:tooling`.
- `test:tooling` is `vitest run --config vitest.tooling.config.mjs`, not `vitest run --dir scripts` as the task text says. The root Vite config only includes `src/**`, so `--dir scripts` found no files and exited 1. The separate config includes `scripts/**/*.test.mjs` and keeps tooling tests out of the flat count.
- `scripts/workspace.test.mjs` (5 tests): workspace globs, recursive filter on all three scripts, `test:tooling` folded into `test`, flat script runs first, no `--no-bail` or `|| true`.

### Behavior with no matching packages
`pnpm -r --filter "./packages/*" --filter "./apps/*" test` with no `packages/` or `apps/` folder prints "No projects matched the filters" and exits **0** (pnpm 10.33.2). No `--if-present` or other workaround is needed, so none was added. Once packages exist, a failing package makes `pnpm -r` exit non-zero.

### Manual negative run
No shell package exists yet (task 1.2 creates them), so the negative run used the tooling path: a temporary `scripts/zz-negative.test.mjs` with a failing assertion. Root `pnpm test` → `1 failed | 5 passed`, **exit 1**. The file was deleted and `pnpm test` returned to exit 0. The negative run through a package shell was deferred to task 1.2 and is recorded below (done).

### Verification (commands run and observed)
- `pnpm typecheck` → exit 0.
- `pnpm test` → flat 100 passed (17 files); recursive step matched no projects; tooling 5 passed (1 file); exit 0.
- `pnpm build` → flat build succeeded; recursive step matched no projects; exit 0.
- Total tests now: 105 (100 flat + 5 tooling), 18 files.

## Skeleton: package shells (task 1.2)

### What was added
- `packages/hindsight`: `package.json` (exports `.` and `./replay`, optional `react` peer, `build` = `tsc --noEmit`), `tsconfig.json` (`lib: ["ES2021"]`, no DOM), `src/index.ts` (`export {}`), `src/replay/index.ts` (stub), `vitest.config.ts`, one smoke test. The kit needs its own vitest config: without one, vitest walks up to the root Vite config and fails on the root `setupFiles` path.
- `apps/dead-air` and `apps/night-desk`: `package.json` with `hindsight: workspace:*` (react, vite, vitest, fast-check at the versions the root already uses), `tsconfig.json`, `vite.config.ts` (`base` `/dead-air/` and `/night-desk/`), placeholder `index.html` and `src/main.tsx`, one smoke test importing `hindsight`.
- Root `devDependencies` gained `hindsight: workspace:*` (temporary bridge, removed in 2.5). `pnpm install` added 87 lines to `pnpm-lock.yaml`.
- `scripts/workspace.test.mjs` now has 6 tests; the new one checks each of the three folders has its own `package.json` with `test`, `typecheck`, `build`.
- The root vite config still includes only `src/**/*.test.*`, so the flat run does not pick up `apps/` or `packages/` tests (flat count unchanged at 100).

### Deferred negative run from 1.1 (done)
Added a temporary `apps/night-desk/src/zz-negative.test.ts` with `expect(1).toBe(2)`. Root `pnpm test` → night-desk `1 failed`, `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`, **exit 1**. Deleted the file; root `pnpm test` → **exit 0**.

### Verification (commands run and observed)
- `pnpm typecheck` → exit 0 (flat plus three packages).
- `pnpm test` → flat 100 passed (17 files); kit 1, dead-air 1, night-desk 1; tooling 6 passed; exit 0.
- `pnpm build` → exit 0; both apps built to `apps/*/dist` (gitignored).
- Total tests now: 109 (100 flat + 3 shell smoke + 6 tooling).


## Skeleton: channel decoupled from the frame module (task 2.1)

- Added `src/channel/channel.golden.test.ts`: 3 seeds (1, 20261204, 4294967295) x 2 profiles (`mild`, `harsh`) over one 8-send list (payloads of 0, 1, 5, 9, 17, 33, 48, 64 bytes; one colliding pair). Expected event lists (kind, simTime, sender, recipient, payload hex) were generated by running the unchanged code, and the test passed on unchanged code before any edit. The vectors cover `received`, `garbled` and `collision`.
- `src/channel/channel.ts` no longer imports `../modem/frame`. `parse(frame(bytes))` became `bytes.slice()`. The golden test passes with identical vectors.
- Equivalence check (temporary test, deleted): for every payload length 0 to 64, `parse(frame(b))` returned `ok` with a payload equal to `b` and in a different buffer, the same as `b.slice()`.
- Garbled path: unchanged. It never called `frame` or `parse` (a flipped bit only sets `corrupted`), so it behaves the same.
- **One behavioural difference, reported not hidden:** a payload over 64 bytes on a send that survives drop, collision and corruption used to throw `PayloadTooLargeError` from `frame`. It is now delivered as a copy. Dropped, collided and corrupted sends never threw, so they are unchanged. Nothing in the repo relies on the throw (searched `src/channel`, `src/transport`, `src/ui`). The 64-byte limit stays enforced by `frame` on the modem side; the channel no longer enforces it.
- The word "modem" is gone from comments in `channel.ts`, `channel-log.ts` and `prng.ts`. The constants in `channel.prop.test.ts` are now `p1` to `p4` (generators and assertions unchanged).
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0 with flat 106 passed (18 files), kit 1, dead-air 1, night-desk 1, tooling 6, total 115; `pnpm build` exit 0.

## Skeleton: generic participants, scenario out of the engine (task 2.2)
- `src/engine/types.ts`: added `ParticipantId = string`; `RoleId` is now an alias of it; `Audience` is `ParticipantId | "all"` (comment: `"all"` is reserved); `Scenario.decisionPrompts` is `Record<ParticipantId, ...>`. Types only, no runtime change.
- Moved with `mv`: `src/engine/scenario.ts` to `src/scenarios/static-on-channel-9.ts` (same exports; only its `./types` import became `../engine/types`) and `src/engine/engine.test.ts` to `src/scenarios/engine.test.ts`. Diff against the original shows only the four import lines changed (`./audience`, `./reducer`, `./scenario`, `./types`); assertions and test names are untouched. `src/ui/App.tsx` import updated; it was the only other importer.
- Added `src/engine/fixtures/three-party.ts` (ids `p1`, `p2`, `p3`) and `src/engine/reducer.generic.test.ts` (7 tests over `reduce`, `replay`, `eventsForRole`, `buildDebrief`).
- Remaining word hits in `src/engine` (gaps for 2.3+): `replay-channel.test.ts` and `replay-channel.prop.test.ts` still use `dispatch`/`field` as participant ids (task 2.1 only cleaned `src/channel`); `reducer.ts` has "dispatches" as an ordinary verb in a comment; `channel-log.ts` has "fields" as an ordinary noun. No hits for resident, booth, modem, tower or "Channel 9". `src/engine` holds no scenario content.
- Behaviour changes: none. `RoleId` is wider at compile time only.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0 with flat 113 passed (19 files; 106 + 7 new), kit 1, dead-air 1, night-desk 1, tooling 6, total 122; `pnpm build` exit 0. All original `engine.test.ts` tests pass.
## Skeleton: engine and channel moved into the kit (task 2.3)
- Moved with plain `mv`: `src/engine` to `packages/hindsight/src/engine` and `src/channel` to `packages/hindsight/src/channel`, tests, `fixtures/` and the golden test included (golden vectors untouched). The `mv` of the second directory was run as a standalone command after a chained attempt was blocked.
- `packages/hindsight/src/index.ts` exports by name the engine and channel rows of the design table that exist today (types, channel log, reducer and debrief, audience helpers, `Prng`/`createPrng`, `runChannel`, `DEFAULT_AIRTIME`, channel types). It also exports the type names `ChannelOutcomeKind`, `Debrief`, `DebriefRow`, `MessageTiming`, which the flat UI and tests need. Clock, ledger, loss-source and schema items arrive in 3.x and 5.x.
- Flat code (`src/modem`, `src/transport`, `src/ui`, `src/scenarios`) now imports `hindsight`. No config change was needed: the root `hindsight` bridge symlink plus the kit's `exports` (to `./src/index.ts`) resolves in Vite, Vitest and `tsc` (Bundler).
- Kit tests: `replay-channel*.test.ts` participant ids `dispatch`/`field`/`base`/`stage` became `p1` to `p4`. The compile-time `TransportEvent` line moved to `src/transport/outcome-fit.test.ts`, which needed one runtime `it` to be a valid test file (+1 test). The kit's smoke test was updated because it asserted an empty core entry.
- Kit grep: no import from react, react-dom, DOM or audio globals, and no import outside the kit.
- Counts. Before (flat 113, 19 files): channel 28 (golden 6, prop 2, channel 8, prng prop 6, prng 6), engine 21 (reducer.generic 7, replay-channel prop 5, replay-channel 9), modem 32, scenarios 11, transport 19, ui 2. After: flat 65 (12 files) = 113 - 49 moved + 1 new; kit 50 (9 files) = 49 moved + smoke; dead-air 1; night-desk 1; tooling 6; total 123. Test-name diff before vs after: none lost; new are `outcome-fit` (1) and the kit smoke (already counted among the 3 shells). Total is 122 + 1 for the outcome-fit test.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0; `pnpm build` exit 0.
## Skeleton: modem and transport moved into Dead Air (task 2.4)
- Moved with plain `mv`, one standalone command each (a first attempt that also ran `mkdir` was blocked): `src/modem` to `apps/dead-air/src/modem` and `src/transport` to `apps/dead-air/src/transport`, with `fsk.noise.test.ts`, `halfduplex.ts`, loopback, scripted and `outcome-fit.test.ts`. No file content changed.
- Imports: the channel and PRNG imports in `transport/` and `fsk.noise.test.ts` already read `hindsight` after 2.3, so no import edit was needed. No kit export was added (`createPrng`, `Prng`, `runChannel`, `DEFAULT_AIRTIME`, channel types all existed).
- Flat code repoint: none needed. `src/ui`, `src/scenarios` and `src/main.tsx` do not import modem or transport.
- `apps/dead-air/vite.config.ts` already had the test block (node environment, include `src/**/*.test.{ts,tsx}`); `fast-check` ^4.10.2 is already in the app's devDependencies, same as root. No `pnpm install`, no network. The app smoke test is kept.
- Kit check: no `modem` folder under `packages/`, no `modem` string or relative path out of the kit in `packages/hindsight/src`.
- Counts. Before: flat 65, kit 50, dead-air 1, night-desk 1, tooling 6 = 123. After: flat 13 (scenarios 11, ui 2), kit 50, dead-air 53 (52 modem and transport tests plus the smoke test), night-desk 1, tooling 6 = 123. Test names of modem and transport are identical before and after (only the timing suffix of the verbose output differs). None lost.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0; `pnpm build` exit 0.
- Remaining gap (outside 2.4, not touched): `packages/hindsight/src/channel/channel.test.ts` may still use `dispatch`/`field` participant ids instead of `p1` to `p4`.
## Skeleton: prototype UI, scenarios and entry moved; root `src/` removed (task 2.5)
- Moved with plain `mv`, one command each: `src/ui`, `src/scenarios`, `src/main.tsx` and root `index.html` into `apps/dead-air/` (the shell placeholder `main.tsx` and `index.html` were replaced). The entry script path `/src/main.tsx` is relative to the app root, so it needed no edit. No import specifier changed in the moved files.
- `apps/dead-air/vite.config.ts` keeps `base: "/dead-air/"` and gains `globals: true`, `setupFiles: ["./src/ui/test-setup.ts"]` (jsdom stays opt-in per file by docblock, node by default). `apps/dead-air/tsconfig.json` gains `types: ["vitest/globals"]`. `apps/dead-air/package.json` gains Testing Library (3) and jsdom. React, react-dom, `@types/react*`, `@vitejs/plugin-react`, `vite`, `fast-check` were already in both apps; night-desk is unchanged (shell needs nothing more); the kit has React only as an optional peer.
- Removed: root `src/` (a stray `.DS_Store` was deleted first), root `vite.config.ts`, root `tsconfig.json` (its only content was `include: ["src"]` and vitest globals; nothing at the root is type-checked now), the `*:flat` scripts, `dev`, `preview`, `test:watch`, the root `hindsight` bridge, and root React, Testing Library, jsdom, plugin-react, `@types/react*`, `vite`, `fast-check`. Root keeps `typescript` and `vitest` (needed by `test:tooling`). `pnpm install` refreshed the lockfile; `pnpm install --frozen-lockfile` exits 0.
- Root scripts: `test` = recursive test, then `test:tooling`; `typecheck` = recursive; `build` = recursive build, then `node scripts/interim-dist.mjs`.
- **Interim `dist/` for `vercel.json` (choice reported):** Dead Air builds with base `/dead-air/`, so a plain copy of `apps/dead-air/dist` to `dist/` would request `/dead-air/assets/...` from a site served at `/` and 404. `scripts/interim-dist.mjs` instead rebuilds the same app into root `dist/` with `--base / --outDir ../../dist --emptyOutDir`. Checked: `dist/index.html` references `/assets/index-*.js` and `.css`, both present. It is a second Vite build, not a file copy. Task 6.1 replaces it. Tooling test: `scripts/interim-dist.test.mjs` (1 test, checks the arguments only; the real output was checked by hand as above).
- **engine.test.ts diff** (`git show HEAD:src/engine/engine.test.ts` against `apps/dead-air/src/scenarios/engine.test.ts`): only import lines differ (lines 2, 10 to 12: `./audience`, `./reducer`, `./types` became `hindsight`; `./scenario` became `./static-on-channel-9`). No assertion or test name differs.
- **Counts.** Baseline 100 + 1.1 (5 tooling) + 1.2 (3 shell smoke tests + 1 tooling) + 2.1 (6 golden) + 2.2 (7 generic) + 2.3 (1 outcome-fit) = 123. 2.5 adds 2 tooling tests (the flat-scripts test became "no flat scripts, bridge or root src" plus "interim build step", +1; `interim-dist.test.mjs`, +1) = **125**. Per package: kit 50 (9 files), dead-air 66 (13 files: 53 modem, transport and smoke + 11 scenarios + 2 ui), night-desk 1, tooling 8 (2 files). 50 + 66 + 1 + 8 = 125. The 2.4 total (123) is unchanged by the move itself.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0 (kit 50, night-desk 1, dead-air 66, tooling 8); `pnpm build` exit 0 (both apps, then root `dist/`); `pnpm install --frozen-lockfile` exit 0; no root `src/`.
- Not touched (outside 2.5): `README.md` line 29 still says the code lives in `src/`.
## Skeleton: simulated clock (task 3.1)
- Added `packages/hindsight/src/channel/clock.ts` (`createClock(start = 0)`, `now`, `advance`, `advanceTo`, type `SimClock`), exported from the kit's `index.ts`. Time is the engine's integer sim-time unit; no wall clock, no randomness, no DOM. `RangeError` on a negative or non-integer advance, on `advanceTo` into the past or to a non-integer, and on a non-integer start; the clock does not move when it throws.
- Tests: `clock.test.ts` (5 examples) and `clock.prop.test.ts` (1 test, `numRuns: 100`, tagged `Feature: skeleton, Property 1`). `index.test.ts` does not assert the export list, so it is unchanged.
- Counts. Before: kit 50, dead-air 66, night-desk 1, tooling 8 = 125. After: kit 56 (11 files), dead-air 66, night-desk 1, tooling 8 = 131.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0; `pnpm build` exit 0.
## Skeleton: ledger (task 3.2)
- `id?: string` added to `ChannelSend`, `ChannelEvent`, `ChannelOutcome`, `ChannelLogEntry`, copied only when present; the golden test and existing deep-equal tests are unmodified and pass.
- Added `ledger/ledger.ts` (`buildLedger`, `knownAt`, `inTransitAt`, `orphanOutcomes`, types `LedgerEvent`, `Ledger`) and `ledger/from-channel.ts` (`ledgerFromChannel`), exported from `index.ts`. `ledger/` imports only `engine`; `ledgerFromChannel` reads `ChannelLog`, so no channel type is needed.
- Readings chosen: `inTransitAt(l, p, t)` lists messages whose recipient is `p`; a dropped message has no outcome and stays in transit; an outcome with no `sent` event is counted by `orphanOutcomes` and never known; log entries without an `id` are skipped by `ledgerFromChannel`.
- Tests: `ledger.test.ts` (8) and `ledger.prop.test.ts` (Properties 2, 3, 4, `numRuns: 100` each).
- Counts. Before: kit 56, dead-air 66, night-desk 1, tooling 8 = 131. After: kit 67, dead-air 66, night-desk 1, tooling 8 = 142.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0.
## Skeleton: participants are generic (task 3.3)
- Added `packages/hindsight/src/participants.prop.test.ts` (Property 5, `numRuns: 100`, tagged `Feature: skeleton, Property 5`) and the fixture builder `engine/fixtures/participants.ts` (`buildParticipantsFixture`), which throws on id `"all"` and on duplicate ids. The empty string is allowed: the kit treats ids as opaque. Ids include unicode, `""`, `"__proto__"`, `"constructor"`, `"toString"`.
- Checked now: `eventsForRole`, `reduce`, `replay` (order independent), `buildDebrief` and the ledger's `knownAt`. The validator part is added in 5.1 (comment in the test).
- Finding fixed: `buildDebrief` read `decisionPrompts[d.role]` directly, so a decision from a participant without a prompt and named `"constructor"` resolved to `Object.prototype.constructor` and threw. It now reads own keys only (`engine/reducer.ts`). Covered by an example test. No assumption of two participants or fixed ids was found elsewhere (reducer, audience and ledger use `Map`, sets and comparisons only).
- Counts. Before: kit 67, dead-air 66, night-desk 1, tooling 8 = 142. After: kit 71 (3 example tests, 1 property), dead-air 66, night-desk 1, tooling 8 = 146.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` (see session output).
## Skeleton: loss-source interface (task 3.4)
- `channel/channel.ts` gains `Impairment`, `LossSource` and `profileLoss`; `runChannel(seed, loss, sends)` takes a `ChannelProfile` or a `LossSource` and wraps a profile with `profileLoss` (draw order unchanged: drop, delay, per-bit flips). The doc block above `Impairment` is the one documented interface. A negative, non-integer or NaN delay from a source throws `RangeError` naming the send id. Collided sends are not assessed. Exported from `index.ts`.
- `channel.golden.test.ts`, `channel.prop.test.ts` and `channel.test.ts` are untouched (sha1 checked before and after) and pass.
- Tests: `loss-source.test.ts` (6: profile equals `profileLoss`, busy-source drops, delay-source, corrupted gives garbled, RangeError, collided sends not assessed) and `loss-source.prop.test.ts` (4 properties, `numRuns: 100`, tagged `Feature: skeleton, Property 6`).
- Counts. Before: kit 71, dead-air 66, night-desk 1, tooling 8 = 146. After: kit 81 (16 files), dead-air 66, night-desk 1, tooling 8 = 156.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0.
## Skeleton: import-boundary check (task 4.1)
- Added `scripts/boundaries/check.mjs` (pure `checkBoundaries(files)`), `run.mjs` (prints `file:line specifier rule`, exits 1 on any violation or unreadable file), root script `check:boundaries` (first step of root `test`) and a `pnpm check:boundaries` step in `ci.yml` before `pnpm test`. `fast-check` ^4.10.2 added as a root devDependency (it was not resolvable from the root); `pnpm install --offline` sufficed, no network use.
- First run on the real workspace found 16 violations: README.md 7 (resident), 21 and 48 (modem); `channel/channel.ts` 2 (Dead Air), 4 (acoustic), 10 and 159 (Math.random), 10 (Date.now); `channel/prng.ts` 2 (Dead Air), 5 (Math.random, Date.now); `engine/types.ts` 27 (dead air); folder direction in `engine/replay-channel.test.ts` 9, `ledger/ledger.prop.test.ts` 3 and 4, `ledger/ledger.test.ts` 2 (imports of `../channel/channel`).
- Fixed in comments, README text and test import paths only (the tests now import `runChannel` and types from `../index`). No rule changed, no behaviour changed, no test ID renamed, no assertion changed. README now says where the code lives instead of `src/`.
- Tests: `check.test.mjs` (18) and `check.prop.test.mjs` (Properties 7 and 8, 3 properties, `numRuns` 100 to 200, tagged `Feature: skeleton, Property N`). `workspace.test.mjs` unchanged and passing.
- Counts. Before: kit 81, dead-air 66, night-desk 1, tooling 8 = 156. After: kit 81, dead-air 66, night-desk 1, tooling 29 = 177.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` all exit 0.
## Skeleton: separate replay entry (task 4.2)
- Added `replay/layout.ts` (pure `layoutReplay(ledger, scenario)`: rows follow `scenario.roles`, log-only participants appended; ticks for decision events and for knowledge gained, i.e. `learned` events and `received` outcomes, sorted by sim-time, then decision before knowledge, then id; Maps only, so ids like `constructor` are safe), `ReplayView.tsx` (SVG, one `tabIndex=0` `listitem` row per participant, text labels and `<title>` per tick) and `replay/index.ts`.
- `tsconfig.json` (core, `lib: ES2021`, no DOM) now excludes `src/replay`; `tsconfig.replay.json` adds `DOM` and `jsx` and covers all of `src`. Kit `typecheck` and `build` run both. `react` stays an optional peer dependency; `react`, `react-dom`, their types, `@testing-library/react` and `jsdom` were added as kit devDependencies at the dead-air versions. Vitest stays `node`; `ReplayView.test.tsx` uses the jsdom docblock.
- Kit tests that touch the replay folder live in `src/replay/` (`entries.test.ts` replaces `src/index.test.ts`) so the core tsconfig never reaches replay files. `core-headless.test.ts` mocks `react` to throw, imports `../index` and compares its 26 export names to a fixed list. `apps/dead-air/src/replay-entry.test.ts` checks that `hindsight/replay` resolves from an app.
- Boundary checker: no rule changed; it passes (67 files).
- Counts. Before: kit 81, dead-air 66, night-desk 1, tooling 29 = 177. After: kit 86, dead-air 67, night-desk 1, tooling 29 = 183.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` all exit 0.
## Skeleton: kit README (task 4.3)
- Added `packages/hindsight/README.md` (what the kit is, the two entries, public API table, loss-source pointer to the doc block above `Impairment` in `channel/channel.ts`, the minimal drill, a marked `scenario-section` slot for 5.4) and `packages/hindsight/examples/minimal-drill.ts` (23 non-blank lines; three participants, one lossy `runChannel` send, one ledger query; returns a result and prints nothing). The README embeds it verbatim in its one `ts` block. With seed 7 the message is dropped; with seed 1 it arrives by time 3.
- The example imports `../src/index` (relative, inside the kit, allowed by the boundary rules); the package name does not resolve from inside the kit. `examples` is added to the core `tsconfig.json` include (no DOM). The boundary checker scans every `README.md`, with the shorter word list; the kit README also avoids the full list.
- Tests (package root, node `fs`, vitest include gains `*.test.ts`): `readme.test.ts` (5) and `minimal-drill.test.ts` (3).
- Counts. Before: kit 86, dead-air 67, night-desk 1, tooling 29 = 183. After: kit 94 (21 files), dead-air 67, night-desk 1, tooling 29 = 191.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (71 files) all exit 0.
## Skeleton: scenario schema and checks (task 5.1)
- Added `engine/scenario-schema.ts` (`validateScenario(unknown)` returns `{ ok: true, scenario }` or `{ ok: false, errors: { path, message }[] }`; hand-written, never throws, reports every error, reads own properties only so `__proto__` keys are plain data) and `engine/scenario-check.ts` (`checkScenario` returns `{ name, ok, details }` for `validates`, `beats-reachable`, `run-ends`, `decisions-have-options`; when `validates` fails the other three report "skipped"). Both are exported from `index.ts`; the pinned list in `replay/core-headless.test.ts` now has 28 names. It validates the existing `Scenario` shape, no second shape and no new dependency.
- Rules chosen where the design left room: `linkedTo` must name an existing event; for `message_delivered` it must name an earlier event (earlier array position, time not later). A `message_created` event may link forward to its delivery, which "Static on Channel 9" does. Option counts and a missing or second debrief are checks, not schema errors.
- "Static on Channel 9" validates and passes all four checks unchanged (test in `apps/dead-air/src/scenarios/scenario-schema.test.ts`, importing from `hindsight`). No scenario data was edited.
- Tests: `scenario-schema.test.ts` (16, example faults and hostile input), `scenario-schema.prop.test.ts` (3; Property 10 with 7 injected faults, `numRuns: 100`), and Property 5 in `participants.prop.test.ts` now also asserts `validateScenario` accepts the generated scenario.
- Counts. Before: kit 94, dead-air 67, night-desk 1, tooling 29 = 191. After: kit 113, dead-air 69, night-desk 1, tooling 29 = 212.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (76 files) all exit 0.
## Skeleton: brief format (task 5.2)
- Added `engine/brief.ts` (`Brief`, `parseBrief`, `printBrief`, plus the `BriefError` and `BriefResult` types), exported from `index.ts`; the pinned list in `replay/core-headless.test.ts` now has 30 names. Errors are `{ line, message }` with 1-based lines, all reported in line order; `parseBrief` never throws. Beyond the design grammar, `\` is escaped as `\\` so any text round-trips; audiences and decision participants must be declared (or `all`). Ids must not contain `: `, and participant names must not contain ` - ` or end with ` -`; the first failed property run found the last case (name `| -`) and the rule is now documented in `docs/scenario-brief.md`.
- Added `docs/scenario-brief.md` (format and one worked example) and `apps/night-desk/scenarios/briefs/example-noise-complaint.md` (invented hall, noise only, a call to the on-call supervisor is an option in both decisions). It is read through a `?raw` import in `apps/night-desk/src/example-brief.test.ts`, which parses and round-trips it, so the kit does not read outside itself.
- Tests: `brief.test.ts` (10, one per error case with its line), `brief.prop.test.ts` (2; Property 9 with `numRuns: 200`, ids such as `__proto__` and `constructor`, text with `|`, `\`, unicode; plus never-throws on arbitrary text). The scenario-from-brief hook fired on the new brief file; producing a scenario file belongs to task 5.3 and was not done here.
- Counts. Before: kit 113, dead-air 69, night-desk 1, tooling 29 = 212. After: kit 125, dead-air 69, night-desk 2, tooling 29 = 225.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (80 files) all exit 0.
## Skeleton: per-app scenario test and hook (task 5.3)
- Added `apps/dead-air/scenarios/scenarios.test.ts` and `apps/night-desk/scenarios/scenarios.test.ts`. Each globs every non-test `.ts` file in its folder (`import.meta.glob`), treats each export as one scenario, and runs `validateScenario` and `checkScenario`; it also parses every file under `briefs/` with `parseBrief`. Both vitest configs now include `scenarios/**/*.test.ts` and both tsconfigs include `scenarios`.
- Dead Air: "Static on Channel 9" data moved to `apps/dead-air/scenarios/static-on-channel-9.ts`; `src/scenarios/static-on-channel-9.ts` re-exports it and still holds the `scenarios` record. `engine.test.ts` is untouched. Brief added at `apps/dead-air/scenarios/briefs/static-on-channel-9.md`; the grammar cannot express `simulationNotice`, `summary`, event ids, `linkedTo`, or `discussionPrompts`, so a scenario regenerated from it would lack those.
- Night Desk has no scenario file yet, only the example brief. Its test checks that the glob finds the brief and that it parses; scenario validation runs on zero files until the hook (or the night-desk spec) adds one.
- Hook `.kiro/hooks/scenario-from-brief.json` now fires on `PostFileSave` (was `PostFileCreate`), so it runs on every save of a brief and uses credits each time. The hook has not been run; nothing is recorded in `KIRO-USAGE.md`.
- `scripts/hooks.test.mjs` (5 tests) checks the hook fields and prompt, and the matcher against both brief paths and 11 non-matching paths. The example-brief round trip stays in `apps/night-desk/src/example-brief.test.ts` because the kit is TypeScript.
- Counts. Before: kit 125, dead-air 69, night-desk 2, tooling 29 = 225. After: kit 125, dead-air 73, night-desk 4, tooling 34 = 236.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (83 files) all exit 0.

## Skeleton: README, adding a third app (task 5.4)

- Filled the marked slot in `packages/hindsight/README.md` (now 112 lines): the brief-to-scenario steps (brief format in `docs/scenario-brief.md`, example brief path, save under `scenarios/briefs/`), the `scenario-from-brief` hook (an agent action that uses credits on each save), the by-hand route (write the scenario file, run `pnpm --filter <app> test`), the shared `scenarios.test.ts`, and a five-line checklist (own folder, `hindsight: workspace:*`, a `LossSource`, a `scenarios/` folder with `scenarios.test.ts`, `pnpm check:boundaries`).
- The section uses no code fence, because `readme.test.ts` requires exactly one fenced block (the embedded example). `readme.test.ts` is unmodified and passes.
- No brief was written and the hook was not run for this task. The steps are documented, not exercised.
- Root `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` all exited 0 ("boundaries: ok (83 files)"). Counts unchanged: kit 125, dead-air 73, night-desk 4, tooling 34 = 236.
## Skeleton: one static site (task 6.1)
- Added `site/index.html` (plain HTML and CSS, no script, no CSS framework): headline, one sentence, a section per app linking `/night-desk/` and `/dead-air/`, and the one-line practice notice. It says plainly that Night Desk has no playable night yet and that Dead Air holds an early prototype. Paper, ink and grey from `design-language.md`, dark appearance via `prefers-color-scheme`, 2 px focus outline, skip link, no animation. No accent red (nothing was lost).
- Fonts: no IBM Plex files and no OFL licence file are in the repo, so the page uses a system font stack that names IBM Plex Sans first. Self-hosting the fonts is a later task; nothing was fetched from the network.
- Added `scripts/site/assemble.mjs`: `assemble(root)` checks the three `index.html` files first and throws naming each missing one (so a failed run leaves the old `dist/` alone), then removes `dist/` and copies `site/`, `apps/night-desk/dist` and `apps/dead-air/dist`. `main(root)` wraps it and returns exit code 1 on failure; the CLI sets `process.exitCode` from it. Root `build` now ends with `node scripts/site/assemble.mjs`.
- Removed (intended by the plan): `scripts/interim-dist.mjs` and `scripts/interim-dist.test.mjs`. `scripts/workspace.test.mjs`: the "interim build step" test became "ends the root build with the site assembly step".
- `vercel.json` unchanged (`outputDirectory: dist`, `buildCommand: pnpm build`); it still fits. Both app Vite configs already set `base` (`/dead-air/`, `/night-desk/`).
- Tests: `scripts/site/assemble.test.mjs` (3 assemble tests on temp directories incl. CLI exit 1, 2 landing page checks).
- Counts. Before: kit 125, dead-air 73, night-desk 4, tooling 34 = 236. After: kit 125, dead-air 73, night-desk 4, tooling 38 = 240 (tooling: -1 interim test, +5).
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (83 files) all exit 0. No server was started.
- `dist/` after `pnpm build`:
  - `dist/index.html`
  - `dist/dead-air/index.html`
  - `dist/dead-air/assets/index-MUg6qZDo.css`
  - `dist/dead-air/assets/index-d5pplOFS.js`
  - `dist/night-desk/index.html`
  - `dist/night-desk/assets/index-aPaDjQtU.js`
- File check: `dist/index.html` links `/night-desk/` and `/dead-air/`; asset URLs in `dist/dead-air/index.html` begin `/dead-air/assets/` (night-desk likewise `/night-desk/assets/`), and each referenced file exists in `dist/`.
## Night Desk: baseline and task 1.1 (attention model)
- Baseline before the task (fresh `pnpm test`): kit 125, dead-air 73, night-desk 4, tooling 38 = 240.
- Added `apps/night-desk/src/model/`: `types.ts`, `attention.ts`, `night.ts`, `replay-input.ts`, `clock-format.ts`, `guide.ts`, `fixtures.ts` (synthetic script) and four example test files (`attention`, `night`, `replay-input`, `guide`). No kit file, spec file or dependency changed. Properties arrive in 7.1 and 7.2.
- Readings chosen where the design is silent: `attentionLossWithReasons` returns the drop reason recorded by the same rules (the design's `explainMiss`); a `LogError` has `kind`, `index` and `message`; an `itemId` on an entry must be a delivered item (`unknown-item`); a log with a different `scenarioId`, `rev` or `seed` is `wrong-script`; a guide step with an empty `done` is satisfied by any entry; `currentStep` returns null when the script is not `guided`.
- Counts after: kit 125, dead-air 73, night-desk 44, tooling 38 = 280.
- Root `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (94 files) all exit 0.

---
# dead-air-mvp: delayed delivery, ordering, reset, keyboard, journey
Run on 2026-11-17 (local, macOS). Commands and observed results only.

## Tests added
- `apps/dead-air/src/scenarios/engine.prop.test.ts` (fast-check, fixed seed 20261117):
  replay and debrief are deterministic and log-order independent (for logs with one decision per role);
  a delivered message is invisible to its recipient before its delivery sim-time and visible from then on;
  role views are sorted by sim-time and never exceed the facilitator view;
  `reset` returns the initial state after any sequence of up to 20 actions.
- `apps/dead-air/src/ui/App.keyboard.test.tsx` (Testing Library + user-event, jsdom): the core journey
  using only Tab, arrow keys, Space and Enter (skip link, start, role tab, radio choice, advance, debrief,
  reset), and a mid-run reset that clears the recorded choice and returns to step 1.
- Existing coverage kept: `engine.test.ts` (11) and `App.test.tsx` (2, full pointer journey).

## Commands and results
- `pnpm test` → exit 0. boundaries ok (96 files); hindsight 125 passed; night-desk 44 passed;
  dead-air 79 passed (18 files); tooling 38 passed.
- `pnpm typecheck` → exit 0 (hindsight, dead-air, night-desk).
- `pnpm build` → exit 0 (night-desk and dead-air built, `assemble: ok`).
- Intermediate: the first keyboard test run failed twice (a wrong text matcher, and the test assumed
  Tab reaches every radio; a radio group is one Tab stop, so the test now uses arrow keys). Fixed in the test only.

## Not run
- No human keyboard-only or screen-reader walkthrough. jsdom checks reachability and activation, not focus-ring
  visibility, colour contrast, or announcements. Manual steps still to do: open `/dead-air`, press Tab through
  the journey, confirm a visible focus outline on every control, then repeat with VoiceOver.
- No two-tab or microphone check in this task.
## Night Desk: task 1.2 (guided first night)
- Baseline before the task (fresh `pnpm test`): kit 125, dead-air 79, night-desk 44, tooling 38 = 286. (The 240 recorded earlier is out of date; dead-air and night-desk have grown since.)
- Added under `apps/night-desk`: `scenarios/briefs/guided-first-night.md`, `scenarios/guided-first-night.ts` (one kit `Scenario`), `scenarios/desk/guided-first-night.ts` (the `DeskScript`: 3 items at minutes 0, 3, 11, `endsAt` 20, `callStaff` with no `requires`, two guide steps), `src/nights.ts` (`nights`, `findNight`), `scenarios/desk/desk.test.ts`. No kit file changed.
- Tests: `desk.test.ts` adds 9 desk checks, a registry check and one played-through example (the chat message that arrives at minute 3 during the first action is delivered at minute 5). The existing `scenarios.test.ts` now validates the first real scenario with no edit (+3 tests there).
- Counts after: kit 125, dead-air 79, night-desk 57, tooling 38 = 299.
- Root `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:boundaries` (100 files) all exit 0.
- `scenario-from-brief` hook: did not run. I wrote the brief from a shell, not an editor save, so the `PostFileSave` trigger was not exercised, and I wrote the scenario and desk files by hand.
- Not run: no human read of the night's text, no real-time length check, no browser session.

## Night Desk task 1.3: first playable

### Files added or changed for 1.3

- `apps/night-desk/src/App.tsx`
- `apps/night-desk/src/screens/Start.tsx`, `Night.tsx`, `Document.tsx`
- `apps/night-desk/src/styles.css`
- `apps/night-desk/src/test-setup.ts`
- `apps/night-desk/src/App.flow.test.tsx`
- `apps/night-desk/src/main.tsx`
- `apps/night-desk/vite.config.ts`
- `apps/night-desk/package.json`: test dev dependencies only (`@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`), no runtime dependency. The versions are the ones the package declares and Dead Air uses.
- `apps/night-desk/tsconfig.json`

Follow-up test gap closed: `App.flow.test.tsx` gained a test that walks the guided night, reads the action list from `scenarios/desk/guided-first-night.ts`, and for every button on screen at every state asserts that the key is visible inside the button and that pressing the key moves the clock heading. It ends by asserting that all five script actions (1, 2, 3, C, W) were visited. The earlier tests are unchanged.

### Checks (run from the repo root)

| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm typecheck` | 0 | no errors |
| `pnpm test` | 0 | kit 125, dead-air 79, night-desk 64, tooling 38 = 306 (previous 305; +1 is the new walk test) |
| `pnpm build` | 0 | night-desk and dead-air built, assemble ok |
| `pnpm check:boundaries` | 0 | `boundaries: ok (106 files)` |

### Browser evidence

An earlier agent session, not the developer, drove a local `vite preview` build with Playwright on 2026-11-23, about 19:54 to 19:55 UTC. The session transcript was not preserved; only the files below were. Copies are in `docs/evidence/night-desk-1.3/`; the originals remain in `.playwright-mcp/`.

- `page-2026-11-23T19-54-29-362Z.yml`: start screen. Heading "Night Desk", the who-it-is-for sentence, the practice line, one focused Start button.
- `page-2026-11-23T19-54-38-266Z.yml`: night at 11:10 pm. Duty phone item, guide "Read the text and choose what to do.", actions 1, C, W with key hints and minute costs.
- `page-2026-11-23T19-54-47-415Z.png`: 11:15 pm. Floor chat item "sent 11:13 pm, reached you 11:15 pm", second guide step, actions 2, C, W.
- `page-2026-11-23T19-55-01-004Z.png`: 11:21 pm. Door item added, actions 2, 3, C, W.
- `page-2026-11-23T19-55-18-876Z.png`: document "The night is over" with replay rows Jo Marlowe, Duty phone, Floor chat, The door, Ms Alder, and eight decision marks on the player row.
- `console-2026-11-23T19-54-29-175Z.log`: only a favicon.ico 404.

### Open items

- Exit criterion (a), checked by the developer through `pnpm build` then `pnpm --filter night-desk exec vite preview`: not run.
- Manual 60-second first-choice check (Req 1.3): not run.
- Layout at 1280x720 judged by a person: not run.

### Observation, not fixed

The clock heading takes programmatic focus on mount, and the 2 px focus outline shows as a box around the clock. Left for the design pass (task 6.x).

## Signal chain C1: AudioWorklet shell and acoustic transport
Added in `apps/dead-air/src/transport/`: `acoustic.ts` (transport and the Web Audio `AudioIO`), `acoustic-worklet.ts` (the only file using the worklet global scope), `acoustic-capture.ts` (pure energy-gated burst capture), `acoustic-metadata.ts` (pure airtime and level shaping). Received events carry `meta: { airtimeMs, rms, dbfs, peak }` (Req 4.3). While the local speaker plays, capture is switched off and bursts are not decoded (Req 2.3).

| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm typecheck` | 0 | no errors |
| `pnpm test` | 0 | kit 125, dead-air 94, night-desk 64, tooling 38 = 321 (dead-air was 79; +15 new) |
| `pnpm build` | 0 | both apps built, assemble ok |
| `pnpm check:boundaries` | 0 | `boundaries: ok (114 files)` |

New tests (transport doubles and synthetic `Float32Array` only, no audio hardware): metadata examples and two fast-check properties at 200 runs, burst capture, and transport tests for received metadata, garbled bursts, decode suppression while transmitting, and close.

Not verified: real speaker-to-microphone behaviour. `createWebAudioIO` and the worklet were typechecked but are not imported by the app yet, so they are not in the build output, and neither has run in a browser. The B1 demodulator is a batch function, so the shell captures a whole burst with an energy gate and decodes it afterwards; the gate thresholds are untested on real audio. Real-device checks are manual task C3.
## Signal chain C2: permission fallback
Added `apps/dead-air/src/transport/select.ts` with `selectTransport`, and `select.test.ts`. It probes `getUserMedia`, releases the probe stream, then builds the acoustic transport. On failure it returns the scripted transport and a one-sentence reason (Req 4.2). Cases: denied (`NotAllowedError`), no device (`NotFoundError`, `OverconstrainedError`, or `mediaDevices` undefined), insecure context (`isSecureContext === false` or `SecurityError`), any other error including acoustic setup failure. The fallback is scripted rather than loopback: loopback needs a second tab already open, and Dead Air must offer something to a person alone.
| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm typecheck` | 0 | no errors |
| `pnpm test` | 0 | kit 125, dead-air 101, night-desk 64, tooling 38 = 328 (+7 new) |
| `pnpm build` | 0 | both apps built, assemble ok |
| `pnpm check:boundaries` | 0 | `boundaries: ok (116 files)` |
Gaps: the reason is not shown on screen. The Dead Air UI is still the prototype (`App.tsx` does not use any transport), and editing it was out of bounds, so no screen test exists. A real browser permission prompt was not exercised; tests use doubles for `getUserMedia`.
## Consoles task 1: UI module structure and shared types
Added `apps/dead-air/src/ui/shell/types.ts` with `PlayMode`, `CarrierState`, `ConsoleLogEntry`, `PersistedRun`, `PrintLine` and `ComposerBudget`, and `types.test.ts` (type-level smoke test). It re-exports `Scenario`, `SimEvent`, `SimState`, `RecordedDecision` and `RoleId` from `hindsight` (all five exist under those names) and `Transport`, `TransportEvent`, `TransportFrame` and `TransportMode` from `src/transport/types.ts`. Nothing is redefined. `PlayMode` is `solo | loopback | acoustic`; `selectTransport` returns `acoustic` or `scripted`, and `scripted` maps to `solo`. No fallback-notice type was added, because the design does not call for one. `select.ts` is unchanged.
Folders `consoles/booth`, `consoles/tower`, `fx/crt`, `fx/waterfall`, `fx/audio` each hold an `index.ts` with a one-line comment and `export {}`; the real files arrive with their own tasks.
| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm typecheck` | 0 | no errors |
| `pnpm test` | 0 | kit 125, dead-air 106, night-desk 64, tooling 38 = 333 (+5 new) |
| `pnpm build` | 0 | both apps built, assemble ok |
| `pnpm check:boundaries` | 0 | `boundaries: ok (123 files)` |

## Consoles 11.1: Entry screen

Added `apps/dead-air/src/ui/shell/Entry.tsx` (with `entry.css`, `factories.ts`, `worklet-url.d.ts`), `Entry.test.tsx` and `src/main.test.tsx`. Entry shows Solo, Two tabs and Two devices by sound, each a button with one sentence as its accessible description, the marker "Fiction. Practice drill." and a Mute toggle. Two devices by sound goes through `selectTransport`; on fallback the reason is shown in a `role="status"` region (loss colour, left rule) and nothing starts until the person picks Solo, which then reports the reason in `onStart`. `main.tsx` renders Entry when the URL has `?shell` or `?entry` (temporary preview hook until consoles 13.1); otherwise it renders the prototype `App`. `select.ts` is unchanged. Decisions are recorded in consoles `tasks.md`.

| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm typecheck` | 0 | no errors |
| `pnpm test` | 0 | kit 125, dead-air 117, night-desk 64, tooling 38 = 344 (+11 new: 9 Entry, 2 main) |
| `pnpm build` | 0 | both apps built, assemble ok |
| `pnpm check:boundaries` | 0 | `boundaries: ok (128 files)` |

Covered by automated tests with stubs (jsdom, Testing Library, roles and text only): three modes with names and sentences; marker and mute present; Solo and Two tabs call `onStart`; success path with stubbed stream and acoustic factory (mode acoustic, no reason shown); denied (`NotAllowedError`), no device (`NotFoundError`) and insecure context each show their reason, leave Solo working and pass the reason to `onStart`; keyboard-only Tab then Enter; `main.tsx` renders the prototype by default and Entry with `?shell`. The `mediaDevices: undefined` and other-error cases are covered in `select.test.ts`, not in Entry tests.

Seen in a real browser (Playwright MCP Chromium against `vite preview` of `apps/dead-air/dist`, `/dead-air/?shell`): Entry rendered with all three modes. Choosing Two devices by sound left the screen at "Asking for the microphone." with that mode disabled and Solo and Two tabs enabled; it was still in that state after 8 seconds, because the browser neither granted nor denied the request. So no fallback reason appeared in the real browser. Evidence: `docs/evidence/consoles-11.1/` (`entry-initial.*`, `entry-after-sound.*`, `entry-after-sound-8s.yml`). Finding: `selectTransport` has no timeout, so a permission request that is never answered leaves the mode waiting; the person can still pick Solo. Whether to add a timeout is open.

Not run: real microphone permission prompt answered by a person. Not run: real speaker-to-microphone test (signal-chain C3). Not run: a person checking the Entry screen visually. Not run: keyboard and screen-reader pass by a person. The default acoustic factory (`createDefaultAcoustic`) built into the bundle but has not run against a real microphone.

## Consoles: pure logic batch and Entry (2026-11-23)

Checkpoint 5 of the consoles spec ("pure console logic"). No code was changed for the checkpoint.

### Tasks done

Counts come from `cd apps/dead-air && pnpm exec vitest run <path>`, one file at a time. All paths are under `apps/dead-air/src/ui/`.

| Task | Files | Tests |
| --- | --- | --- |
| 1: shell types | `shell/types.ts`, `shell/types.test.ts` | 5 |
| 11.1: Entry, brought forward by developer decision. Reached at `/dead-air/?shell`, a temporary preview hook until 13.1 | `shell/Entry.tsx`, `shell/entry.css`, `shell/factories.ts`, `shell/worklet-url.d.ts`, `shell/Entry.test.tsx`, `../main.tsx`, `../main.test.tsx` | 9 (Entry) + 2 (main) |
| 2.1 carrierState | `consoles/booth/carrier.ts`, `carrier.test.ts` | 4 |
| 2.2 carrierState property | `consoles/booth/carrier.prop.test.ts` | 1 |
| 2.3 composerBudget | `consoles/booth/composer.ts`, `composer.test.ts` | 6 |
| 2.4 composerBudget property | `consoles/booth/composer.prop.test.ts` | 1 |
| 2.5 toPrintLine, reworked for UTF-8 | `consoles/booth/garbled.ts`, `garbled.test.ts`; end-to-end Unicode test `consoles/booth/unicode.e2e.test.ts` | 18 + 6 |
| 2.6 toPrintLine property | `consoles/booth/garbled.prop.test.ts` | 4 |
| 3.1 foldHistory | `consoles/tower/history.ts`, `history.test.ts` | 7 |
| 3.2 foldHistory property | `consoles/tower/history.prop.test.ts` | 1 |
| 4.1 log and decision lock | `shell/log.ts`, `shell/log.test.ts` | 7 |
| 4.2 decision lock property | `shell/decision-lock.prop.test.ts` | 1 |
| 4.3 persistence, base64 payloads | `shell/persist.ts`, `shell/persist.test.ts` | 7 |
| 4.4 persistence property | `shell/persist.prop.test.ts` | 1 |
| 6.1 audio bus and status twin | `fx/audio/bus.ts`, `bus.test.ts`, `status-twin.ts`, `status-twin.test.ts` | 6 + 2 |
| 6.2 status twin property | `fx/audio/status-twin.prop.test.ts` | 1 |

### Developer decisions, 2026-11-23

- No CRT scanlines, glow or blur (7.1 superseded).
- The drill marker reads "Fiction. Practice drill."
- Left-aligned grid layout (11.3).
- No key click or static bed. Cues before the first gesture are dropped, while their text is still emitted.
- The UTF-8 print line has a distinct invalid-byte marker.

### Investigation: nine Entry failures

Nine Entry failures were reported. They reproduce only when `Entry.test.tsx` runs without the app's Vitest config, for example via a bare root `vitest run` or `pnpm --filter dead-air exec vitest` from the root, where paths resolve against the root. They pass under the app config and in root `pnpm test`. Conclusion: an invocation mistake, not a regression. The "invalid matcher" message was not reproduced. The saved output with the nine failures was not found. The correct per-file command is `cd apps/dead-air && pnpm exec vitest run <file>`.

### Known gaps

- Nothing reports per-byte damage positions today. A garbled frame carries no payload, so the Booth can mark damage only once a transport supplies positions.
- `selectTransport` has no timeout. In the browser session it stayed on "Asking for the microphone." when the prompt was never answered.
- The audio bus's real Web Audio synth has not run.

### Not run

- Not run: a real microphone permission prompt answered by a person.
- Not run: speaker-to-microphone (signal-chain C3).
- Not run: a person viewing Entry.
- Not run: a keyboard and screen-reader pass by a person.
- Not run: real audio output of the bus.

### Check results

| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm test` | 0 | kit 125, night-desk 64, dead-air 190, tooling 38 = 417 |
| `pnpm typecheck` | 0 | no errors |
| `pnpm build` | 0 | both apps built, `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (152 files)` |

Re-run after this section was added: `pnpm test` exit 0 (tooling 38 passed; boundaries ok, 152 files) and `pnpm check:boundaries` exit 0.

## Consoles: signal indicator, Booth, Tower, decision prompt, microphone timeout (2026-11-23)

Covers consoles tasks 7.1–7.3, 8.1, 9.1 and 10.1, and signal-chain C2. The counts below come from one final run on the finished tree, not from the parallel task runs, which saw different snapshots.

### Developer decisions
- 7.1 is superseded by the design language.
- 7.2 is a static SVG signal indicator. It is drawn only from real acoustic metadata (dBFS, RMS, peak, airtime). It says "not measured in this mode" for solo and loopback, and "no message heard yet" before the first burst. Its accessible name matches the visible text. It uses `currentColor` ink and no accent.
- C2 has a 10 s microphone timeout with its own reason, and Solo stays available. A late stream has its tracks stopped and starts no session. A late rejection is ignored. Picking another mode, or unmounting, aborts the attempt.
- The Teleprinter shows each line at once with its airtime, with no animation.
- Carrier and lamp states are text, with the accent only for loss.
- The Tower has three keys (Up, Down, Send) and keeps the last 8 messages.
- The decision prompt has no correctness affordance, and a decision is fixed once the next beat begins.

### Counts
Per package, as printed by `pnpm test`:

| Package | Files | Tests |
| --- | --- | --- |
| packages/hindsight | 25 | 125 |
| apps/night-desk | 9 | 64 |
| apps/dead-air | 48 | 254 |
| tooling (`test:tooling`) | 5 | 38 |

Total 481 tests. Boundaries: `boundaries: ok (171 files)`.

Per area, run from `apps/dead-air` with `pnpm exec vitest run <path>`, each exit 0:

| Path | Files | Tests |
| --- | --- | --- |
| src/transport/select | 1 | 12 |
| src/ui/shell/Entry | 1 | 13 |
| src/ui/fx/waterfall | 2 | 10 |
| src/ui/consoles/booth | 8 | 54 |
| src/ui/consoles/tower | 3 | 20 |
| src/ui/shell/DecisionPrompt | 1 | 13 |

### Known gaps
- Transports report no per-byte damage positions. A garbled event has no payload, so it shows a "could not be read" line. `BoothEvent.undecodable` exists, but no producer fills it yet.
- `BoothConsole` reads `transport.mode` at render time. RunHost (11.2) must re-render when the mode changes.
- None of these components is mounted yet. RunHost and ConsoleFrame (11.2, 11.3) and mounting (13.1) are still to do. Only Entry is visible, at `/dead-air/?shell`.
- Sim-time is shown as "sim-minute N".
- Focus appearance is not checked by jsdom.

### Not run
- Not run: a person answering a real microphone prompt, including whether the browser microphone indicator clears after a late stream is stopped.
- Not run: speaker to microphone (signal-chain C3).
- Not run: real audio output from the bus.
- Not run: a person viewing Booth, Tower and the decision prompt.
- Not run: a keyboard and screen-reader pass by a person.
- Not run: dark appearance and contrast checks.

### Check results
| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm test` | 0 | kit 125, night-desk 64, dead-air 254, tooling 38 = 481 |
| `pnpm typecheck` | 0 | no errors |
| `pnpm build` | 0 | both apps built, `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (171 files)` |

## Consoles: playable shell (2026-11-23)

Consoles checkpoint 14. Source under `apps/dead-air/src/`.

### Tasks done, with their files
- **11.3 ConsoleFrame:** `ui/shell/ConsoleFrame.tsx`, `ConsoleFrame.test.tsx`, `frame.css`. One `main`, one `h1`, a mute control and a single status region. No CRT layer, no centred panel.
- **11.2 RunHost, RoleChoice, RunEnd, `replay-input.ts`:** `ui/shell/RunHost.tsx`, `RunHost.model.ts`, `RoleChoice.tsx`, `RunEnd.tsx`, `replay-input.ts`, `run.css`, with `RunHost.test.tsx` and `RunHost.model.test.ts`. Built on kit APIs.
- **11.4 requirements tests:** `ui/shell/Shell.requirements.test.tsx`.
- **12.1 accessibility tests:** `ui/a11y.test.tsx`, `ui/focus-css.test.ts`, `ui/css-raw.d.ts`. They also fixed the nested `main`/`h1` in `BoothConsole.tsx`, `TowerConsole.tsx` and `PagerDisplay.tsx`.
- **12.2 reduced-motion tests:** `ui/motion.test.ts`, `ui/motion.test.tsx`, `ui/motion-fs.d.ts`. There is no animation, no loop and no `setInterval`. The only `setTimeout` is the carrier airtime timer.
- **13.1 mounting:** the shell is the default at `/dead-air/`. The prototype stays at `?prototype` until skeleton 6.2. The page title is "Dead Air". Files: `src/main.tsx`, `src/main.test.tsx`, `index.html`.
- **13.2, partial:** the shell owns its tokens and fonts in `ui/shell/base.css`, and the prototype stylesheet loads only for `?prototype`. `src/main.imports.test.ts` guards this. `ui/contrast.test.ts` adds a ratio table, and one undefined `--accent` token was fixed in `booth.css`. `scripts/site/offline-assets.test.mjs` scans the built `dist/`.

### RunHost decisions
- Finished means the cursor has reached the last timeline step. An early-end button is always shown.
- The carrier lamp re-renders after a send and again once the airtime has passed, through an injected scheduler. There is no `onModeChange`.
- Sim time comes from the scenario timeline, with own-send ordering.
- RunHost owns the transport under StrictMode, so there is one live subscription and one close.
- A Solo duplicate outcome is not re-appended.
- The role is stored under `dead-air:run:role`.
- A two-device saved run that is restored returns to Entry with a note.

### Saved-run rule (developer, 2026-11-23)
An unreadable or unsupported save is kept and never cleared automatically. The player sees a plain reason sentence. The fresh run is held in memory and not saved while the old save exists. Only "Discard the saved run" calls `clear()`. Tested in `RunHost.test.tsx` and `main.test.tsx`, and seen in the browser in `docs/evidence/consoles-11.2/06-corrupt-save-kept`.

### Small fixes made while wiring
- `factories.ts` link settings are filled in after the role choice.
- Loopback `close` is idempotent (`transport/loopback.ts`, with a test).
- Entry's mute callback was moved out of the state updater, and Entry gained `initialMuted` (`Entry.tsx`, with a test).
- The `--accent` fallback in `booth.css` was fixed.

### Browser evidence
Run by the agent in Playwright against a local static build, not by a person.
- `docs/evidence/consoles-11.2/` has no README. It holds accessibility snapshots (`.yml`) after a send, after reload and resume, at the last beat and in the replay, plus PNGs of the last beat, the replay and the corrupt save being kept (`06-corrupt-save-kept.png`), and a snapshot of the prototype.
- `docs/evidence/consoles-13.1/README.md`: `pnpm build`, `dist/` served with `python3 -m http.server` on port 4173, driven with Playwright MCP. Entry, then Solo and a role, then the first beat in two clicks. Decision and send, reload and resume, then the replay. At 360 px wide with reduced motion emulated, the replay, Entry and Tower console show no horizontal overflow (scrollWidth 360) and no running animations. `?prototype` and `/night-desk/` load, and `/` loads with the title "Hindsight". Console errors: six, all `favicon.ico` 404. No shell element carries a `styles.css` class name, body font is IBM Plex Sans, `--paper` is #f5f2ea and the three self-hosted fonts load.
- `docs/evidence/consoles-13.2/README.md`: Playwright snippets compare computed styles (28 properties plus size) of every element on the entry and run screens, light and dark, between a build before and a build after the `base.css` change. The first run found one difference (`footer` font-size 13px against 15px), which a `footer` rule in `base.css` fixed. The final run had 0 differing rows. An offline reload test is described under the open product gap.

### Open product gap
An offline reload fails with `net::ERR_INTERNET_DISCONNECTED`. Before going offline, localStorage held `dead-air:run` and `dead-air:run:role`, but the page itself is not cached. There is no service worker, so product.md's "works offline after first load" and Req 6.2 are not met. The service-worker options are waiting on a decision by the developer.

### Known gaps
- Transports report no per-byte damage positions.
- The replay draws only outcomes: no time in transit, and no mark for a dropped message.
- The Transport interface has no error or end signal.
- The audio context is never closed.
- The kit's `ReplayView` logs a React "`key` is not a prop" warning.
- Night Desk has no favicon, and neither does the site.
- Stale "come from styles.css" comments remain in `entry.css` and `booth.css`.
- The Field role's run screen was not part of the before/after style comparison.
- The send in the corrupt-save `main.test.tsx` case is not proven recorded.

### Not run
- Not run: a person answering a real microphone prompt.
- Not run: speaker to microphone between two devices (signal-chain C3).
- Not run: real two-tab play across two browser tabs.
- Not run: real audio output from the bus.
- Not run: a person playing the shell and judging layout at 1280×720.
- Not run: a keyboard and screen-reader pass by a person.
- Not run: how the focus outline looks in a real browser.
- Not run: the 60-second first-choice check with a first-time visitor.

### Check results
| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm test` | 0 | hindsight 125, night-desk 64, dead-air 386, tooling 41 |
| `pnpm typecheck` | 0 | no errors |
| `pnpm build` | 0 | both apps built, `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (189 files)` |
| `pnpm test:tooling` | 0 | 6 files, 41 passed, run after the build |

## Offline workers, replay sends and cleanup (2026-11-23)

### Service workers

The developer chose option 1 on 2026-11-23.

- There is one scoped worker per app: `/dead-air/sw.js` and `/night-desk/sw.js`. The landing page has none.
- `scripts/site/service-worker.mjs` generates them during assemble. It adds no dependency.
- Each app has a small production-only `register-sw.ts`.
- Caches are named `<app>-<10-hex sha256 of the precache>`, which is deterministic.
- Activate deletes only that app's own older caches.
- Navigation is network-first with a 3.5 s timeout. A navigation response is never written to the cache. The offline fallback is the `index.html` precached with the same version's assets. This is the stale-page fix.
- Assets are cache-first. Runtime caching is limited to the precache list plus `voice/`.
- There is no `skipWaiting` and no `clients.claim`, so a new version activates once every tab of that app closes.
- The workers make no storage calls besides Cache Storage.

Browser results, run by the agent in Chromium on localhost (details and screenshots in `docs/evidence/offline-sw/README.md`):

- First online load: `/dead-air/` registered with scope `/dead-air/` and reached `activated`. The cache held 11 entries.
- Offline reload of `/dead-air/` and `/dead-air/?prototype`: both loaded from the worker.
- Offline resume of a saved run: "Resumed your saved run." with the same log lines, and localStorage byte-identical before and after.
- A corrupt save (`{corrupt-not-json`) was kept unchanged offline. The page said it was a new run and that the saved run had been kept.
- Night Desk loads offline but returns to the start screen, because task 4.1 (reload restore) is not built.
- Scope isolation: two registrations. `/` fails offline (`ERR_INTERNET_DISCONNECTED`), as expected. The two apps' caches hold only their own URLs. This was checked from the file lists, since Cache Storage is per origin.
- `unrelated-cache` and an extra localStorage key survived an update.
- Update: after a second build, the new version waited (`active` old, `waiting` new). After the tab was closed and reopened, the old cache was gone, the new worker was active and the run restored. Offline, the new version served its added file.
- Stale-page check: a v2 `index.html` was served online while the v1 worker controlled the page. The v1 cache still held the v1 `index.html` and no v2 chunk. Then, offline, the v1 precache loaded and the run resumed.

Unverified:

- a real HTTPS host
- other browsers
- a slow real network against the 3.5 s timeout
- an update with two tabs open
- the old worker's failure, which was not reproduced in the browser; only the unit test covers the cache-write rule

The console log for the first tab showed only `404 /favicon.ico`. Later tabs, opened by script, are not covered by that log.

### Replay sends

- There is a new additive log entry, `send`. `PersistedRun` stays at version 1. A pre-change reader treats the new entry as `bad-entry` and keeps the save.
- Own sends are recorded in every mode. Solo partner sends are recorded from the schedule.
- Outcomes are matched to sends by id.
- `inTransitAt` is now truthful. A dropped send stays in transit, and garbled or collided messages are not knowledge.
- Limit: in Two tabs and acoustic, the partner's sends are not known locally, so their dropped messages leave no trace.
- The drawn replay is unchanged: no diagonals, no lost lines. That waits for the seance-replay design.

The two screenshots in `docs/evidence/consoles-11.2-followup/` show this. `solo-replay.png` is "The drill is over": two role lines (Dispatch and Field Lead), each with circle markers and a filled square at the end of Dispatch, plus the log lines "Carrier tone on.", "Chirp: message sent." and "Carrier tone off.". `old-save-replay.png` is "The drill was ended early" with "Resumed your saved run.": two role lines with circle markers only. Both show straight lines per role, with no diagonals and no marks for dropped messages. The screenshots have no captions, so which run each came from rests on the file names.

### Cleanup

- The audio bus has `close()`. There is one bus per page, closed once on final unmount, and it is StrictMode-safe.
- The Transport has an optional `onStatus` (ended or error). Loopback reports `messageerror` and close. Acoustic reports track `ended` and AudioContext closed or interrupted; these are not tested on hardware. Scripted reports `ended` on close.
- RunHost shows one sentence and keeps the run usable.

### ReplayView key warning

- It was not reproduced, in jsdom StrictMode or in a vite dev browser run.
- A guard test was added: `packages/hindsight/src/replay/ReplayView.warnings.test.tsx`.
- The earlier mention in this file stands as reported but is now unconfirmed.

### Process note

- One earlier run wrote command output to the fixed path `/tmp/_t.txt` (13 KB, created Nov 23 18:21), against the rule.
- Whether a file of that name existed before is unknown.
- Nothing else was overwritten that we know of.
- The file was left in place.

### Not run

- Not run: a real HTTPS deploy.
- Not run: Firefox and Safari.
- Not run: two real tabs.
- Not run: two devices by sound (signal-chain C3).
- Not run: an unplugged microphone.
- Not run: real audio output.
- Not run: human play and judgement of layout.
- Not run: a keyboard and screen-reader pass by a person.
- Not run: the 60-second check.

### Check results

| Command | Exit | Summary |
| --- | --- | --- |
| `pnpm test` | 0 | hindsight 126, night-desk 68, dead-air 425, tooling 57 |
| `pnpm typecheck` | 0 | no errors |
| `pnpm build` | 0 | both apps built, `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (196 files)` |
| `pnpm test:tooling` | 0 | 7 files, 57 passed, run after the build |

## Replay (seance-replay), 2026-11-23
### Baseline before task 1.1
- `pnpm test` at the root, run before any change in this task: exit 0.
- Per-package counts: hindsight 126, night-desk 68, dead-air 425, tooling 57.
- `check:boundaries` inside that run: `boundaries: ok (196 files)`.
- These match the last recorded counts and are the floor for the following tasks.
- Task 1.13: `ReplayView.test.tsx` now reads the participant rows from inside the labelled "Replay: ..." list instead of the whole screen, because the text timeline adds its own list items. Row count, tabindex and the "Participant 2: 1 marks" label are unchanged.- Task 1.14: replaced, in `replay-input.test.ts`, "gives an old log with no send entries the same ledger as before" (now "turns an old log with no send entries into arrivals, with no invented sends") and "falls back to arrival time for an outcome whose id matches no send, or precedes its send" (now "makes an outcome whose id matches no send, or precedes its send, an arrival"), because both asserted a send fabricated at the arrival time. In `RunHost.model.test.ts` the "replay adapter" test now expects an `arrival` and no `sent` for an unmatched outcome, for the same reason.
- Task 2.4: `packages/hindsight/src/replay/ReplayView.test.tsx` now reads one `group` per participant inside the `group` labelled "Replay: ..." and expects no tabindex on it, because the SVG is now `role="group"` and only decision nodes are focusable.
- Task 2.4: `apps/night-desk/src/App.flow.test.tsx` queries the replay as `group` / `group` instead of `list` / `listitem`, and counts page actions with a helper that skips buttons inside the SVG (decision nodes are buttons now, and their names repeat "Wait a couple of minutes").
- Task 2.4: `apps/night-desk/src/model/replay-participants.test.tsx` queries `group` / `group` instead of `list` / `listitem`, because the SVG role changed.
- Task 2.4: `apps/dead-air/src/ui/shell/RunHost.test.tsx` queries `group` / `group` instead of `list` / `listitem`, because the SVG role changed.
- Task 2.5: `apps/night-desk/src/model/replay-participants.test.tsx` now expects a delivered item by its title ("A knock at the door, The door to ...: sent at 11:21 pm") instead of by id ("i3, ..."), because Document passes names for delivered items; and `kit in-transit.prop.test.ts` treats a cursor at the last time as closed only when no participant is in focus, matching the fix in `layoutWorldlines` (found in the browser: a decision at the last time had no fade). Browser evidence: `docs/evidence/replay-browser/README.md`.
- Task 3.3: `apps/night-desk/src/App.flow.test.tsx` `actionButtons` also skips the kit's "Clear line" toggle, because it is a view control and not one of the page's script actions.
- Task 5.4: Dead Air turns the habits table on. `SendRecord` gained an optional numeric `airtime`; `persist.ts` accepts it with no version change and old saves restore as before, and the share token already carries `bytes` and `airtime` (unchanged). Airtime is recorded as the frame's own value, else the nominal 4 the Solo and Two tabs transports put on the line, and is left unrecorded by sound (the measured length stays inside that transport; the table reads "Not recorded"). Two tabs partner reads "Not known here", read-back reads "Not recorded". `replay-participants.test.tsx` asserts Night Desk shows no habits table. Browser evidence: `docs/evidence/replay-habits/README.md`.

### Final check (task 6.3), 2026-11-24

#### Tests replaced or renamed in 1.13, 1.14 and 2.4, consolidated
The lines above stay as written. In one place:

| Task | File | Change | Reason |
|---|---|---|---|
| 1.13 | `packages/hindsight/src/replay/ReplayView.test.tsx` | Participant rows are read from inside the labelled "Replay: ..." list. | The text timeline adds its own list items. Row count, tabindex and the "Participant 2: 1 marks" label are unchanged. |
| 1.14 | `apps/dead-air/src/ui/shell/replay-input.test.ts` | "gives an old log with no send entries the same ledger as before" became "turns an old log with no send entries into arrivals, with no invented sends". | The old test asserted a send made up at the arrival time. |
| 1.14 | same file | "falls back to arrival time for an outcome whose id matches no send, or precedes its send" became "makes an outcome whose id matches no send, or precedes its send, an arrival". | Same reason. |
| 1.14 | `apps/dead-air/src/ui/shell/RunHost.model.test.ts` | The "replay adapter" test expects an `arrival` and no `sent` for an unmatched outcome. | Same reason. |
| 2.4 | `packages/hindsight/src/replay/ReplayView.test.tsx` | Reads one `group` per participant inside the `group` labelled "Replay: ..."; no tabindex expected on it. | The SVG is `role="group"`; only decision nodes are focusable. This replaces the phase A list-structure test. |
| 2.4 | `apps/night-desk/src/App.flow.test.tsx`, `apps/night-desk/src/model/replay-participants.test.tsx`, `apps/dead-air/src/ui/shell/RunHost.test.tsx` | Query `group` / `group` instead of `list` / `listitem`. The flow test counts page actions with a helper that skips buttons inside the SVG. | The SVG role changed, and decision nodes are buttons whose names repeat the choice text. |

No test was deleted without a replacement.

#### Final root checks (run in the foreground, 2026-11-24)
First run, before any change in this task:

| Command | Exit | Result |
|---|---|---|
| `pnpm test` | 0 | boundaries ok (237 files); hindsight 48 files, 255 passed; night-desk 12 files, 77 passed; dead-air 63 files, 454 passed; tooling 7 files, 57 passed |
| `pnpm typecheck` | 0 | all three workspace projects |
| `pnpm build` | 0 | both apps built; `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (237 files)` |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |

The browser found one real defect (see below). I fixed it with a one-line style change and one new test, then reran:

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | |
| `pnpm test` | 0 | boundaries ok (237 files); hindsight 48 files, 256 passed; tooling 57 passed. The night-desk and dead-air suites were part of this run and passed (exit 0); I did not read their counts again, and the code they cover was not touched. |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (237 files)` |

Totals now: hindsight 256, night-desk 77, dead-air 454, tooling 57 (the last two as measured in the first run).

Counts per phase: this file records only the baseline (hindsight 126, night-desk 68, dead-air 425, tooling 57) and the final numbers above. Per-phase counts were not written down as each phase finished, so I do not reconstruct them here.

#### Boundary output
`pnpm check:boundaries` prints `boundaries: ok (237 files)`. The baseline run said `ok (196 files)`.

#### Exports after this spec
`hindsight` (core entry, headless). Runtime values: `emptyChannelLog`, `toChannelLogEntry`, `appendChannelEvent`, `replayChannelLog`, `reduce`, `initialState`, `nextSimTime`, `timelineSteps`, `messageTimings`, `buildDebrief`, `replay`, `visibleToRole`, `eventsForRole`, `allEvents`, `orderEvents`, `validateScenario`, `checkScenario`, `parseBrief`, `printBrief`, `Prng`, `createPrng`, `createClock`, `runChannel`, `profileLoss`, `DEFAULT_AIRTIME`, `buildLedger`, `knownAt`, `inTransitAt`, `lostAt`, `closedFates`, `orphanOutcomes`, `ledgerFromChannel`, `clearLine`, `gainAt`, `computeHabits`, `HABIT_WHY`. Types: `ParticipantId`, `RoleId`, `Audience`, `Role`, `EventType`, `SimEvent`, `DecisionOption`, `Scenario`, `RecordedDecision`, `PlayLog`, `SimState`, `ChannelLog`, `ChannelLogEntry`, `ChannelOutcome`, `ChannelOutcomeKind`, `Action`, `Debrief`, `DebriefRow`, `MessageTiming`, `ValidationError`, `ValidationResult`, `CheckName`, `CheckResult`, `Brief`, `BriefError`, `BriefResult`, `SimClock`, `ChannelProfile`, `ChannelSend`, `ChannelEvent`, `LossSource`, `Impairment`, `LedgerEvent`, `Ledger`, `ClosedFate`, `Habits`, `HabitOptions`, `HabitParticipant`, `HabitColumn`.

`hindsight/replay` (React + SVG). Runtime values (12, pinned in `replay/entries.test.ts`): `HabitsTable`, `ReplayView`, `decodeReplayRecord`, `encodeReplayRecord`, `formatLimit`, `layoutReplay`, `layoutWorldlines`, `missingAt`, `momentSentences`, `summarise`, `timeToY`, `timelineText`. Types: `ReplayLayout`, `ReplayRow`, `ReplayTick`, `ReplayTickKind`, `Missing`, `TimelineEntry`, `TimelineKind`, `DecodeResult`, `EncodeResult`, `ReplayDecision`, `ReplayRecord`, `ArrivalMark`, `DecisionNode`, `Fate`, `HistoryKnowledge`, `KnowledgeLimit`, `KnowledgeMark`, `LayoutOptions`, `LegendKey`, `ReplayParticipant`, `Signal`, `TimeAxis`, `Tone`, `Worldline`, `WorldlineInput`, `WorldlineLayout`, `HabitsTableProps`, `ReplayViewProps`.

#### `layoutReplay` decision
Kept, as the spec's default. It is still exported from `hindsight/replay`, has its own tests (`layout.test.ts`), and is used by `apps/night-desk/src/model/replay-input.test.ts` and `apps/dead-air/src/replay-entry.test.ts`. `ReplayView` uses `layoutWorldlines` instead. Removing `layoutReplay` would be a separate change.

#### `.kiro/` and `.gitignore`
`.gitignore` was read on 2026-11-24. It lists `node_modules/`, `.next/`, `dist/`, `coverage/`, `.env`, `.env.*`, `.enola/`, `planning/`, `.claude/`, `CLAUDE.md`, `AGENTS.md` and `.omx/`. `.kiro/` and its subfolders are not in it. `.playwright-mcp/` is also not in it, so it must be left out of commits by hand.

#### Dark appearance: which app has one (task 6.2 claim checked)
Task 6.2 said both apps define dark tokens under `prefers-color-scheme: dark`. That is true for Dead Air only.
- Dead Air: `apps/dead-air/src/ui/shell/base.css` (and `apps/dead-air/src/ui/styles.css`) set `color-scheme: light dark` and, under `@media (prefers-color-scheme: dark)`, `--paper #141311`, `--ink #F5F2EA`, `--grey-1 #A9A59B`, `--loss #D9806A`. Under dark emulation in a browser, `--paper` read `#141311` and the replay's loss lines were `rgb(217, 128, 106)`.
- Night Desk: `apps/night-desk/src/styles.css` has one light `:root` block (`--paper #f5f2ea`, `--ink #1a1916`, `--grey-1 #6b6861`, `--grey-3 #ddd9cf`), no `prefers-color-scheme` rule, and no `--loss`. Under dark emulation, `--paper` still read `#f5f2ea`. The replay inside Night Desk therefore shows in light only, and its loss colour comes from the view's fallback `#9A3B26`. This is acceptable for this task. Night Desk's own dark appearance is its task 6.2, and none was added here.

#### Browser run (agent, Playwright MCP, Chromium)
- Server: `python3 -m http.server 47613 --bind 127.0.0.1` from `dist/`, PID 48085. Stopped afterwards (`ps -p 48085` found nothing). After the fix, a second server on fresh port 47821 (PID 52594) was started and stopped the same way. `pgrep -fl http.server` found nothing at the end. No cache or service worker was cleared; a fresh port was the fresh origin.
- Evidence and a README: `docs/evidence/replay-final/`.
- Console: the only errors on my ports were `favicon.ico` 404s (the server root has none). No script errors.
- Screenshots stalled at first ("waiting for fonts to load"); they worked once the page was brought to the front.

What the agent observed (this is emulation and inspection of computed styles, not a person's judgement):
- Dead Air Solo, played through the UI (Solo, Dispatch, sent two messages, chose "Suggest holding the acoustic set", See the replay): signals were diagonals (252,56 to 628,261.7 and 252,330.3 to 628,536; 3 sim-minutes each). Selecting the decision with Enter set `aria-pressed` true and faded Field Lead's three fact circles; the sentences read "At sim-minute 7, Dispatch (fictional) had 3 things: ..." and "Known elsewhere: Field sees a gust." The scrubber (Home, then Right) at minute 2 cut the first line at y=193.1, faded the later one, and said "Not yet arrived: Message from Dispatch (fictional) at sim-minute 0." Clear line made both spans zero and said "Nothing more would have arrived."; toggling off restored the diagonals. The summary, three discussion prompts and the habits table (Dispatch 2 transmissions, mean bytes 11.5, mean time 4; Field Lead 0, "Not recorded"; no total row) were present. Copy link (stubbed clipboard) wrote `http://127.0.0.1:47613/dead-air/#s=` plus a 772-character token; Copy summary wrote a 215-character paragraph.
- That run lost nothing, so two states were seeded: a saved Solo run written to `localStorage` (a collision, a garbled message to Dispatch, a send with no outcome, a decision at minute 7), reloaded, and resumed by the app. With it the closed record showed three dotted loss lines and the legend sentence "A dotted line did not arrive...". With the decision selected and Clear line on, the sentence read "With a clear line, Dispatch (fictional) would also have had: Message from Field Lead (fictional) at sim-minute 1."
- Print emulation (seeded run, 1280x720 viewport): loss lines `rgb(26, 25, 22)` dotted `2px, 3px`; Copy summary and Copy link `display: none`; `break-inside: avoid` on the figure; figure 707 px wide, SVG 471 px high. With a decision selected, faded circles were `rgb(169, 165, 155)`. The app's paper background still showed in the print-emulated screenshot (a real printer normally drops backgrounds).
- Dark emulation (Dead Air): paper `#141311`, ink `#f5f2ea`, loss `#d9806a`, faded line `rgb(52, 50, 45)`, label text `rgb(169, 165, 155)`.
- Reduced motion: `document.getAnimations().length` was 0 before and after scrubbing. It was also 0 without reduced motion, so that number alone proves little. The computed transition on the lines was `0s` under reduce and `0.12s` otherwise.
- Night Desk guided night, played to the document with the keyboard (key 1, then w eight times): five lines (Jo Marlowe, Duty phone, Floor chat, The door, Ms Alder), three diagonal signals, and no table, no summary, no Copy link and no habits section. The "Clear line" button is present.

Defect found and fixed: the time labels on the left of the figure were clipped. In Dead Air, "sim-minute 7" was drawn as "inute 7", because the labels are right-aligned at x=52 inside an 840-wide viewBox and the SVG clipped what ran past its left edge. Fix: `overflow: visible` on `.hs-figure svg` in `packages/hindsight/src/replay/ReplayView.tsx`. New test: "lets long time labels past the left edge of the figure instead of clipping them" in `ReplayView.style.test.tsx`. After a rebuild the labels start at x=69 in the page and read in full. The earlier screenshots are kept in `docs/evidence/replay-final/before-label-fix/`. The fix has not been looked at on a narrow screen or on paper.

Observation, no change made: with a decision selected at the last moment, a message that never arrived is drawn as a short solid line, not dotted. `layoutWorldlines` treats a cursor at the last time with a focus as "not closed" on purpose (a decision at the last moment must still fade what its role did not know), so a send with no outcome counts as still on its way at that moment. The text timeline says "on its way". With no selection the same message is a dotted loss line.

#### Manual checks (human result separate from the agent's emulation)
| Check | Human result | What the agent's emulation showed (not a human result) |
|---|---|---|
| Black-and-white print on one page | not run | Print media emulated: loss lines ink and dotted, Copy buttons hidden, figure 707x575 px, `break-inside: avoid`. No page was printed and no print preview was paginated. |
| The diagram read as a still image at 1280x720 | not run | Screenshot saved: `docs/evidence/replay-final/dead-air-replay-1280x720.png`. No person judged it. |
| A screen-reader pass of the text timeline | not run | The accessibility tree shows a closed "Text timeline" details element and labelled groups. No screen reader was used. |
| Reduced motion in a browser | not run | Emulated: computed transition 0s, no running animations. |
| Both appearances (light and dark) | not run | Emulated: Dead Air light and dark screenshots; Night Desk has no dark appearance. |
| Two real tabs and two devices for the arrivals-only notice | not run | The notice was seen once in a seeded `loopback` save (`docs/evidence/replay-habits/`). No two tabs were driven and no second device was used. |

#### Process slips
- Some sub-agent runs piped command output through `grep` or `tail`, against the rule not to.
- One sub-agent wrote `/tmp/da-vitest.json` and then deleted it. That is a file outside the repository.
- Two browser runs stalled. The orchestrator stopped their four leftover `http.server` processes.
- In this task, the first full `pnpm test` output was too large to read, so the per-package counts came from running each package's vitest separately with the `dot` reporter.
- Optional property findings, 2026-11-23. Property 8: a message id whose sends or arrivals disagree on sender or recipient is now put in `skipped` and not drawn (`knownAt` unchanged), and the property is un-skipped. Property 12: the test and design now require fact ids to be unique per kind and participant line, and the property is un-skipped. Property 14: the design wording now states the real gap guarantee. Still open: Property 9 (`moment.prop.test.ts`) fails on seed 836020334, a send and a received arrival with the same id, which `knownAt` counts as known and `inTransitAt` counts as in transit. Nothing was changed for it.
- Property 9 resolved, 2026-11-23: `inTransitAt` now excludes any id in `knownAt` for that participant and time, and any id in `lostAt`, so a send plus an arrival with the same id (received, garbled or collision) is known or lost and not in transit. `lostAt` was already disjoint from `knownAt`. An example test was added in `ledger/ledger.test.ts`; no generator or existing test was changed.
- Placement rule unified, 2026-11-23: `receivedAt` and `firstLoss` in `ledger/ledger.ts` are now the only place a message's settled time is decided (earliest `received` outcome at or after the first send, or earliest `received` arrival). `knownAt`, `lostAt`, `inTransitAt`, `closedFates` and `layoutWorldlines` (signals, arrival marks, tone) all use them, so they cannot pick different events (example test from seed 821586344 in `replay/worldlines.test.ts`). Early outcomes (before the first send) are ignored everywhere, and the Property 1 oracle in `known-set.prop.test.ts` was changed to match. No generator was scoped to well-formed logs: Property 8 and every other property passed on the contradictory generator in three clean kit runs in a row (275 tests each).

## Consoles checkpoint 14, re-run after the replay (2026-11-23)

Final checkpoint of the consoles spec, re-run on the current tree because the seance-replay spec rebuilt the kit's replay view and ledger and Dead Air's RunEnd, ShareGate and habits wiring. No code was changed; no check failed.

| Command (repo root) | Exit | Count |
|---|---|---|
| `pnpm test` | 0 | tooling 57 passed (7 files); the combined output was too large to read, so per-package counts came from the separate runs below |
| `pnpm typecheck` | 0 | all three workspace projects |
| `pnpm build` | 0 | both apps built, `assemble: ok` |
| `pnpm check:boundaries` | 0 | `boundaries: ok (245 files)` |
| `pnpm test:tooling` | 0 | 57 passed (7 files) |

Per-package counts, each run with vitest in its own package (exit 0): hindsight 275 (56 files), night-desk 77 (12 files), dead-air 454 (63 files). All match the expected counts.

Kit runs (`cd packages/hindsight && pnpm exec vitest run`), fresh property seeds each time:
1. Inside `pnpm test`: exit 0.
2. Plain run: exit 0, 275 passed (56 files).
3. Run with the `dot` reporter: exit 0, 275 passed (56 files).

No flaky property seen. The dead-air run (454 passed) includes `RunHost.test.tsx`, `a11y.test.tsx`, `Shell.requirements.test.tsx`, `motion.test.ts`, `motion.test.tsx`, `contrast.test.ts`, `main.test.tsx` and `share.test.tsx`.

Replay screen accessibility, read from `apps/dead-air/src/ui/a11y.test.tsx`: `end` is one of the screens in `SCREENS`, reached through "See the replay", on both the fake and scripted transports. For it the tests check a name on every button, link, textbox, listbox, option and checkbox; exactly one `main`, one level-1 heading and one status region; heading levels that skip none; and Tab reach with no trap, including `tabindex="0"` rows. A separate test drives the scrubber slider, a decision node, Copy summary and Copy link by keyboard. No test was added.

Fixes made: none.

Open human and hardware checks for the consoles:

| Check | Result |
|---|---|
| A real microphone permission prompt answered by a person | not run |
| Speaker to microphone (signal-chain C3) | not run |
| Two real tabs | not run |
| A person playing and judging layout at 1280x720 | not run |
| A keyboard and screen-reader pass | not run |
| A real HTTPS deploy | not run |
| Firefox and Safari | not run |

Process note: the first `pnpm test` output exceeded the tool's output limit, so counts were read from separate per-package runs using the `dot` reporter for dead-air and night-desk.

## Night Desk 2.1: missed and queued items, and the staff call

- Night screen: a missed call reads "Missed call at <time>", a knock "Someone knocked at <time>", an expired message "A message went unseen". Each missed item has a second line with its source and the time it was sent, and never its text. Only the missed line uses the loss colour (`--loss`, `#9a3b26`). Delivered items already showed sent and reached times. An item marked `needsProfessional` (delivered or missed) gets the line "The staff member on call is a phone call away."
- Guided night decision: unchanged (`rev` stays 1). The away path is covered with the synthetic fixture. Reason: the guided night's flow test walks every script action, and the first run is the 60-second path, so adding an away action and a late phone item would lengthen it and change that walk for no gain. Its simulated length is 20 minutes with 3 items and 2 guide steps; the real-time length is a manual check and was not run.
- Property 4 (`availableActions.prop.test.ts`, 200 runs, shipped nights and the fixture): a night in progress always offers a `callStaff` action, and with no `callStaff` entry in the log `staffCalledAt` stays null. A finished night offers no actions, so the property is stated for nights in progress. `design.md` Property 4 was reworded to say so. The test passed on every run; there was no failing seed or shrunk input.
- Counts (this run): hindsight 275, night-desk 85, dead-air 454, tooling 57. Night Desk gained 5 tests in `Night.test.tsx` and 3 in `availableActions.prop.test.ts`. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm check:boundaries` and `pnpm test:tooling` exited 0; night-desk `vitest run` exited 0 twice.
- Task 1.3 exit criterion (a), a person playing a night in the preview build, is still not run.

## Night Desk 2.2: content lint over briefs and scenario text
- Added `scenarios/desk/banned-words.ts` (word lists and `lintText`) and `scenarios/desk/content.test.ts`. The list is a heuristic and the file says so. It matches whole words or phrases, case-insensitively, with one optional trailing "s" ("skill" does not hit "kill", "begun" does not hit "gun"). It covers the four out-of-scope topics, real-institution markers (".edu", "university of", "college of", "state university") and 20 real cities and countries. Invented hall names (Linden, Harlow, Marsh, Ferris) pass.
- `content.test.ts`: 2 tests of the lint itself (a bad fixture set fails, a clean set passes) and 4 over shipped text: 2 briefs and 1 scenario file (the glob has one export) plus the globs-working check. All shipped briefs and scenario text passed; no content was edited and no list entry was loosened.
- `desk.test.ts` was changed in one glob only, to exclude `banned-words.ts`, which sits in `scenarios/desk/` but is not a desk script.
- Counts (night-desk `vitest run`, dot reporter): 16 files, 92 tests, exit 0. Root `pnpm typecheck` exit 0, `pnpm check:boundaries` exit 0 (251 files). `pnpm test`, `pnpm build` and `pnpm test:tooling` were not run for this task.
- A human read of each night's text is still required (Req 5.2): not run.

## Night Desk 3.2: habits as plain figures
- Added `src/model/habits.ts` (`habits`, the `HABIT_WHY` table of fixed lines, and `habitRows` for plain-text rows), `habits.test.ts` (7 examples) and `habits.prop.test.ts` (Property 8, 300 runs, over the shipped nights and the fixture with random subsets of items marked `needsProfessional`, random actions, item ids and facts).
- Unknown is `null`: no acted-on items gives `meanMinutes: null`; a marked moment with no call gives `minutes: null` ("No call was made."); no marked moment gives `moments: 0` ("This night had no such moment."). No score, total or colour.
- Decision: `moments` counts the script's marked items. The clock starts at the earlier of their `deliveredAt` times, or `at` for a missed one, so a call after a missed marked moment is not reported as "No call was made". `design.md` (Professional bullet) was reworded to match.
- Property 8 passed on every run; there was no failing seed or shrunk input.
- Counts (night-desk `vitest run`, run twice): 17 files, 99 tests, exit 0 both times. Root `pnpm typecheck` exit 0, `pnpm check:boundaries` exit 0 (253 files). `pnpm test`, `pnpm build` and `pnpm test:tooling` were not run for this task.
- The habits are not yet shown on the Document screen; that is later work.

## Night Desk 3.3: replay narration
- `model/narrate.ts` returns one summary paragraph and one sentence per log entry. Each sentence carries the clock text of its entry, lists the items that had reached the player by then (by the scenario's short title, from `knownAt`), and splits the items still in transit (`inTransitAt`) into "still on its way" and "missed". Those two are named by kind, source and send time only, never by title or body.
- Tests: `narrate.test.ts` (6 examples) and `narrate.prop.test.ts` (2 tests, Property 9 at 200 runs over the shipped nights and the fixture, no judgement words, no item body in any text). Property 9 passed on every run; there was no failing seed or shrunk input.
- Finding: the attention model delivers a queued item at the minute the next choice starts, so in a log the app can produce, no item is on its way at a choice. "Still on its way" is therefore pinned with a hand-made entry at minute 10 against the fixture's real ledger, not with a played log.
- Counts (this run): night-desk 107 passed in 19 files, twice (`vitest run`, then with the `dot` reporter). Night Desk gained 8 tests. Root `pnpm typecheck` and `pnpm check:boundaries` (255 files) exited 0. `pnpm test` and `pnpm build` were not run for this task.

## Night Desk 2.3: night 2, a noise night
- Baseline, before any change (foreground, `cmd; echo "exit=$?"`): `pnpm test` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0, `pnpm check:boundaries` exit 0 (255 files), `pnpm test:tooling` exit 0 (7 files, 57 tests). The root `pnpm test` output is too long to read per-package counts from, so each package was run alone from its own folder: kit 275 (56 files), dead-air 454 (63 files), night-desk 107 (19 files), tooling 57. No failures. A first `pnpm --filter dead-air exec vitest run` from the root picked up the root config, ran 145 files and showed 113 failures. That was a wrong invocation, not a defect; run from `apps/dead-air` the same suite passes.
- Added `scenarios/briefs/loud-music-harlow-3.md` (parses with `parseBrief`), `scenarios/loud-music-harlow-3.ts` (the scenario), `scenarios/desk/loud-music-harlow-3.ts` (the mechanics) and `scenarios/desk/loud-music-harlow-3.test.ts` (one scripted path through the night). No existing test or lint was edited.
- The `scenario-from-brief` hook fired when the brief was saved. It did not write a file by itself: its instruction was handed to this session, which wrote the scenario file. The desk file and the example test are hand-written.
- Content: the fictional Harlow Hall, a noise night with a handoff note, a text, a floor chat message, a knock, a call, a second chat message and Dev refusing at the lounge door (raised voices, nothing worse). The item at minute 31 is marked `needsProfessional`, and the staff call is always an action. The existing content lint passed on it as written.
- Simulated length: 40 minutes (`endsAt` 40, starting 11:10 pm). Item count: 7 at minutes 0, 3, 5, 11, 17, 24 and 31 (all distinct). Actions: 9, including a 6-minute away action, a 3-minute busy text and the staff call. "About six minutes of play" is judged from the item and action counts only.
- The scripted path (17 actions) queues the chat message sent at 5 until 6, misses the knock at 11 while the player is away (reason "away"), calls staff at minute 32, ends the night, and gives the replay 17 decision events and five rows.
- Final: `cd apps/night-desk && pnpm exec vitest run` exit 0, 20 files, 121 tests (107 before, +14: 2 content lint, 3 scenarios, 7 desk, 2 new). Root `pnpm test` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0, `pnpm check:boundaries` exit 0 (258 files), `pnpm test:tooling` exit 0 (57). Per-package, run alone: kit 275, dead-air 454, night-desk 121, tooling 57; total 907 (was 893).
- real-time length: not run
- A human read of the night's text is still required (Req 5.2): not run.
## Stop hook failure after Night Desk 2.3: kit Property 8 (focus tone)
- Hook: `.kiro/hooks/verify-on-stop.json` (`verify-before-done`, Stop) runs `node scripts/kiro/verify.mjs`, which runs `pnpm -s typecheck`, then `pnpm -s test`, and blocks with the last 40 lines of output. The only line it showed, `boundaries: ok (258 files)`, is the first line `pnpm test` prints and is not the failure; with `-s` the per-package output is cut from the hook's tail.
- Real exit codes at first run: `pnpm -s typecheck` 0, `pnpm -s test` 0, `pnpm check:boundaries` 0, `pnpm test:tooling` 0 (57), night-desk vitest 0 (121), dead-air vitest 0 (454). Kit vitest, run alone from `packages/hindsight`: exit 1, 1 failed of 275. A property test draws a new seed on each run, so the root runs passed by chance and the failure was intermittent.
- Failure: `src/replay/tone.prop.test.ts`, "ink is what the focus knew...", seed 971708861, path `262:2:10:11:11:12:15:15:14:14:5:4:4:4:4:4`. Shrunk input: events `arrival m4 p3->p2 received @0` and `sent m4 p3->p2 @1`, cursor 0, focus p2. `knownAt` says p2 holds m4 at 0, but the layout drew the signal `faded` because it was sent at 1, after the cursor.
- Cause: the ledger counts an arrival as known whatever its send time (only outcomes before their send are ignored). `layoutWorldlines` required `sentByT` for the recipient to be in ink, so the two disagreed.
- Fix: in `packages/hindsight/src/replay/worldlines.ts` the recipient's focus tone now depends on the message having been received intact by the cursor (`arrivedAt <= cursor`), not on the send time; the sender's still needs `sentByT`. The property, its generator and its run count are unchanged. Added the shrunk input as an example in `worldlines.test.ts`.
- After the fix (foreground, `cmd; echo "exit=$?"`): kit vitest exit 0 twice (276 tests, 56 files); night-desk vitest exit 0 twice (121); `pnpm -s typecheck`, `pnpm -s build`, `pnpm -s test`, `pnpm check:boundaries`, `pnpm test:tooling` all exit 0. dead-air was not re-run after the fix (its package does not change; it passed at 454 before).

## Night Desk 2.4

- Added `scenarios/briefs/lockout-marsh-2.md`, `scenarios/lockout-marsh-2.ts`, `scenarios/desk/lockout-marsh-2.ts` and `scenarios/desk/lockout-marsh-2.test.ts`. No existing test or lint was edited. The existing content lint, scenario checks and desk checks picked the night up with no edit and passed on the text as written.
- Content: the fictional Marsh Hall; a student locked out of room 212, a roommate who will not open the door, and a quiet-hours disagreement. The handoff note (source `staff`) states an invented house rule for lending a spare key. Tags `lockout`, `roommate`, `guest-rules`. The item at minute 29 is `needsProfessional`, and the staff call is always an action.
- Simulated length: 38 minutes (`endsAt` 38, starting 10:40 pm). Item count: 7, at minutes 0, 2, 6, 9, 15, 22 and 29 (all distinct). Actions: 9. "About six minutes of play" is judged from the item and action counts only.
- Scripted path (16 actions): misses the knock at minute 9 while the player is away (reason "away"), calls staff at minute 29, ends the night, and gives the replay 16 decision events and five rows. A first draft of the path stopped at minute 36 and the test failed on `ended`; the path was corrected (one more wait), no assertion was weakened.
- Night-desk counts, `cd apps/night-desk && pnpm exec vitest run` (dot reporter): exit 0, 23 files, 151 tests. This total includes files the parallel `leak-ferris-1` work had added by then. Root `pnpm typecheck` exit 0. Root `pnpm check:boundaries` exit 0 (265 files). `pnpm test` and `pnpm build` were not run for this task.
- real-time length: not run
- human read: not run
## Night Desk 2.5: night 4, a leak and an ambiguous alarm
- Added `scenarios/briefs/leak-ferris-1.md`, `scenarios/leak-ferris-1.ts`, `scenarios/desk/leak-ferris-1.ts`, `scenarios/desk/leak-ferris-1.test.ts` (one scripted path) and `src/nights.test.ts` (new file: four nights, the first guided, the other three with 6 to 10 items). No existing test or lint was edited. The `scenario-from-brief` hook fired on saving the brief; the scenario file had already been written by this session.
- Content: the fictional Ferris Hall. Water spreads along a second-floor corridor and a short beep may be a low battery or may not. No injury, medical situation or weapon. The call at minute 19 is marked `needsProfessional`, and the staff call is always an action. The existing content lint passed on the text as written.
- Simulated length: 40 minutes (`endsAt` 40, starting 10:50 pm). Item count: 7 at minutes 0, 3, 8, 13, 19, 24 and 33 (all distinct). Actions: 9. "About six minutes of play" is judged from the item and action counts only.
- The scripted path (17 actions) queues the floor chat message sent at 24 until 25, misses the knock at 13 while the player is away, calls staff at minute 27, ends the night, and gives the replay 17 decision events and five rows.
- Counts: `cd apps/night-desk && pnpm exec vitest run` exit 0, 23 files, 151 tests. The four-night assertion passed because the Night 3 files (`lockout-marsh-2`) were on disk by then. Root `pnpm typecheck` exit 0, `pnpm check:boundaries` exit 0 (265 files). Root `pnpm test` and `pnpm build` were not run for this task.
- real-time length: not run
- human read: not run

## Night Desk 3.1

Task 3.1, "Write a log entry" (Req 2.5, Property 5). Run on 2026-11-24, each command in the foreground.

### Baseline, before any change

| Command | Exit | Counts |
|---|---|---|
| `pnpm test` | 0 | boundaries ok (265 files); tooling 7 files, 57 tests |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (265 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 tests |
| night-desk vitest (own folder) | 0 | 23 files, 151 tests |
| dead-air vitest (own folder) | 0 | 63 files, 454 tests |
| hindsight vitest (own folder) | 1 | 56 files, 275 passed, 1 failed (276) |

The one kit failure is `src/replay/in-transit.prop.test.ts` (kit Property 7, `seance-replay`), seed `1613359026`, path `199:10:9:11:10:13:13:13:10:11:4:3:3:3`. The shrunk input is a ledger whose events are `arrival` of `m5` (p1 to p2, received) at minute 0 and `sent` of `m5` at minute 1, cursor 0, focus `p2`. The arrival is earlier than the send, so the generator produced a ledger that cannot occur. The assertion that failed is `expected 'ink' to be 'faded'`. The same file passed on an immediate re-run, and the root `pnpm test` passed in the same session (exit 0). This is a seed-dependent flake in kit code. The task said not to touch the kit, so I left it alone. It is not caused by Night Desk and needs its own fix in `seance-replay` (constrain the generator so `arrival` is never before `sent`, or make the layout handle it). The 276 count above is the kit total in the passing runs.

### Final, after the change

| Command | Exit | Counts |
|---|---|---|
| night-desk vitest (own folder) | 0 | 25 files, 156 tests |
| `pnpm test` | 0 | boundaries ok (267 files); tooling 7 files, 57 tests |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (267 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 tests |
| dead-air vitest (own folder) | 0 | 63 files, 454 tests |
| hindsight vitest (own folder) | 0 | 56 files, 276 tests |

Per package: kit 276, dead-air 454, night-desk 156 (was 151, +5), tooling 57. Total 943. The root `pnpm test` output is too long to read per-package counts, so the package counts come from each folder's own vitest run.

### What changed

- A `log` action (kind `log`, cost 2, `attention: "busy"`, key `l`, label "Write a log entry") is in all four desk scripts, and in each scenario's `decisionPrompts.ra.options`.
- `scenarios/desk/guided-first-night.ts`: `rev` 1 to 2, and a third guide step "Write down what you know." that is done by any action of kind `log`. The guided night has 3 steps (was 2), 6 actions (was 5) and 3 items. `endsAt` is still 20. The two required steps cost 8 minutes and the log costs 2, so the first run stays inside the 20-minute night. Length is judged by those counts only, not played in real time.
- `Night.tsx`: choosing the log action opens a panel in place of the action list. It has a legend with the clock ("Write a log entry at 11:18 pm"), one checkbox per item that has reached the player (by its title, keys 1 to 9), "Record entry" (Enter) and "Cancel" (Escape). Recording calls `onAction("log", { facts })` with the ticked facts in the order they reached the player. Zero ticked facts is allowed and records an empty entry. A section "Your log" lists each entry with its clock and the titles. Panel state (open, ticked) is React state only; the log stays the only game state.
- `App.tsx`: `onAction` passes `opts` to `applyAction`. The model (`night.ts`, `types.ts`) already carried `facts` and rejected unknown facts, so it needed no change.
- New tests: `src/screens/Night.log.test.tsx` (4 tests) and `src/model/log-entry.prop.test.ts` (Property 5, 200 runs).

### Decisions

- **Only the guided night's `rev` was bumped.** It changed meaning (a new guide step). The other three nights only gained an action; every log recorded under the old scripts still folds identically, so their `rev` stays 1 and saved links keep working.
- **One existing test was edited, and why.** `App.flow.test.tsx`, "walks the guided night". It presses each action's key and expects the clock to move. The log action now takes two steps (the key opens the panel, Enter records), so the test checks that the panel is open and the clock has not moved, ticks fact 1, presses Enter, and then applies the same clock check. It still verifies every script action shows its key and every action is visited. No other desk, flow or scripted-path test changed, and none failed.
- **Property 5** (`// Feature: night-desk, Property 5: ...`) runs 200 fast-check runs over the four shipped nights and the synthetic fixture. Each run walks a random valid action sequence, then (a) for a random subset of delivered ids, `applyAction` with the `log` action succeeds, adds exactly one entry with `at` equal to the clock before it and `facts` equal to the subset, and the re-fold advances the clock by the cost; (b) for every item not yet delivered (future, missed or expired) and for random strings, adding it to that subset is rejected with `unknown-fact` and the log is unchanged; (c) once the night has ended, the log action is rejected and the log is unchanged. It passed on the first run, so the model needed no fix and no combination of events was excluded. I did not need a justification in design.md and did not edit it. No seed or shrunk input to report for Property 5, because it did not fail. fast-check picked the seed per run; I did not pin one.
- **Empty fact list is valid.** Property 5 says "any subset", and the empty set is one.
- **Files outside scope were not touched:** the kit, Dead Air, meta files, `.playwright-mcp`, evidence, design.md and tasks.md. No dependency added. No git writes. The commit-plan script was not run.

### Not run

- Real-time length of the guided night with the extra step, and the 60-second first choice: not run.
- Screen-reader and browser checks of the log panel (focus moves to the first checkbox on open and back to the clock heading on close, checked in jsdom only): not run in a browser.
- Task 3.1 is not marked `[x]` in `tasks.md`; the orchestrator decides that.

## Replay (seance-replay), task 1.9, Property 7: one well-formedness rule, 2026-11-23

### Failure
`packages/hindsight/src/replay/in-transit.prop.test.ts` (Property 7), seed `1613359026`. Shrunk input: `arrival` of `m5` (p1 to p2, received) at minute 0, `sent` of `m5` at minute 1. This is the fifth counterexample of one shape: an outcome or arrival dated earlier than its message's own `sent`.

### Rule (written once, in `.kiro/specs/seance-replay/design.md`, section "Well-formedness rule for outcomes and arrivals (2026-11-23)")
Any `outcome` or `arrival` for message id `m` earlier than `m`'s first `sent` is contradictory. Every ledger query and the layout ignore it, and `layout.skipped` lists `m` when nothing valid remains for it. An `arrival` for an id with no `sent` is still valid (the arrivals-only case). An event at the same time as the send is not earlier and stands.

### Superseded decision
The stop-hook fix for seed 971708861 (entry above) inked the recipient's tone for a `received` arrival dated before its send, because `knownAt` counted it. That is withdrawn: `knownAt` no longer counts such an arrival, and the special case in `worldlines.ts` is removed (the recipient's ink now needs the send to be at or before the cursor, which the receipt implies).

### Implementation
- `ledger/ledger.ts`: `contradictsSend` and `contradictedIds` (new), `sentTimes` now takes the earliest send, and `settledEvents` (behind `receivedAt` and `firstLoss`) applies the rule to arrivals as well as outcomes. `knownAt`, `lostAt`, `inTransitAt` and `closedFates` already go through those.
- `replay/worldlines.ts`: uses `receivedAt`, `firstLoss` and `contradictedIds`; `skipped` is now "contradicted and nothing valid remains" for both outcomes and arrivals. Before, an id was skipped whenever an outcome preceded its send, even if a valid outcome was also drawn.
- `ledger/clear-line.ts`, `ledger/habits.ts`, `replay/layout.ts` (`layoutReplay`): the same helper, so no query reads a contradictory event. In `clearLine` a received outcome earlier than the first send no longer lowers the clear time.
- Generators were not changed. No property was weakened, skipped or narrowed.

### Tests
- Added in `ledger/ledger.test.ts`: "ignores an arrival earlier than its send (Property 7, seed 1613359026; Property 8, seed 971708861)" and "still counts an arrival for an id with no send at all".
- Added in `replay/worldlines.test.ts`: the same two seeds through the layout (skipped, nothing drawn), an arrival with no send still drawn, and a valid outcome next to a contradictory one keeps the message drawn.
- Changed because it asserted the superseded behaviour: `replay/worldlines.test.ts`, "draws in ink a message the focus holds through an arrival logged before its send (Property 8, seed 971708861)". It is replaced by the seed test above.
- Changed because its oracle encoded the superseded behaviour: `ledger/known-set.prop.test.ts`, Property 1, `expectedKnown`. It counted every received arrival; it now ignores one earlier than the first send of its id, as it already did for outcomes. The property, generator (`ledgerArb`) and run count (300) are unchanged. After the rule was in place this oracle failed once, seed `2087704494`, on `arrival m2 p1->p1 received @0` and `sent m2 p1->p1 @1`, which is the same class.
- No other existing test changed. No app code changed; no app test relied on the superseded behaviour.

### High-run search
- Setting: a temporary `vitest.search.config.ts` (include `src/**/*.prop.test.ts(x)`, `testTimeout` 600000) and `vitest.search.setup.ts` in `packages/hindsight`. The setup file used `vi.mock("fast-check")` to wrap `assert` so that every call ran with `numRuns: 5000`, replacing the explicit 100 to 300 in each test. A temporary test confirmed the predicate ran 5000 times for a test that asked for 300. Command: `pnpm exec vitest run --config vitest.search.config.ts --reporter=basic`.
- Result: 23 files, 58 tests, all passed, exit 0, 19.6 s, random seeds. No counterexample, so no second class to report. A search before the Property 1 oracle was corrected is not counted; that failure came from the ordinary suite.
- Reverted: the three temporary files (config, setup, sanity test) were deleted; no source or test file carried the setting.

### Final checks (real exit codes)
| Command | Exit | Result |
| --- | --- | --- |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `pnpm test` | 0 | boundaries ok (267 files); kit, apps and tooling passed |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (267 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd apps/night-desk && pnpm exec vitest run` | 0 | 25 files, 156 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

Kit count is 280, up from 276 by four new example tests. Not run: a browser check of the replay view.

## Night Desk 3.4

The replay page is now a document (`apps/night-desk/src/screens/Document.tsx`). Req 4.1 to 4.3.

### Page structure
- One `h1`, then four `h2` sections: "The night in brief" (the `narrate` summary), "What reached you, and when" (the kit's `ReplayView`), "Each choice" (an ordered list, labelled by its heading, one sentence per decision from `narrate`), "Three habits" (a definition list built from `habitRows`: label, figure, fixed line), and "What next".
- `ReplayView` is passed `sections={{ summary: false, prompts: false, habits: false }}`. Night Desk keeps its own habits and narration. `habits: false` is the kit's default and is written out so the intent is visible.
- The three actions "Play it again", "Choose another night" and "Copy link" are disabled buttons, each with a visible reason ("Available once replaying a night is built.", "Available once the night picker is built.", "Available once share links are built.") linked by `aria-describedby`. A comment on `ACTIONS` in `Document.tsx` says task 4.3 (first two) and task 4.2 (Copy link) delete the `reason` and the disabled state.
- Styles added to `styles.css`: hairline-divided list and habit rows, grey reason text, disabled button colour. No colour for loss is used on this page.

### Decisions
- The page calls `narrate` and `habitRows` itself; the model files are unchanged.
- No new property was needed and no property was changed, skipped or weakened.
- Existing test query changed: `App.flow.test.tsx` `actionButtons()` now also excludes disabled buttons, because the page now has three disabled buttons and the test means "page actions that can be used". The `group` queries for the replay did not change.

### Tests
- New `screens/Document.test.tsx` (6 examples): heading levels and labelled ordered list; summary and one sentence per decision; three habit terms with their fixed lines; replay group labelled, no table, no "score" anywhere on the page; three disabled actions with visible reasons; across all four nights, played so that items are missed, neither the body nor the title of a missed item appears on the page (and at least one item was missed).

### Final checks (real exit codes)
| Command | Exit | Result |
| --- | --- | --- |
| `cd apps/night-desk && pnpm exec vitest run` | 0 | 26 files, 162 passed |
| `pnpm test` | 0 | boundaries ok (268 files); kit, apps and tooling passed |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (268 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

Browser and screen-reader check of the document page: not run.

## Night Desk 4.1

Log codec and reload restore (Req 6.3, 4.4). Dated 2026-11-23.

### Developer override
The task text says an unrestorable save is cleared and the start screen shown. The developer's standing rule is never to delete saved runs automatically (already in force for Dead Air's RunHost), so this was built instead:
- A save that is unreadable, unsupported, from another `rev` (or seed), for an unknown night, or fails `foldNight` is kept untouched. `clear()` is never called automatically.
- One sentence names the reason ("Your saved night could not be opened (...), so this is a new night. The saved night has been kept."), then the start screen shows.
- The new night stays in memory and is not saved while that save exists ("This new night will not be saved while that saved night is kept."). The same key is used; no separate key was added, because a held night is simply not written.
- "Discard the saved night" is the only caller of `clear()`. After it, the night in progress is saved at once and every later action is saved.
- A `Storage` that throws (on read or on write) means the night continues in memory with one line: "This night will not be saved on this device."
- `loadSaved` returns `none`, `storage-error`, `resume` or `unusable` (with a reason) instead of a bare log. Noted in design.md and tasks.md (one line each).

### Files
- New: `src/model/codec.ts`, `src/model/storage.ts`, `src/test-storage.ts` (recording fake Storage and a token helper for tests).
- Tests: `codec.test.ts` (9), `codec.prop.test.ts` (2, Property 7), `storage.test.ts` (4), `App.reload.test.tsx` (5), `App.saved.test.tsx` (6).
- Changed: `App.tsx` (restore, save after every action, held and memory modes, discard button), `screens/Start.tsx` and `screens/Night.tsx` (a `notice` slot only), `src/test-setup.ts` (empties `localStorage` before and after each test so UI tests do not see each other's saves).
- `markCompleted` and `completed` exist and are tested; nothing calls them yet (task 4.3).

### Property 7
Two fast-check tests, 200 runs each, tagged `// Feature: night-desk, Property 7`. Round trip of valid logs from all shipped nights and the synthetic fixture (including `log` entries with facts), same `foldNight` after decode, same state after save and `loadSaved` through a fake Storage, reading never writes. Junk strings and truncated tokens return an error and never throw, and junk in storage is left byte-identical. It passed on the first run; the model was not changed and nothing was constrained, skipped or weakened.

### Test mistakes fixed while writing
Three of my own tests failed at first (a query matched the replay's SVG buttons; two tokens were built with padded base64 instead of base64url). All were test mistakes, fixed in the tests; the codec was not changed.

### Final checks (real exit codes)
| Command | Exit | Result |
| --- | --- | --- |
| `cd apps/night-desk && pnpm exec vitest run` | 0 | 31 files, 188 passed (was 162) |
| `pnpm test` | 0 | boundaries ok (276 files); kit, apps and tooling passed |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (276 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

reload in a real browser: not run

## Night Desk 4.2

Share link. A finished night's document has a "Copy link" that builds `<origin><base>#r=<token>` (`encodeLog`). A fresh `App` that is given such a fragment opens the document directly.

### Decisions
- **One control, the kit's.** `Document.tsx` passes `shareUrl` to the kit's `ReplayView`, which copies with `navigator.clipboard` or shows the link in a read-only "Link text" field. Night Desk's own disabled "Copy link" entry was removed (with its reason and the 4.2 comment). Reason: the kit button already has the clipboard and fallback behaviour, is tested in the kit, and keeping both would show two "Copy link" controls. `Document.test.tsx` asserts there is exactly one, enabled.
- **Precedence without writes.** A valid `#r=` link wins over storage. In that case storage is not even read, and nothing in the document screen saves. Tests check storage is byte-identical and `setItem` and `removeItem` are never called, with an empty, an in-progress and an unusable saved night.
- **Bad link.** Malformed, empty, over 8 KB, wrong shape, unknown night, a log that does not replay, or a night that is not over: "This link could not be read, so this is a new night." Another `rev` or seed: "This link was made for an older version of this night, so this is a new night." Then the start screen shows.
- **Bad link with a saved night in progress** (a decision I made, not in the spec text): that save is kept and the new night is held in memory, using the existing "held" mode and its "Discard the saved night" button, because starting a night would otherwise overwrite the visitor's own save. With no save, or an unusable one, the existing rules apply unchanged.
- **A link must be of a finished night.** The Copy link button exists only on the document, so a link to an unfinished night is treated as unreadable.
- **Missed items.** A log holds only action ids, minutes and fact ids. A test plays a night in which items were lost and checks that no missed item's body text is in the decoded link or in the shared document.
- **No network.** A `fetch` spy is not called when finishing a night, copying the link, or opening a link.
- **Offline.** A `#r=` fragment is never sent in a request. The worker (`scripts/site/service-worker.mjs`, `navigate`) answers a navigation to `<base>` from the network, and on timeout or failure from the precached `<base>index.html` looked up by its fixed URL. So an offline visit to a shared link gets the app page and `App` reads the fragment. This is from reading the code and `service-worker.test.mjs`, not from a browser run.
- **Property failures:** none. No property was changed, skipped or weakened. The model was not changed.

### Files
- Changed: `src/App.tsx` (`readShared`, `hash` prop, bad-link sentences), `src/screens/Document.tsx` (`shareLink`, `shareUrl` to `ReplayView`, "Copy link" entry removed).
- New: `src/App.share.test.tsx` (17 tests).
- Tests adjusted: `src/screens/Document.test.tsx` (two disabled actions plus one enabled Copy link), `src/App.flow.test.tsx` (the helper that lists the night's own action buttons also leaves out the kit's "Copy link"), `src/screens/Document.keyboard.test.tsx` (comment only).

### Final checks (real exit codes)
| Command | Exit | Result |
| --- | --- | --- |
| `cd apps/night-desk && pnpm exec vitest run` | 0 | 32 files, 205 passed (was 188) |
| `pnpm test` | 0 | boundaries ok (277 files); packages and tooling passed (output too long to read counts) |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (277 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

share link opened on another device or browser: not run
offline link in a real browser: not run

## Night Desk 4.3

Play it again, choose another night, and the picker (Req 4.4, 1.2).

### Decisions
- **Start.** `Start` opens the guided night until its id is in `completed`, and the picker afterwards (design assumption 4). Any finished night is recorded with `markCompleted`, written when the night ends; only the guided id is consulted by `Start`. `markCompleted` writes the completed key, never the log key, so it also runs while an unusable save is held.
- **Play it again clears only that night's own saved log.** It reads the save with `loadSaved` first and calls `clear` only for a usable save whose `scenarioId` is the night on screen. An unusable save is never cleared: the app switches to the held state and the new night runs in memory, so the held save stays byte-identical. The completed records are never touched. If saving is already held or in memory-only mode, no storage call is made at all. `clear` now has two callers (the discard button and this one); the comments in `App.tsx` say so.
- **Shared-link page (`#r=`). What I chose:** "Play it again" and "Choose another night" make no storage call of any kind, reads included, and the new night is not saved yet. Storage is first read on the visitor's first action in that new night. Then: nothing saved, or a finished save, means saving turns on and the new night overwrites it (the same one-slot behaviour as a normal "Choose another night"). A save that is in progress or unusable is kept, and the new night is held in memory with the existing "Discard the saved night" button. A storage error means memory-only. Reason: starting from a link must not destroy a night the visitor has in progress.
- **Choose another night** does not clear anything. The old finished save is replaced by the first action of the chosen night. If the visitor reloads before that action, the finished night shows again.
- **Picker.** `screens/Picker.tsx`: a dense list, one button per night showing title, tags and simulated length (`endsAt`, in minutes). No search field; that belongs to 4.4. The picker also shows the held/memory notice.
- **Document.** The two disabled entries, their reasons and the 4.3 comment are gone; `Document` takes `onPlayAgain` and `onChooseAnother`. Their disabled and reason styles were removed from `styles.css`.
- **Property failures:** none. No property was changed, skipped or weakened. The model was not changed.

### Files
- Changed: `src/App.tsx`, `src/screens/Document.tsx`, `src/styles.css`.
- New: `src/screens/Picker.tsx`, `src/screens/Picker.test.tsx` (2 tests), `src/App.nav.test.tsx` (8 tests).
- Tests adjusted for the new required `Document` props and the two new buttons: `src/screens/Document.test.tsx`, `src/screens/Document.keyboard.test.tsx`, `src/model/replay-participants.test.tsx`, `src/App.flow.test.tsx`.

### Final checks (real exit codes)
| Command | Exit | Result |
| --- | --- | --- |
| `cd apps/night-desk && pnpm exec vitest run` | 1 on first run, then 0 | first run: 2 failed in `App.flow.test.tsx` (its helper counted the new enabled buttons as night actions); after fixing the helper, 34 files, 215 passed (was 205) |
| `pnpm test` | 0 | boundaries ok (280 files); tooling 57 passed; the package counts are below |
| `pnpm typecheck` | 0 after one fix | first run exit 2 (`replay-participants.test.tsx` lacked the new props); fixed and rerun |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (280 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

picker and replay navigation in a real browser: not run

## Night Desk 4.4

Picker search above seven nights. New: `model/picker.ts`, `picker.test.ts`, `picker.prop.test.ts` (Property 10, 200 runs, passed on the first real run; no failing seed), `screens/Picker.search.test.tsx`. Changed: `Picker.tsx`, `styles.css`.

| Command | Exit | Result |
| --- | --- | --- |
| `cd apps/night-desk && pnpm exec vitest run` | 0 | 37 files, 224 passed (was 215) |
| `pnpm test` | 0 | boundaries ok (284 files); tooling 57 passed; packages below |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (284 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

An earlier run of the property file failed at import (`fc.stringOf` does not exist in this fast-check version); the generator was changed to `fc.string({ unit })` and nothing else.

picker search in a real browser: not run

## Night Desk 5.1

Voice playback layer: `src/voice/voice.ts` (`createVoice(factory)`, `audioClipFactory`), a sound button in the night header, and the delivery hook in `src/screens/Night.tsx`. The factory is called only when a clip plays, so no `Audio` object exists before then. Sound starts off. A clip plays only for an item that arrives after mount, after the first `pointerdown` or `keydown`, with sound on; earlier items are dropped, not queued. Unmount closes the voice and stops any clip.

The button reads "Sound off" or "Sound on" and carries the key `M`. `M` is bound only when no action of the night uses it; if one does, the action keeps the key and the button shows no hint.

Test change outside the new tests: `App.flow.test.tsx` `actionButtons()` now also skips the sound control. The walk test looks every button up in `script.actions` and the sound control is not a script action, so it would have failed.

| Command | Exit | Result |
|---|---|---|
| `cd apps/night-desk && pnpm exec vitest run` | 0 | 39 files, 237 passed (was 224; `voice.test.ts` 7, `Night.sound.test.tsx` 6) |
| `pnpm test` | 0 | boundaries ok (287 files); tooling 57 passed; packages below |
| `pnpm typecheck` | 0 | |
| `pnpm build` | 0 | `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (287 files) |
| `pnpm test:tooling` | 0 | 7 files, 57 passed |
| `cd packages/hindsight && pnpm exec vitest run` | 0 | 56 files, 280 passed |
| `cd apps/dead-air && pnpm exec vitest run` | 0 | 63 files, 454 passed |

real audio playback: not run (no clips exist)
voice generation and MANIFEST.md: out of scope, not done

## Night Desk 6.1

- The IBM Plex font files and the OFL licence were absent from Night Desk before this task.
- They were downloaded on 2026-11-23 from the official IBM Plex repository (`github.com/IBM/plex`) at release tags `@ibm/plex-sans@1.3.6` and `@ibm/plex-mono@2.5.0`, into `apps/night-desk/public/fonts/`. The Latin1 subsets are 61,148 bytes in total for the three faces. `OFL.txt` is the release's `license.txt`. URLs and SHA-256 checksums are in that folder's `README.md`.
  - `IBMPlexSans-Regular.woff2` `bdb53f2af84b15e0a742428f5e199dacc3e6fd60776f0aebd9f700e2c97c960f`
  - `IBMPlexSans-Medium.woff2` `668a0d9eabbfac0925f431988f56222b8b989ad66a0a78e91bc5889f73fe274a`
  - `IBMPlexMono-Regular.woff2` `e8993d946649b9d01abb1ed06d574b19d8ea3e66b5c3948602db335c44c18e56`
  - `OFL.txt` `91c25c350d3cac39da2736d74f7ba37ef648f5237a4e330a240615bc8d8c4360`
- `styles.css` now declares three `@font-face` rules with `font-display: swap`; `fonts.test.ts` checks the files, the URLs and the 200 KB limit.
- Open gap: Dead Air's own font files in `apps/dead-air/public/fonts/` have no recorded source. They were left untouched and not copied.
- font rendering in a real browser: not run

## Night Desk 6.2

Tokens, dark appearance, reduced motion, focus, contrast.

- `apps/night-desk/src/styles.css`: colours, the type scale (`--fs-13` to `--fs-72`), radius (`--radius-control` 2 px, `--radius-surface` 0), spacing (`--s` 8 px) and fonts (`--sans`, `--mono`) are custom properties. Token names match the kit replay (`--paper`, `--ink`, `--grey-1..3`, `--loss`), so the replay inside Night Desk follows the appearance. `color-scheme: light dark` is set. A `prefers-color-scheme: dark` block gives `#141311` paper, `#F5F2EA` ink, grey-1 `#A9A59B` (text), grey-2 `#6B6861` (hairlines only), grey-3 `#34322D` and loss `#D9806A` (the same dark loss Dead Air uses). The reduced-motion block and the 2 px ink focus outline are kept. No gradient, shadow, filter or animation exists in the file.
- Dark loss colour: the light `#9A3B26` is not used in dark; `#D9806A` passes (below).
- New tests: `src/contrast.test.ts` (13) and `src/styles.test.ts` (6). Colours are read from the CSS. No threshold was lowered and no pair failed.
- Not touched: the kit, Dead Air, meta files, `.playwright-mcp`, evidence, components.

### Contrast (WCAG 2.x, computed by the test)

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| ink on paper | 15.71:1 | 16.60:1 | 4.5 |
| loss on paper | 6.20:1 | 6.41:1 | 4.5 |
| grey-1 on paper | 4.97:1 | 7.55:1 | 4.5 |
| ink on grey-3 (button pressed) | 12.47:1 | 11.44:1 | 4.5 |
| ink outline and control border on paper | 15.71:1 | 16.60:1 | 3 |
| grey-2 on paper (hairline, not text) | 2.20:1 | 3.34:1 | none |
| grey-3 on paper (hairline, not text) | 1.26:1 | 1.45:1 | none |

`#A9A59B` is `--grey-2` in light and is never a text colour. In dark the text grey `--grey-1` has the same hex value, by the same inverse mapping Dead Air uses; the test checks the `--grey-2` role and the `a9a59b` literal in `color` declarations, and the light palette is pinned by value.

### Commands

| Command | Exit | Result |
| --- | --- | --- |
| `cd apps/night-desk && pnpm exec vitest run` | 0 | night-desk 260 passed (42 files) |
| `pnpm test` | 0 | kit 280, night-desk 260, dead-air 454, tooling 57 |
| `pnpm typecheck` | 0 | clean |
| `pnpm build` | 0 | clean, `assemble: ok` |
| `pnpm check:boundaries` | 0 | ok (292 files) |
| `pnpm test:tooling` | 0 | 57 passed (7 files) |

Night-desk went from 241 to 260 (19 new tests).

- reduced motion in a real browser: not run
- dark appearance seen by a person: not run

## Night Desk 7.1

Date: 2026-11-23. Task: property tests for the attention model (Req 2.2, 2.3).

- Added `apps/night-desk/src/model/night.prop.test.ts` (fast-check, 300 runs per property, each tagged `// Feature: night-desk, Property N: ...`).
- Subjects: every shipped night (guided, loud-music-harlow-3, lockout-marsh-2, leak-ferris-1) and the synthetic fixture script. Walks pick among `availableActions` at each step; `log` actions record a random valid subset of delivered items as facts. Walks are up to 60 steps. A separate example test confirms a walk reaches the end of every night.
- Property 1: clock advances by each action's cost, each entry's `at` equals the clock before it, `at` is strictly increasing, and altering one entry's `at` (earlier or later) is rejected as `clock-mismatch` at that index.
- Property 2: no item delivered twice, `deliveredAt >= sentAt`, an item sent inside a busy/away action is delivered at that action's end, an item whose wait would exceed `expiresAfter` is never delivered and is listed as missed, and every item with `at <= now` is in exactly one of delivered or missed.
- Property 3: a phone or door item inside an away action is missed with reason `away` and its send minute, and no string field of any missed item equals or contains an item body from the scenario.
- Result: all three properties passed on the first run. No counterexample was found, so no model change was made and no example test was added. `attention.ts`, `night.ts` and `design.md` were not changed. No generator constraint was applied.
- `cd apps/night-desk && pnpm exec vitest run`: 44 files, 266 tests passed, exit=0.
- `pnpm typecheck` at the root: exit=0.
- Not run in this task: `pnpm build`, `pnpm check:boundaries`, root `pnpm test`.

## Night Desk 7.2

Property 6 (determinism), `apps/night-desk/src/model/determinism.prop.test.ts`.

- **Property test** (`// Feature: night-desk, Property 6`, `numRuns: 150`). For every shipped night and the synthetic fixture, a random valid action sequence (choices among `availableActions`) is built through `applyAction`. Asserted equal: two folds of the same log; a fold of a log rebuilt entry by entry through `applyAction`; a fold of a JSON copy; the rebuilt log itself; `toLedger`; `layoutReplay`; and `layoutWorldlines` (closed record and `at: 12`, with `toParticipants`). Folded `NightState` is compared with `toEqual`.
- **Seed example.** The fixture's only `lapse` item, `i6`, has `lapse: 1`, which drops it for every seed, so the fixture alone cannot show the seed in use. The design does not name the fixture as the place to change that, so `fixtures.ts` is unchanged. The example test uses a copy of the fixture with `lapse: 0.5` on `i6` and a busy `log` action covering minute 17. Seeds 1 to 40 give more than one distinct missed set, and the same seed twice gives the same set. A third test records that the fixture's own lapse is 1.
- **Counterexamples.** None. No model change and no generator constraint, so `design.md` is unchanged.
- **Checks.** `cd apps/night-desk && pnpm exec vitest run`: exit 0, 45 files, 269 tests passed (the other agent's `night.prop.test.ts` was not part of this count unless already present at run time). Root `pnpm typecheck`: exit 0. `pnpm test`, `pnpm build` and `pnpm check:boundaries` were not run for this task.

## Night Desk 7.1 and 7.2 combined check (2026-11-23)

- **Per-package runs (exit 0 each).** `apps/night-desk` 45 files, 269 tests. `packages/hindsight` 56 files, 280 tests. `apps/dead-air` 63 files, 454 tests.
- **Root (exit 0 each).** `pnpm test` (boundaries ok on 295 files, tooling 57 tests in 7 files), `pnpm typecheck`, `pnpm build`, `pnpm check:boundaries`, `pnpm test:tooling` (57 tests).
- **Collection.** `vitest list --filesOnly` in `apps/night-desk` lists both `src/model/night.prop.test.ts` and `src/model/determinism.prop.test.ts`, so both are in the 269.
- **Failures.** None. No code, model or `design.md` change.
- **Not covered.** Task 6.3 is still open and is not recorded as done here.

## Night Desk 6.3

- **Keyboard test.** `apps/night-desk/src/App.keyboard.test.tsx` (jsdom, no pointer) passes. It presses Enter on Start, Tabs to an action and runs it with Enter, uses action keys, toggles sound with `m`, opens the log panel with `l`, cancels with Escape, reopens it, ticks with Space and records with Enter. It then waits with `w` (and `3` for the door) until the night ends, finds the replay document without any extra step, and Tabs to "Play it again". After each step it checks that every action button shows its key as text and carries `aria-keyshortcuts`. No component bug was found.
- **Spacing fix.** The screenshots showed the key letter running into its label ("MSound off", "1Text on the duty phone", "Record entry2 min"). One rule in `apps/night-desk/src/styles.css` now gives those buttons and log-panel labels a flex layout with an 8 px gap. The cause was plain from the CSS (no gap on those elements). The fix has not been looked at in a browser.
- **Screenshots.** `docs/evidence/night-desk-6.3/` holds 34 PNGs, described one by one in its `README.md`. An agent in Chromium captured them in a run that was cancelled. They were not re-measured, and scroll and focus figures were not recorded. Looking at four of them, the night screen at 1280×720 fits without scrolling, and the document is a long page (1280×2158) by design. In the replay, the first decision label is crossed by the first message line.
- **Counts.** `apps/night-desk` 45 files, 269 tests. `packages/hindsight` 56 files, 280 tests. `apps/dead-air` 63 files, 454 tests. Tooling 7 files, 57 tests. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm check:boundaries` and `pnpm test:tooling` all exit 0.
- **Agent re-measurement of scrolling at 1280×720:** not run.
- **A person viewing 1280×720:** not run.
- **Focus visible to a person:** not run.
- **Reduced motion seen by a person:** not run.
- **Both appearances seen by a person:** not run.

## Night Desk final check (7.3, 2026-11-23)

Every command below ran in the foreground as `cmd; echo "exit=$?"`. Nothing was edited to make a check pass, and no check failed.

### Real exit codes

| Command | Where | Exit | Result |
| --- | --- | --- | --- |
| `pnpm typecheck` | root | 0 | three packages clean |
| `pnpm test` | root | 0 | boundaries ok (295 files); tooling 57 passed (output too long to read the other counts) |
| `pnpm build` | root | 0 | all three packages built; `assemble: ok` |
| `pnpm check:boundaries` | root | 0 | `boundaries: ok (295 files)` |
| `pnpm test:tooling` | root | 0 | 7 files, 57 passed |
| `pnpm test` | `packages/hindsight` | 0 | 56 files, 280 passed |
| `pnpm test` | `apps/night-desk` | 0 | 45 files, 269 passed |
| `pnpm test` | `apps/dead-air` | 0 | 63 files, 454 passed |

Final counts: kit 280, night-desk 269, dead-air 454, tooling 57 (total 1060). These equal the counts last recorded in the 7.1 and 7.2 combined check.

### Counts recorded in the earlier Night Desk sections

Night-desk test counts, in the order the sections were written (only the ones each section states):
- 1.1 baseline: 4. 1.2 baseline: 44, after it 57. 1.3: 64.
- 2.3 baseline: 107 (kit 275). The stop-hook fix raised the kit to 276 and night-desk to 121.
- 3.3: 107. 3.4: 162. 4.1: 188. 4.2: 205. 4.3: 215. 4.4: 224. 5.1: 237. 6.2: 260. 7.1: 266. 7.2: 269.
- Kit: 125 after the skeleton work, 275 at the start of 2.3, 276 after the stop-hook fix, 280 after 3.1 (four new examples). Dead Air: 79 at 1.2, 454 from 2.3 on. Tooling: 38 at 1.2, 57 from 2.3 on.
- Root `pnpm check:boundaries` file counts rose from 106 (1.3) through 255, 268, 276, 277, 280, 284, 287 and 292 to 295 now.

### Boundary output

```
> dead-air@0.0.0 check:boundaries
> node scripts/boundaries/run.mjs
boundaries: ok (295 files)
```

### `find dist/night-desk -type f`

```
dist/night-desk/index.html
dist/night-desk/fonts/IBMPlexSans-Medium.woff2
dist/night-desk/fonts/README.md
dist/night-desk/fonts/IBMPlexSans-Regular.woff2
dist/night-desk/fonts/OFL.txt
dist/night-desk/fonts/IBMPlexMono-Regular.woff2
dist/night-desk/assets/index-DXTpAMba.css
dist/night-desk/assets/index-DoGRbZnO.js
dist/night-desk/sw.js
```

There is no `voice/` folder, which matches 5.1 ("no clips exist").

### `.gitignore`

A search of `.gitignore` for "kiro" finds no match, so `.kiro/` is not ignored.

### Manual checks

- First choice within 60 seconds (Req 1.3): not run. An agent drove a preview build on 2026-11-23 (task 1.3 evidence, `docs/evidence/night-desk-1.3/`) and the start screen showed one focused Start button, but nobody timed a person.
- Each of the four nights within 8 real minutes (Req 2.6): not run, for all four. Lengths in 2.3 to 2.5 were judged from item and action counts only.
- No scrolling at 1280×720 (Req 2.1): not run. In 6.3 an agent in Chromium captured screenshots in a run that was cancelled; they were not re-measured, and no scroll figures were recorded. Looking at four of them, the night screen appeared to fit.
- Keyboard-only completion by a person (Req 6.1): not run. `App.keyboard.test.tsx` (jsdom, no pointer) plays a whole night by keyboard and passes automatically; that is not a person.
- Reduced motion (Req 6.2): not run. The CSS has the reduced-motion block and a style test checks it; no person or browser emulation looked at it.
- AA contrast in both appearances seen by a person: not run. `contrast.test.ts` computes every pair from the CSS and passes; the dark appearance has not been seen by a person.
- A screen-reader pass of the document page: not run.
- A human read of each night's text (Req 5.2): not run, for all four nights. The content lint passes; it is a heuristic.
- Task 1.3 exit criterion (a), the developer playing a night in the preview build: not run. An earlier agent session did drive a preview build; that is not the developer's check.
- Browser-only checks still open from the earlier sections:
  - 4.1: reload in a real browser: not run.
  - 4.2: share link opened on another device or browser: not run; offline link in a real browser: not run.
  - 4.3: picker and replay navigation in a real browser: not run.
  - 4.4: picker search in a real browser: not run.
  - 5.1: real audio playback: not run (no clips exist); voice generation and `MANIFEST.md`: not done, out of scope for that task.
  - 6.1: font rendering in a real browser: not run.
  - 6.2: reduced motion in a real browser: not run; dark appearance seen by a person: not run.
  - 6.3: agent re-measurement of scrolling at 1280×720, a person viewing 1280×720, focus visible to a person, reduced motion seen by a person, both appearances seen by a person: all not run. The spacing fix for key letters has not been looked at in a browser.

### Open items

- `design.md` contradicts the saved-run rule built in 4.1. The old row "The saved night is cleared" still sits above the override row; the app never clears a save automatically.
- Dead Air's font files in `apps/dead-air/public/fonts/` have no recorded source (noted in 6.1).
- 6.3 visual notes: in the replay, a decision label is crossed by a message line, and the log-panel checkbox uses the browser's default blue.
- 3.3's spec example of a decision made while an item is in transit cannot occur in play: the model delivers a queued item at the minute the next choice starts. The "still on its way" sentence is pinned with a hand-made log entry, not a played log.

## Full re-check on request (2026-11-24)

Run on the current tree at the developer's request, no code or test changes.

- Root: `pnpm typecheck` exit=0; `pnpm test` exit=0; `pnpm build` exit=0 (`assemble: ok`); `pnpm check:boundaries` exit=0 (295 files); `pnpm test:tooling` exit=0.
- Counts: kit 280 tests (56 files), night-desk 269 (45 files), dead-air 454 (63 files), tooling 57 (7 files). All passed; each package's `pnpm exec vitest run` exit=0.
- Night Desk `src/App.flow.test.tsx`: 7 of 7 passed, both in the full Night Desk run and alone (exit=0).
- 1.3 (a) developer playthrough: not run; 60-second check: not run

## Night Desk 7.1 and 7.2 verification (2026-11-24)

Both files were read against the task text and Properties 1, 2, 3 and 6 in `.kiro/specs/night-desk/design.md`. The generator in each file picks among `availableActions` over every shipped night (`nights`) plus the fixture script. Every property carries a `// Feature: night-desk, Property N` tag.

**`apps/night-desk/src/model/night.prop.test.ts` (7.1), 300 runs per property**
- Property 1: the clock after each action equals the clock before it plus the action's cost. Each entry's `at` equals the clock before it. The `at` values are strictly increasing. A log with one `at` moved earlier or later is rejected as `clock-mismatch` at that entry's index.
- Property 2: no id is delivered twice. `deliveredAt` is at least `sentAt`. Items that arrive during a busy or away action are delivered at the end of that action. Items whose wait would exceed `expiresAfter` are never delivered and are reported as missed. Every item that has arrived is in exactly one of delivered or missed.
- Property 3: every phone or door item inside an away interval is missed, not delivered, with reason `away`, its arrival minute and a label. No string field of any `MissedItem` equals or contains a scenario message body.
- Also an example check that a walk reaches the end of every night.

**`apps/night-desk/src/model/determinism.prop.test.ts` (7.2), 150 runs**
- Property 6: two folds of the same log, a fold of a JSON clone, and a fold of a log rebuilt through `applyAction` give equal `NightState`. `toLedger`, `layoutReplay` and `layoutWorldlines` (full and at minute 12) are equal across them.
- Seed example: over seeds 1 to 40 a fractional-lapse copy of the fixture gives more than one missed set, and the same seed twice gives the same set.

**Gaps:** none found, so no assertion was added and nothing was changed. No property failed, so no model change or generator constraint was needed.

**Results**
- `vitest run` on the two files: exit=0, 2 files, 8 tests passed.
- night-desk `vitest run`: exit=0, 45 files, 269 tests.
- hindsight `vitest run`: exit=0, 56 files, 280 tests.
- dead-air `vitest run`: exit=0, 63 files, 454 tests.
- `pnpm typecheck`: exit=0.
- `pnpm test`: exit=0 (boundaries ok, then the three packages, then tooling 57 tests).
- `pnpm build`: exit=0 (`assemble: ok`).
- `pnpm check:boundaries`: exit=0 (ok, 295 files).
- `pnpm test:tooling`: exit=0, 7 files, 57 tests.

Open, needs the developer: Night Desk 1.3 (a) playthrough; signal-chain C3 audio between two laptops; all real-browser and human checks listed in 'Night Desk final check'.

## Final task audit (2026-11-24)
Results from a run-only check of this tree. Nothing was re-run to write this entry.

**Night Desk task status** (from `.kiro/specs/night-desk/tasks.md`)
- 7.1 `[x]`, `apps/night-desk/src/model/night.prop.test.ts`: 5 tests (Properties 1–3, 300 fast-check runs each), passing.
- 7.2 `[x]`, `apps/night-desk/src/model/determinism.prop.test.ts`: 3 tests (Property 6, 150 runs, plus the seed example), passing.
- 7.3 `[x]`.
- 1.3 `[-]`: its automated exit criteria (b), (c) and (d) hold. Criterion (a), the developer's preview playthrough, is not run.
- Parent task 1 (Phase A) is `[ ]` in the file because 1.3 is not finished.
- Every other Night Desk task is `[x]`.

**Full suite, all exit 0**
- `pnpm test`, `pnpm typecheck`, `pnpm build` (assemble: ok), `pnpm check:boundaries` (ok, 295 files) and `pnpm test:tooling` (7 files, 57 tests).
- kit `packages/hindsight`: 56 files, 280 tests.
- `apps/night-desk`: 45 files, 269 tests.
- `apps/dead-air`: 63 files, 454 tests.
- Total: 1,060 tests. No property failures.

**Other specs**
- consoles: 46 of 46 complete.
- seance-replay: 41 of 41 complete.
- skeleton: 6.2 (retire the prototype UI) is gated on Night Desk 1.3 (a). 7.1 (close-out) follows 6.2.
- signal-chain: C3 needs two laptops with a real speaker and microphone.
- dead-air-mvp: "gather feedback" needs real users. "Submission materials" needs the developer to publish.

Remaining work is gated on the developer: Night Desk 1.3 (a) preview playthrough; signal-chain C3 audio hardware; dead-air-mvp user feedback and publishing; and every human or real-browser check marked 'not run' in 'Night Desk final check (7.3, 2026-11-23)' and earlier sections.

**Git state:** HEAD is still the scaffold commit `73b4706`, and all work is uncommitted.
