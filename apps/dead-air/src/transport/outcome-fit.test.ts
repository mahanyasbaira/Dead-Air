import { describe, expect, it } from "vitest";
import type { ChannelOutcome } from "hindsight";
import type { TransportEvent } from "./types";
// Boundary contract (compile-time): a transport's TransportEvent is structurally
// assignable to the kit's ChannelOutcome, so a transport listener hands its
// event straight to the engine adapter with no reshaping. Moved here from the
// kit's replay-channel test so no kit test imports a transport.
const transportEventFits: (e: TransportEvent) => ChannelOutcome = (e) => e;
describe("transport event fits the kit's channel outcome", () => {
  it("is assignable without reshaping (checked by tsc)", () => {
    expect(typeof transportEventFits).toBe("function");
  });
});
