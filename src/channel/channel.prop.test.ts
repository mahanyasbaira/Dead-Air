import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { runChannel, type ChannelProfile, type ChannelSend } from "./channel";

/**
 * Property tests for the seeded simulated channel.
 *
 * On failure, fast-check prints the seed and the counterexample; paste any
 * counterexample into `channel.test.ts` once fixed (testing steering).
 *
 * - **P4 (Validates: Requirement 3.1)** — determinism: two independent runs with
 *   the same seed, profile and sends produce the identical ordered event list.
 * - **P5 (Validates: Requirement 3.3)** — delivery floor: every `received`
 *   event's time is at least its send time plus the profile's minimum delay.
 *   Dropped and collided frames emit no `received` event, so the bound holds
 *   vacuously for them.
 */

/** Profile with bounded, non-negative, internally consistent parameters. */
const arbProfile: fc.Arbitrary<ChannelProfile> = fc
  .record({
    minDelay: fc.integer({ min: 0, max: 20 }),
    span: fc.integer({ min: 0, max: 20 }),
    dropProb: fc.float({ min: 0, max: 1, noNaN: true }),
    bitFlipProb: fc.float({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ minDelay, span, dropProb, bitFlipProb }) => ({
    minDelay,
    maxDelay: minDelay + span,
    dropProb,
    bitFlipProb,
  }));

const arbSend: fc.Arbitrary<ChannelSend> = fc.record({
  sender: fc.constantFrom("p1", "p2", "p3", "p4"),
  recipient: fc.constantFrom("p1", "p2", "p3", "p4"),
  sendTime: fc.integer({ min: 0, max: 100 }),
  payload: fc.uint8Array({ minLength: 0, maxLength: 64 }),
  airtime: fc.integer({ min: 1, max: 8 }),
});

const arbRun = fc.record({
  seed: fc.nat(),
  profile: arbProfile,
  sends: fc.array(arbSend, { maxLength: 12 }),
});

describe("runChannel properties", () => {
  it("P4: identical seed, profile and sends produce an identical event list (Req 3.1)", () => {
    fc.assert(
      fc.property(arbRun, ({ seed, profile, sends }) => {
        const first = runChannel(seed, profile, sends);
        const second = runChannel(seed, profile, sends);
        expect(second).toEqual(first);
      }),
    );
  });

  it("P5: no received event arrives before sendTime + minDelay (Req 3.3)", () => {
    fc.assert(
      fc.property(arbRun, ({ seed, profile, sends }) => {
        const events = runChannel(seed, profile, sends);
        for (const event of events) {
          if (event.kind !== "received") continue;
          // Find the matching send(s) for this delivery. A received event is only
          // emitted for an un-collided, un-dropped send, so at least one send with
          // this sender/recipient must satisfy the floor.
          const floorOk = sends.some(
            (s) =>
              s.sender === event.sender &&
              s.recipient === event.recipient &&
              event.simTime >= s.sendTime + profile.minDelay,
          );
          expect(floorOk).toBe(true);
          // And globally: no received event may precede the earliest possible
          // delivery across all of this pair's sends.
          const earliestSend = Math.min(
            ...sends
              .filter((s) => s.sender === event.sender && s.recipient === event.recipient)
              .map((s) => s.sendTime),
          );
          expect(event.simTime).toBeGreaterThanOrEqual(earliestSend + profile.minDelay);
        }
      }),
    );
  });
});
