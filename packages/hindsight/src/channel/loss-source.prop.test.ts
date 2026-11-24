import { describe, it } from "vitest";
import fc from "fast-check";
import { runChannel, profileLoss, type ChannelProfile, type ChannelSend, type LossSource } from "./channel";

/**
 * Feature: skeleton, Property 6: profile and loss source are one interface.
 * **Validates: Requirements 3.4**
 */
const arbProfile: fc.Arbitrary<ChannelProfile> = fc
  .record({
    minDelay: fc.integer({ min: 0, max: 20 }),
    span: fc.integer({ min: 0, max: 20 }),
    dropProb: fc.float({ min: 0, max: 1, noNaN: true }),
    bitFlipProb: fc.float({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ span, ...r }) => ({ ...r, maxDelay: r.minDelay + span }));

// Sends spaced 5 apart with airtime 1 so none collide; index is the id.
const arbSends: fc.Arbitrary<ChannelSend[]> = fc
  .array(fc.uint8Array({ minLength: 0, maxLength: 8 }), { maxLength: 12 })
  .map((payloads) =>
    payloads.map((payload, i) => ({
      id: `m${i}`,
      sender: "a",
      recipient: "b",
      sendTime: i * 5,
      airtime: 1,
      payload,
    })),
  );

const arbSeed = fc.integer({ min: 0, max: 0xffffffff });
const clean = (s: ChannelSend, delay: number, dropped = false) => ({
  dropped,
  delay,
  payload: s.payload.slice(),
  corrupted: false,
});

describe("loss source (Property 6)", () => {
  it("Feature: skeleton, Property 6: a profile equals its profileLoss", () => {
    fc.assert(
      fc.property(arbSeed, arbProfile, arbSends, (seed, profile, sends) => {
        return (
          JSON.stringify(runChannel(seed, profile, sends)) ===
          JSON.stringify(runChannel(seed, profileLoss(profile), sends))
        );
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: skeleton, Property 6: a dropped send produces no received event", () => {
    fc.assert(
      fc.property(arbSeed, arbSends, fc.array(fc.boolean(), { maxLength: 12 }), (seed, sends, flags) => {
        const drop = new Set(sends.filter((_, i) => flags[i]).map((s) => s.id));
        const source: LossSource = { assess: (s) => clean(s, 0, drop.has(s.id)) };
        const events = runChannel(seed, source, sends);
        return events.every((e) => !(e.kind === "received" && drop.has(e.id)));
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: skeleton, Property 6: a fixed extra delay is a floor on arrival", () => {
    fc.assert(
      fc.property(arbSeed, arbSends, fc.integer({ min: 0, max: 50 }), (seed, sends, extra) => {
        const source: LossSource = { assess: (s) => clean(s, extra) };
        const sentAt = new Map(sends.map((s) => [s.id, s.sendTime]));
        return runChannel(seed, source, sends)
          .filter((e) => e.kind === "received")
          .every((e) => e.simTime >= sentAt.get(e.id)! + extra);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: skeleton, Property 6: two runs of a source give equal output", () => {
    fc.assert(
      fc.property(arbSeed, arbSends, (seed, sends) => {
        const make = (): LossSource => ({
          assess: (s, prng) => clean(s, Math.floor(prng.nextFloat() * 10), prng.nextBool(0.3)),
        });
        return (
          JSON.stringify(runChannel(seed, make(), sends)) ===
          JSON.stringify(runChannel(seed, make(), sends))
        );
      }),
      { numRuns: 100 },
    );
  });
});
