/**
 * Acoustic transport: speaker to microphone over Web Audio.
 *
 * Structure (design "Scope and boundaries"):
 * - {@link AudioIO} is the only seam to hardware. {@link createWebAudioIO} is
 *   its browser implementation (AudioContext, getUserMedia, the worklet from
 *   `acoustic-worklet.ts`). Tests inject a double; no audio hardware is used.
 * - Everything else is pure: `modulate`/`demodulate`/`frame`/`parse` from the
 *   modem, and `shapeReceiveMetadata` for airtime and level (requirement 4.3).
 *
 * Half-duplex (requirement 2.3): while the local speaker is playing, capture is
 * switched off, any partial burst is dropped, and a burst that still arrives is
 * not decoded. After playback ends, capture resumes.
 *
 * Time comes from the injected `now()` (sim clock), never from the wall clock.
 * A tone with a bad checksum is reported as `garbled`; a burst with no usable
 * frame header is also `garbled`, since something was heard but not understood.
 */
import { demodulate, modulate } from "../modem/fsk";
import { frame, parse } from "../modem/frame";
import { HalfDuplexState, ListenerRegistry, StatusRegistry } from "./halfduplex";
import { shapeReceiveMetadata, type ReceiveMetadata } from "./acoustic-metadata";
import { WORKLET_NAME } from "./acoustic-capture";
import type {
  Transport,
  TransportEvent,
  TransportFrame,
  TransportListener,
  TransportMode,
  TransportStatus,
  TransportStatusListener,
  Unsubscribe,
} from "./types";

/** A transport event that also carries what the microphone measured. */
export interface AcousticEvent extends TransportEvent {
  meta: ReceiveMetadata;
}

/** Hardware seam. Implemented over Web Audio in the browser, by a double in tests. */
export interface AudioIO {
  readonly sampleRate: number;
  /** Start capture; `onBurst` is called once per captured burst. */
  start(onBurst: (samples: Float32Array) => void): Promise<void>;
  /** Turn capture on or off (off also drops any partial burst). */
  setListening(on: boolean): void;
  /** Play samples through the speaker; resolves when playback has ended. */
  play(samples: Float32Array): Promise<void>;
  /**
   * Optional. Report that the hardware went away or faulted: reason
   * `"microphone-ended"` or `"audio-closed"` (kind `ended`) or
   * `"audio-interrupted"` (kind `error`).
   */
  onStatus?(listener: (status: TransportStatus) => void): void;
  close(): void;
}

export interface AcousticTransportOptions {
  io: AudioIO;
  localId: string;
  remoteId: string;
  /** Current sim time. Called for each received event. */
  now: () => number;
  /** Sim-time units per second, for converting measured airtime. Default 1. */
  simUnitsPerSecond?: number;
}

export class AcousticTransport implements Transport {
  private readonly registry = new ListenerRegistry();
  private readonly statuses = new StatusRegistry();
  private readonly halfDuplex = new HalfDuplexState();
  private readonly options: AcousticTransportOptions;
  private closed = false;
  private transmitting = false;

  constructor(options: AcousticTransportOptions) {
    this.options = options;
    options.io.onStatus?.((status) => {
      if (!this.closed) this.statuses.emit(status);
    });
  }

  /** Link status from the hardware, plus `ended` (`"closed"`) on {@link close}. */
  onStatus(listener: TransportStatusListener): Unsubscribe {
    return this.statuses.on(listener);
  }

  /** Open the microphone and begin listening. Rejects if the device is unavailable. */
  async start(): Promise<void> {
    await this.options.io.start((samples) => this.handleBurst(samples));
  }

  get mode(): TransportMode {
    return this.transmitting ? "transmitting" : "idle";
  }

  on(listener: TransportListener): Unsubscribe {
    return this.registry.on(listener);
  }

  /** Frame, modulate and play. Resolves when the carrier is off. */
  send(frameToSend: TransportFrame): Promise<void> {
    if (this.closed) return Promise.resolve();
    const { io, simUnitsPerSecond = 1 } = this.options;
    const samples = modulate(frame(frameToSend.payload), io.sampleRate);
    const airtime = (samples.length / io.sampleRate) * simUnitsPerSecond;
    this.transmitting = true;
    this.halfDuplex.beginTransmit(frameToSend.sendTime, airtime);
    io.setListening(false);
    const done = (): void => {
      this.transmitting = false;
      this.halfDuplex.endTransmit();
      if (!this.closed) io.setListening(true);
    };
    return io.play(samples).then(done, (err: unknown) => {
      done();
      throw err;
    });
  }

  private handleBurst(samples: Float32Array): void {
    if (this.closed || this.transmitting) return; // half-duplex, requirement 2.3
    const { io, localId, remoteId, now } = this.options;
    const meta = shapeReceiveMetadata(samples, io.sampleRate);
    const parsed = parse(demodulate(samples, io.sampleRate));
    const event: AcousticEvent = parsed.ok
      ? { kind: "received", simTime: now(), sender: remoteId, recipient: localId, payload: parsed.payload, meta }
      : { kind: "garbled", simTime: now(), sender: remoteId, recipient: localId, meta };
    this.registry.emit(event);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.registry.clear();
    this.options.io.close();
    this.statuses.emit({ kind: "ended", reason: "closed" });
    this.statuses.clear();
  }
}

/**
 * Browser implementation of {@link AudioIO}. Not unit tested: it needs a real
 * AudioContext and microphone (manual task C3).
 *
 * @param workletUrl bundled URL of `acoustic-worklet.ts`, supplied by the app.
 */
export async function createWebAudioIO(workletUrl: string): Promise<AudioIO> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(workletUrl);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, WORKLET_NAME);
  // Keep the node pulled by the graph without sending mic audio to the speaker.
  const statusListeners: ((status: TransportStatus) => void)[] = [];
  let closing = false;
  const report = (status: TransportStatus): void => {
    if (!closing) statusListeners.forEach((l) => l(status));
  };
  // A device unplugged or revoked ends the track; the page gets no other signal.
  stream.getAudioTracks().forEach((t) =>
    t.addEventListener("ended", () => report({ kind: "ended", reason: "microphone-ended" })),
  );
  // "interrupted" is Safari's state for a call or another app taking the audio.
  ctx.addEventListener("statechange", () => {
    const state = ctx.state as string;
    if (state === "closed") report({ kind: "ended", reason: "audio-closed" });
    else if (state === "interrupted") report({ kind: "error", reason: "audio-interrupted" });
  });
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  return {
    sampleRate: ctx.sampleRate,
    async start(onBurst) {
      node.port.onmessage = (e: MessageEvent) => {
        const data = e.data as { type?: string; samples?: Float32Array };
        if (data.type === "burst" && data.samples) onBurst(data.samples);
      };
      await ctx.resume();
    },
    setListening(on) {
      node.port.postMessage({ type: "listen", on });
    },
    play(samples) {
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(Float32Array.from(samples), 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      return new Promise<void>((resolve) => {
        src.onended = () => resolve();
        src.start();
      });
    },
    onStatus(listener) {
      statusListeners.push(listener);
    },
    close() {
      closing = true;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => {});
    },
  };
}
