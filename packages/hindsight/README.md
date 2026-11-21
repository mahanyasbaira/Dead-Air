# Hindsight

A small kit for drills where information arrives late, damaged, or never. It
records what happened as an append-only log, replays it deterministically, and
answers one question afterwards: what did each participant know at time `t`?

It holds no scenario content, no audio and no app-specific words. Everything
random comes from a seeded PRNG and everything timed from a simulated clock, so
the same scenario, choices and seed give the same log and the same ledger.

## Two entries

| Import | What it is |
| --- | --- |
| `hindsight` | The core. Headless: no DOM, no audio, no React. |
| `hindsight/replay` | The replay view: a pure layout function and an SVG React component. React is an optional peer dependency, needed only here. |

Apps import the kit by these two names only. The kit imports nothing from apps.

## Public API

All names below are exported from `hindsight`, except the two marked Replay,
which come from `hindsight/replay`.

| Area | Export | Signature or purpose |
| --- | --- | --- |
| Engine | `reduce`, `initialState`, `replay` | Pure reducer over `Action`, its start `SimState`, and a fold of a `PlayLog` into a final state |
| Engine | `nextSimTime`, `timelineSteps`, `messageTimings`, `buildDebrief` | Read the timeline and per-message timings of a run |
| Engine | `visibleToRole`, `eventsForRole`, `allEvents`, `orderEvents` | Which events a role is allowed to see, and a stable order |
| Engine | `emptyChannelLog`, `toChannelLogEntry`, `appendChannelEvent`, `replayChannelLog` | Append-only channel log; `replayChannelLog(events)` returns a `ChannelLog` |
| Engine | types `Scenario`, `Role`, `SimEvent`, `DecisionOption`, `RecordedDecision`, `PlayLog`, `SimState`, `ParticipantId`, `RoleId`, `Audience`, `EventType` | The shapes a scenario and a run are made of |
| Channel | `createPrng(seed)`, `Prng` | Seeded PRNG |
| Channel | `createClock(start = 0)` | `SimClock` with `now()`, `advance(by)`, `advanceTo(t)`; it moves only when told |
| Channel | `runChannel(seed, loss, sends)` | Returns ordered `ChannelEvent[]`; `loss` is a `ChannelProfile` or a `LossSource` |
| Channel | `profileLoss(profile)`, `DEFAULT_AIRTIME` | The `LossSource` for a `ChannelProfile`; airtime used when a send has none |
| Channel | types `ChannelProfile`, `ChannelSend`, `ChannelEvent`, `LossSource`, `Impairment` | Delay, drop, damage and collision parameters and results |
| Ledger | `buildLedger(events)` | Sorts `LedgerEvent[]` into a canonical `Ledger` |
| Ledger | `knownAt(ledger, p, t)` | Set of facts and intact messages `p` held at `t`, inclusive |
| Ledger | `inTransitAt(ledger, p, t)` | Messages sent to `p` by `t` with no outcome yet; a dropped message stays here |
| Ledger | `orphanOutcomes(ledger)` | Count of outcomes whose message was never sent |
| Ledger | `ledgerFromChannel(sends, log)` | Turns sends and a `ChannelLog` into `LedgerEvent[]` |
| Replay | `layoutReplay(ledger, scenario)`  | Pure layout: one row per participant, ticks in sim-time order |
| Replay | `ReplayView`  | SVG view of a `ReplayLayout`; each row is keyboard-reachable |

## Loss sources

The channel owns collision geometry and event ordering. A `LossSource` owns
everything else an application means by "lost": drop, delay and damage. It has
one method, `assess(send, prng): Impairment`, called once per send that did not
collide, in a stable order. All randomness must come from the `prng` argument.
The full contract (draw order, the `RangeError` on a bad delay, what collided
sends skip) is the doc block above `Impairment` in `src/channel/channel.ts`.

## Minimal drill

Three participants, one lossy send, one ledger query. The file is
`examples/minimal-drill.ts`, and a test runs it. With seed 7 the message is
dropped: `p2` never knows it and still counts it as in transit at time 10.

```ts
import {
  buildLedger, inTransitAt, knownAt, ledgerFromChannel, replayChannelLog, runChannel,
} from "../src/index";

// Three participants. p1 tells p2 something over a lossy line; p3 only overhears a fact.
export function minimalDrill(seed = 7) {
  const profile = { minDelay: 2, maxDelay: 6, dropProb: 0.2, bitFlipProb: 0.01 };
  const sends = [
    { id: "m1", sender: "p1", recipient: "p2", sendTime: 0, payload: Uint8Array.of(1, 2) },
  ];
  const log = replayChannelLog(runChannel(seed, profile, sends));
  const ledger = buildLedger([
    ...ledgerFromChannel(sends, log),
    { kind: "learned", participant: "p3", factId: "rumour", simTime: 1 },
  ]);
  // The one query: what did p2 hold, and what was still in transit to p2, at each time?
  const view = (t: number) => ({
    t,
    p2Knew: [...knownAt(ledger, "p2", t)],
    p2Waiting: [...inTransitAt(ledger, "p2", t)],
    p3Knew: [...knownAt(ledger, "p3", t)],
  });
  return [0, 3, 10].map(view);
}
```

<!-- scenario-section:start -->
## Adding a third app

Content comes from a brief, a short Markdown outline of a scenario.

1. Write the brief. The format is in `docs/scenario-brief.md`; a real one is `apps/night-desk/scenarios/briefs/example-noise-complaint.md`.
2. Save it as `apps/<your app>/scenarios/briefs/<name>.md`.
3. The `scenario-from-brief` hook fires on that save and asks the agent to write the scenario file beside the brief. It is an agent action, so each save of a brief uses agent credits.
4. Without the hook, write `apps/<your app>/scenarios/<name>.ts` yourself and run `pnpm --filter <your app> test`.
5. Either way, the shared test is `apps/<your app>/scenarios/scenarios.test.ts`. It runs `validateScenario` and `checkScenario` on every scenario file in the folder.

Checklist for the app itself:

- [ ] Its own folder under `apps/`, with its own `package.json`.
- [ ] `"hindsight": "workspace:*"` in its dependencies.
- [ ] A `LossSource` for what "lost" means to it (contract: the doc block in `packages/hindsight/src/channel/channel.ts`).
- [ ] A `scenarios/` folder with `scenarios.test.ts`, as in the existing apps.
- [ ] `pnpm check:boundaries` passes.

<!-- scenario-section:end -->

## Rules the kit keeps

- No `Math.random` and no `Date.now`: use the seeded PRNG and the simulated clock.
- Inside the kit, imports flow `replay -> ledger -> engine` and `channel -> engine`.
- `pnpm check:boundaries` enforces these rules for every file under this package.
