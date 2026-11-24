import { describe, expect, it, vi } from "vitest";
import { createVoice } from "./voice";
import type { Clip } from "./voice";

function fake() {
  const clips: { file: string; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const factory = vi.fn((file: string): Clip => {
    const clip = { file, play: vi.fn(), stop: vi.fn() };
    clips.push(clip);
    return clip;
  });
  return { clips, factory };
}
const item = { id: "a", voice: { file: "a.mp3" } };

describe("voice", () => {
  it("builds nothing until a clip plays", () => {
    const { factory } = fake();
    const v = createVoice(factory);
    v.setSound(true);
    v.gesture();
    expect(factory).not.toHaveBeenCalled();
  });

  it("drops a clip before the first gesture, and it is not replayed afterwards", () => {
    const { factory } = fake();
    const v = createVoice(factory);
    v.setSound(true);
    v.play(item);
    v.gesture();
    expect(factory).not.toHaveBeenCalled();
  });

  it("drops a clip while sound is off", () => {
    const { factory } = fake();
    const v = createVoice(factory);
    v.gesture();
    v.play(item);
    expect(factory).not.toHaveBeenCalled();
  });

  it("ignores an item with no clip", () => {
    const { factory } = fake();
    const v = createVoice(factory);
    v.setSound(true);
    v.gesture();
    v.play({ id: "b" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("plays once with sound on after a gesture, and turning sound off stops it", () => {
    const { clips, factory } = fake();
    const v = createVoice(factory);
    v.setSound(true);
    v.gesture();
    v.play(item);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.file).toBe("a.mp3");
    expect(clips[0]!.play).toHaveBeenCalledTimes(1);
    v.setSound(false);
    expect(clips[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("swallows a throwing factory, a throwing play and a rejected play", async () => {
    const v = createVoice(() => {
      throw new Error("no file");
    });
    v.setSound(true);
    v.gesture();
    expect(() => v.play(item)).not.toThrow();

    const bad = createVoice(() => ({
      play: () => {
        throw new Error("blocked");
      },
    }));
    bad.setSound(true);
    bad.gesture();
    expect(() => bad.play(item)).not.toThrow();

    const stop = vi.fn();
    const rejecting = createVoice(() => ({ play: () => Promise.reject(new Error("autoplay")), stop }));
    rejecting.setSound(true);
    rejecting.gesture();
    expect(() => rejecting.play(item)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("close stops what is playing once and refuses further work", () => {
    const { clips, factory } = fake();
    const v = createVoice(factory);
    v.setSound(true);
    v.gesture();
    v.play(item);
    v.close();
    v.close();
    expect(clips[0]!.stop).toHaveBeenCalledTimes(1);
    v.setSound(true);
    v.play(item);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(v.sound).toBe(false);
  });
});
