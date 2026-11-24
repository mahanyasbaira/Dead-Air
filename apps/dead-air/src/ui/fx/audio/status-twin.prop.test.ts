// Feature: consoles, Property 6: Every sound has a text twin
// **Validates: Requirements 5.4**
import fc from "fast-check";
import { describe, it } from "vitest";
import { createAudioBus } from "./bus";
import type { Sound } from "./status-twin";

const soundArb: fc.Arbitrary<Sound> = fc.oneof(
  fc.constantFrom<"on" | "off">("on", "off").map((state): Sound => ({ kind: "carrier", state })),
  fc
    .constantFrom<"sent" | "received">("sent", "received")
    .map((direction): Sound => ({ kind: "chirp", direction })),
);

describe("audio bus text twin", () => {
  it("emits exactly one non-empty text entry per sound, in any gesture or mute state", () => {
    fc.assert(
      fc.property(fc.array(soundArb), fc.boolean(), fc.boolean(), (sounds, gesture, muted) => {
        const texts: string[] = [];
        const bus = createAudioBus({
          onStatus: (t) => texts.push(t),
          createSynth: () => ({ carrierOn() {}, carrierOff() {}, chirp() {} }),
        });
        if (gesture) bus.gesture();
        bus.setMuted(muted);
        for (const s of sounds) bus.play(s);
        return texts.length === sounds.length && texts.every((t) => t.length > 0 && !t.includes("!"));
      }),
      { numRuns: 100 },
    );
  });
});
