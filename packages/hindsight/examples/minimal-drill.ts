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
