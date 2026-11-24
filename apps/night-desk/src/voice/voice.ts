// Optional voice clips. Inert unless an item has `voice`, a user gesture has happened and sound is on.
// Nothing here touches the platform until a clip is actually played: the factory is called at play
// time, so no Audio object or context exists before that. Every failure is swallowed, because the
// transcript is always on screen and the night is fully playable without sound.

/** One loaded clip. Platform audio hides behind this. */
export interface Clip {
  /** Start playing. May return a promise that rejects when the platform refuses. */
  play(): Promise<void> | void;
  /** Stop and release the clip. Called at most once. */
  stop?(): void;
}

export type ClipFactory = (file: string) => Clip;

export interface VoiceItem {
  id: string;
  voice?: { file: string };
}

export interface Voice {
  /** Call from the first `pointerdown` or `keydown`. Idempotent. */
  gesture(): void;
  setSound(on: boolean): void;
  readonly sound: boolean;
  readonly gestured: boolean;
  /**
   * Play the item's clip now. Dropped, not queued, when there is no clip, no gesture yet, sound is
   * off or the voice is closed: a clip for a message that arrived earlier would describe the past.
   */
  play(item: VoiceItem): void;
  /** Stop everything playing and refuse further work. Idempotent. */
  close(): void;
}

export function createVoice(factory: ClipFactory): Voice {
  let sound = false;
  let gestured = false;
  let closed = false;
  const active = new Set<Clip>();

  const swallow = (fn: () => void): void => {
    try {
      fn();
    } catch {
      // Voice is optional. A failing clip must never break the night.
    }
  };
  const stopAll = (): void => {
    for (const clip of active) swallow(() => clip.stop?.());
    active.clear();
  };

  return {
    get sound() {
      return sound;
    },
    get gestured() {
      return gestured;
    },
    gesture() {
      if (!closed) gestured = true;
    },
    setSound(on) {
      if (closed) return;
      sound = on;
      if (!on) stopAll();
    },
    play(item) {
      if (closed || !gestured || !sound || item.voice === undefined) return;
      const file = item.voice.file;
      swallow(() => {
        const clip = factory(file);
        active.add(clip);
        const done = (): void => {
          if (active.delete(clip)) swallow(() => clip.stop?.());
        };
        const result = clip.play();
        if (result !== undefined && typeof result.then === "function") result.then(undefined, done);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      sound = false;
      stopAll();
    },
  };
}

/** The real factory: an HTMLAudioElement for `<base>voice/<file>`, created only when called. */
export function audioClipFactory(base: string): ClipFactory {
  return (file) => {
    const audio = new Audio(`${base}voice/${file}`);
    return {
      play: () => audio.play(),
      stop: () => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      },
    };
  };
}
