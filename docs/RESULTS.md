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
