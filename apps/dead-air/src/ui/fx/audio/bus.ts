import { statusText, type Sound } from "./status-twin";

/** What the bus needs from the platform. Web Audio hides behind this. */
export interface Synth {
  carrierOn(): void;
  carrierOff(): void;
  chirp(direction: "sent" | "received"): void;
  /**
   * Stop the carrier and release the audio context. Optional so a test double
   * need not implement it; the bus calls it at most once.
   */
  close?(): void;
}

export interface AudioBusOptions {
  /** Called once per `play`, immediately, whether or not anything is audible. */
  readonly onStatus: (text: string) => void;
  /** Built lazily on the first gesture, so no AudioContext exists before it. */
  readonly createSynth: () => Synth;
}

export interface AudioBus {
  play(sound: Sound): void;
  /** Call from the first user gesture (click, key). Idempotent. */
  gesture(): void;
  setMuted(muted: boolean): void;
  /**
   * Stop any carrier tone and close the audio context, once. Errors are
   * swallowed. After this, `play` still emits its text but makes no sound, and
   * `gesture` builds nothing. Call it when the page is done with sound.
   */
  close(): void;
  readonly muted: boolean;
}

/**
 * Sounds requested before the first gesture are dropped, not queued for later.
 * They describe live signal state (a chirp for a message that arrived minutes
 * ago, a carrier that may be off by now), so replaying them would mislead. The
 * text entry is emitted regardless, so nothing is lost for the reader.
 */
export function createAudioBus(options: AudioBusOptions): AudioBus {
  let synth: Synth | null = null;
  let muted = false;
  let carrierOn = false;
  let closed = false;

  const safe = (fn: () => void): void => {
    try {
      fn();
    } catch {
      // Audio is optional. A failing context must never break the run.
    }
  };

  return {
    get muted() {
      return muted;
    },
    gesture() {
      if (synth || closed) return;
      safe(() => {
        synth = options.createSynth();
      });
    },
    setMuted(next) {
      muted = next;
      if (muted && synth && carrierOn) {
        const s = synth;
        safe(() => s.carrierOff());
      } else if (!muted && synth && carrierOn) {
        const s = synth;
        safe(() => s.carrierOn());
      }
    },
    close() {
      if (closed) return;
      closed = true;
      const s = synth;
      synth = null;
      carrierOn = false;
      if (!s) return;
      safe(() => s.carrierOff());
      safe(() => s.close?.());
    },
    play(sound) {
      options.onStatus(statusText(sound));
      if (sound.kind === "carrier") carrierOn = sound.state === "on";
      const s = synth;
      if (!s || muted) return;
      safe(() => {
        if (sound.kind === "carrier") {
          if (sound.state === "on") s.carrierOn();
          else s.carrierOff();
        } else {
          s.chirp(sound.direction);
        }
      });
    },
  };
}

/** Real Web Audio synth. Not exercised in Node; checked by hand with hardware. */
export function createWebAudioSynth(): Synth {
  const ctx = new AudioContext();
  void ctx.resume();
  let carrier: OscillatorNode | null = null;

  const voice = (from: number, to: number, seconds: number, peak: number): OscillatorNode => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.linearRampToValueAtTime(to, t + seconds);
    gain.gain.setValueAtTime(peak, t);
    gain.gain.linearRampToValueAtTime(0, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds);
    return osc;
  };

  return {
    carrierOn() {
      if (carrier) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1200;
      gain.gain.value = 0.04;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      carrier = osc;
    },
    carrierOff() {
      carrier?.stop();
      carrier = null;
    },
    close() {
      try {
        carrier?.stop();
      } catch {
        /* already stopped */
      }
      carrier = null;
      // Rejects if the context is already closed; nothing to do then.
      void ctx.close().catch(() => {});
    },
    chirp(direction) {
      if (direction === "sent") voice(1200, 2200, 0.18, 0.08);
      else voice(2200, 1200, 0.18, 0.08);
    },
  };
}
