/**
 * Scripted transport: a solo partner on the Wire.
 *
 * For solo play (and for a judge running the drill on one laptop), the far end
 * is not a second person but a fixed schedule of sends. This transport replays
 * that schedule and the local device's own sends through the same seeded
 * simulated channel (`src/channel/channel.ts`, A4), so solo play sees exactly
 * the same impairments — delay, drop, garble, collision — as a two-tab loopback
 * session with the same seed.
 *
 * ## Pure, deterministic core
 *
 * The transport is a thin, synchronous wrapper around a pure core
 * ({@link runScripted}): all randomness comes from the seeded channel, there is
 * no `Date.now`, no `Math.random`, no timer. Calling `send` accumulates the
 * local frame; `resolve()` runs the whole batch (partner schedule + local sends)
 * through the channel once and emits the resulting events. This keeps solo play
 * replayable and the Séance deterministic (design "Determinism contract").
 *
 * ## Half-duplex (requirement 2.3)
 *
 * The local device suppresses inbound decoding while its own carrier is on. The
 * core marks each local send's airtime window and drops any inbound outcome that
 * lands inside it (except a `collision`, which is the defined outcome of the
 * overlap and must reach both parties). See {@link HalfDuplexState}.
 *
 * ## Airtime (A4/B1 boundary)
 *
 * A send's airtime is the carrier length used for collision detection. The real
 * FSK sample length arrives in B1; until then this transport uses a nominal
 * {@link NOMINAL_AIRTIME} (documented in `docs/RESULTS.md`), overridable per
 * frame. The nominal value is deliberately > 1 so a solo send and a
 * near-simultaneous partner send can realistically collide.
 */

import {
  runChannel,
  type ChannelProfile,
  type ChannelSend,
  type ChannelEvent,
} from "hindsight";
import { HalfDuplexState, ListenerRegistry, StatusRegistry } from "./halfduplex";
import type {
  Transport,
  TransportEvent,
  TransportFrame,
  TransportListener,
  TransportMode,
  TransportStatusListener,
  Unsubscribe,
} from "./types";

/**
 * Nominal carrier airtime (sim-time units) used when a frame does not specify
 * one. Chosen > 1 so overlapping sends can collide before the real FSK sample
 * length lands in B1. Recorded in `docs/RESULTS.md`.
 */
export const NOMINAL_AIRTIME = 4;

/** One entry in the solo partner's fixed send schedule. */
export interface ScriptedSend {
  /** Optional message id, carried onto this send's outcome by the channel. */
  id?: string;
  /** The partner device/role id (the far end of the link). */
  sender: string;
  /** The local device/role id (the near end). */
  recipient: string;
  /** Sim-time the partner transmits. */
  sendTime: number;
  payload: Uint8Array;
  airtime?: number;
}

/** Inputs for the pure scripted core. */
export interface ScriptedCoreInput {
  seed: number;
  profile: ChannelProfile;
  /** The solo partner's fixed schedule. */
  schedule: readonly ScriptedSend[];
  /** The local device's sends, in the order they were queued. */
  localSends: readonly ChannelSend[];
  /** Local device id, used to decide which outcomes the local half-duplex gates. */
  localId: string;
}

/**
 * Pure core: run the partner schedule and the local sends through the seeded
 * channel, then apply the local device's half-duplex gate. Returns the ordered
 * events the local device actually observes.
 *
 * Deterministic in its inputs: identical `(seed, profile, schedule, localSends)`
 * yields an identical event list (inherited from the channel's P4).
 */
export function runScripted(input: ScriptedCoreInput): ChannelEvent[] {
  const { seed, profile, schedule, localSends, localId } = input;

  const toChannelSend = (s: ScriptedSend | ChannelSend): ChannelSend => ({
    ...(s.id !== undefined ? { id: s.id } : {}),
    sender: s.sender,
    recipient: s.recipient,
    sendTime: s.sendTime,
    payload: s.payload,
    airtime: s.airtime ?? NOMINAL_AIRTIME,
  });

  const sends: ChannelSend[] = [
    ...schedule.map(toChannelSend),
    ...localSends.map(toChannelSend),
  ];

  const events = runChannel(seed, profile, sends);

  // Half-duplex gate: while the local device transmits, it does not decode. A
  // local send's airtime window suppresses any inbound outcome addressed to the
  // local device that lands inside it (collisions excepted — they are the
  // defined overlap outcome and reach both parties).
  const gate = new HalfDuplexState();
  return events.filter((event) => {
    if (event.kind === "collision") return true;
    // Only inbound outcomes (addressed to the local device) are gated.
    if (event.recipient !== localId) return true;
    const suppressed = localSends.some((s) => {
      const airtime = s.airtime ?? NOMINAL_AIRTIME;
      gate.beginTransmit(s.sendTime, airtime);
      return gate.isTransmittingAt(event.simTime);
    });
    return !suppressed;
  });
}

/** Options for constructing a {@link ScriptedTransport}. */
export interface ScriptedTransportOptions {
  seed: number;
  profile: ChannelProfile;
  /** The solo partner's fixed send schedule. */
  schedule: readonly ScriptedSend[];
  /** The local device/role id (the near end of the link). */
  localId: string;
}

/**
 * The solo-partner {@link Transport}. Queue local sends with {@link send}, then
 * call {@link resolve} to run the batch through the channel and emit outcomes.
 * Synchronous and deterministic; nothing is scheduled on a timer here so the
 * core stays replayable.
 */
export class ScriptedTransport implements Transport {
  private readonly registry = new ListenerRegistry();
  private readonly statuses = new StatusRegistry();
  private readonly halfDuplex = new HalfDuplexState();
  private readonly localSends: ChannelSend[] = [];
  private readonly options: ScriptedTransportOptions;
  private closed = false;

  constructor(options: ScriptedTransportOptions) {
    this.options = options;
  }

  get mode(): TransportMode {
    return this.halfDuplex.mode;
  }

  on(listener: TransportListener): Unsubscribe {
    return this.registry.on(listener);
  }

  /**
   * Link status. The scripted partner never fails and its schedule running out
   * is not an end (the player can still send), so the one status it reports is
   * `ended` with reason `"closed"` when {@link close} is called.
   */
  onStatus(listener: TransportStatusListener): Unsubscribe {
    return this.statuses.on(listener);
  }

  /**
   * Queue a local frame for transmission. Marks the device `transmitting` for
   * the frame's airtime window (requirement 2.3). Events are not emitted until
   * {@link resolve} is called.
   */
  send(frame: TransportFrame): void {
    if (this.closed) return;
    const airtime = frame.airtime ?? NOMINAL_AIRTIME;
    this.halfDuplex.beginTransmit(frame.sendTime, airtime);
    this.localSends.push({
      ...(frame.id !== undefined ? { id: frame.id } : {}),
      sender: frame.sender,
      recipient: frame.recipient,
      sendTime: frame.sendTime,
      payload: frame.payload,
      airtime,
    });
  }

  /**
   * Run the full batch (partner schedule + queued local sends) through the
   * seeded channel and emit each resulting event the local device observes.
   * Returns the emitted events so a caller can also fold them into the engine
   * log directly. The local device returns to `idle` once resolved.
   */
  resolve(): TransportEvent[] {
    if (this.closed) return [];
    const events = runScripted({
      seed: this.options.seed,
      profile: this.options.profile,
      schedule: this.options.schedule,
      localSends: this.localSends,
      localId: this.options.localId,
    });
    this.halfDuplex.endTransmit();
    for (const event of events) {
      this.registry.emit(event);
    }
    return events;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.registry.clear();
    this.statuses.emit({ kind: "ended", reason: "closed" });
    this.statuses.clear();
  }
}

/** Convenience factory mirroring `new ScriptedTransport(options)`. */
export function createScriptedTransport(
  options: ScriptedTransportOptions,
): ScriptedTransport {
  return new ScriptedTransport(options);
}
