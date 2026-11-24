import { describe, expect, it } from "vitest";
import { createAudioBus, type Synth } from "./bus";

function setup(opts: { throwOn?: "create" | "play" } = {}) {
  const calls: string[] = [];
  const texts: string[] = [];
  const synth: Synth = {
    carrierOn() {
      if (opts.throwOn === "play") throw new Error("boom");
      calls.push("carrierOn");
    },
    carrierOff() {
      calls.push("carrierOff");
    },
    chirp(d) {
      if (opts.throwOn === "play") throw new Error("boom");
      calls.push(`chirp:${d}`);
    },
  };
  const bus = createAudioBus({
    onStatus: (t) => texts.push(t),
    createSynth: () => {
      if (opts.throwOn === "create") throw new Error("no audio");
      return synth;
    },
  });
  return { bus, calls, texts };
}

describe("audio bus", () => {
  it("plays nothing before a gesture and drops those sounds afterwards", () => {
    const { bus, calls, texts } = setup();
    bus.play({ kind: "chirp", direction: "received" });
    bus.gesture();
    expect(calls).toEqual([]);
    expect(texts).toEqual(["Chirp: message received."]);
  });

  it("plays a sound once after the gesture", () => {
    const { bus, calls } = setup();
    bus.gesture();
    bus.gesture();
    bus.play({ kind: "chirp", direction: "sent" });
    expect(calls).toEqual(["chirp:sent"]);
  });

  it("stays silent when muted but still emits the text", () => {
    const { bus, calls, texts } = setup();
    bus.gesture();
    bus.setMuted(true);
    bus.play({ kind: "chirp", direction: "sent" });
    expect(calls).toEqual([]);
    expect(texts).toEqual(["Chirp: message sent."]);
  });

  it("stops the carrier on mute and resumes it on unmute", () => {
    const { bus, calls } = setup();
    bus.gesture();
    bus.play({ kind: "carrier", state: "on" });
    bus.setMuted(true);
    bus.setMuted(false);
    expect(calls).toEqual(["carrierOn", "carrierOff", "carrierOn"]);
  });

  it("emits exactly one text entry per play", () => {
    const { bus, texts } = setup();
    bus.play({ kind: "carrier", state: "on" });
    bus.gesture();
    bus.play({ kind: "carrier", state: "off" });
    bus.setMuted(true);
    bus.play({ kind: "chirp", direction: "received" });
    expect(texts).toHaveLength(3);
  });

  it("swallows errors from the audio context", () => {
    const create = setup({ throwOn: "create" });
    expect(() => {
      create.bus.gesture();
      create.bus.play({ kind: "chirp", direction: "sent" });
    }).not.toThrow();
    expect(create.texts).toHaveLength(1);

    const play = setup({ throwOn: "play" });
    play.bus.gesture();
    expect(() => play.bus.play({ kind: "chirp", direction: "sent" })).not.toThrow();
    expect(play.texts).toHaveLength(1);
  });
});

describe("audio bus close", () => {
  function closable(failClose = false) {
    const state = { closes: 0, calls: [] as string[], texts: [] as string[], creates: 0 };
    const synth: Synth = {
      carrierOn() { state.calls.push("carrierOn"); },
      carrierOff() { state.calls.push("carrierOff"); },
      chirp(d) { state.calls.push(`chirp:${d}`); },
      close() {
        state.closes++;
        if (failClose) throw new Error("already closed");
      },
    };
    const bus = createAudioBus({
      onStatus: (t) => state.texts.push(t),
      createSynth: () => {
        state.creates++;
        return synth;
      },
    });
    return { bus, state };
  }

  it("stops the carrier and closes the context once; a second close does nothing", () => {
    const { bus, state } = closable();
    bus.gesture();
    bus.play({ kind: "carrier", state: "on" });
    bus.close();
    bus.close();
    expect(state.calls).toEqual(["carrierOn", "carrierOff"]);
    expect(state.closes).toBe(1);
  });

  it("plays no sound after close but still emits the text", () => {
    const { bus, state } = closable();
    bus.gesture();
    bus.close();
    state.calls.length = 0;
    bus.play({ kind: "chirp", direction: "sent" });
    expect(state.calls).toEqual([]);
    expect(state.texts).toEqual(["Chirp: message sent."]);
  });

  it("builds no context on a gesture after close", () => {
    const { bus, state } = closable();
    bus.close();
    bus.gesture();
    expect(state.creates).toBe(0);
    expect(state.closes).toBe(0);
  });

  it("swallows an error thrown while closing", () => {
    const { bus, state } = closable(true);
    bus.gesture();
    expect(() => bus.close()).not.toThrow();
    expect(() => bus.close()).not.toThrow();
    expect(state.closes).toBe(1);
  });
});
