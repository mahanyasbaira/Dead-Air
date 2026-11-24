/**
 * Loopback transport: two tabs over `BroadcastChannel`.
 *
 * Two people on the same machine (or a judge checking the two-tab path) open
 * Dead Air in two browser tabs. There is no network: each tab posts its sends on
 * a same-origin `BroadcastChannel` and the receiving tab runs that send through
 * the same seeded simulated channel (`src/channel/channel.ts`, A4) to decide the
 * outcome. Because both tabs share the same `(seed, profile)`, the impairments a
 * tab applies to an incoming send are reproducible — the loopback link behaves
 * identically to a solo scripted run with the same seed (design "Determinism
 * contract").
 *
 * ## Structure
 *
 * - A thin `BroadcastChannel` shell handles cross-tab delivery. It is injected
 *   via {@link BroadcastChannelLike} so Node/Vitest (where `BroadcastChannel` is
 *   not available by default) can supply a minimal in-memory double.
 * - A pure core ({@link resolveInbound}) decides the outcome of one inbound send
 *   through the seeded channel, so the impairment logic is testable without any
 *   cross-tab machinery.
 *
 * ## Determinism without shared mutable PRNG state
 *
 * Each send carries a monotonic `seq` from its sender. The receiver derives a
 * per-send seed from `(runSeed, senderId, seq)` and runs that single send
 * through `runChannel`, so the outcome depends only on data both tabs agree on,
 * never on cross-tab arrival order. Collisions are detected locally: a send
 * whose airtime overlaps one the receiver itself has on the air is reported as a
 * `collision` to the receiver (requirement 3.2) and, symmetrically, the sender's
 * own half-duplex state means it was not decoding while it transmitted.
 *
 * ## Half-duplex (requirement 2.3)
 *
 * While a tab transmits, it does not decode inbound audio: an inbound outcome
 * landing inside the local send's airtime window is suppressed (a `collision` is
 * always surfaced — it is the overlap's defined outcome). See
 * {@link HalfDuplexState}.
 *
 * ## Airtime (A4/B1 boundary)
 *
 * Carrier airtime (for collision detection) uses the nominal value from the
 * scripted transport until the real FSK sample length lands in B1; documented in
 * `docs/RESULTS.md`.
 */

import {
  runChannel,
  type ChannelEvent,
  type ChannelProfile,
  type ChannelSend,
} from "hindsight";
import { NOMINAL_AIRTIME } from "./scripted";
import { HalfDuplexState, ListenerRegistry, StatusRegistry } from "./halfduplex";
import type {
  Transport,
  TransportFrame,
  TransportListener,
  TransportMode,
  TransportStatusListener,
  Unsubscribe,
} from "./types";

/**
 * The slice of the DOM `BroadcastChannel` API this transport uses. Declared so a
 * test can inject a minimal in-memory double: `BroadcastChannel` is not present
 * in Node/Vitest by default.
 */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  /** Assigned by the transport to receive posted messages. */
  onmessage: ((event: { data: unknown }) => void) | null;
  /** Fired when a message arrives that cannot be deserialized. Optional on doubles. */
  onmessageerror?: ((event: unknown) => void) | null;
  close(): void;
}

/** The wire format posted between tabs for one transmission. */
export interface LoopbackMessage {
  /** Optional message id; copied onto the outcome so the log can match it to the send. */
  id?: string;
  sender: string;
  recipient: string;
  sendTime: number;
  airtime: number;
  /** Monotonic per-sender sequence number; part of the per-send seed. */
  seq: number;
  /** Payload bytes as a plain number array (structured-clone friendly). */
  payload: number[];
}

/** A send currently on the local tab's air, kept for local collision checks. */
interface ActiveSend {
  sendTime: number;
  airtime: number;
}

/**
 * Derive a stable per-send seed from the run seed, the sender id and the send's
 * sequence number. A string hash (FNV-1a) folds the sender id in so two senders
 * with the same seq do not share impairment draws. Pure arithmetic, no
 * randomness of its own.
 */
export function deriveSendSeed(runSeed: number, senderId: string, seq: number): number {
  let h = 0x811c9dc5 ^ (runSeed >>> 0);
  for (let i = 0; i < senderId.length; i++) {
    h ^= senderId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= seq >>> 0;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

/** Inputs for resolving one inbound send against the local tab's state. */
export interface ResolveInboundInput {
  runSeed: number;
  profile: ChannelProfile;
  message: LoopbackMessage;
  /** Sends the local tab currently has on the air (for collision detection). */
  localActive: readonly ActiveSend[];
}

/**
 * Pure core: decide the single outcome the local tab observes for one inbound
 * send. If the inbound airtime overlaps any send the local tab has on the air,
 * it is a `collision`; otherwise the send is run through the seeded channel with
 * a per-send seed and the one resulting event is returned (or `null` if the
 * channel dropped it).
 */
export function resolveInbound(input: ResolveInboundInput): ChannelEvent | null {
  const { runSeed, profile, message, localActive } = input;

  const inboundStart = message.sendTime;
  const inboundEnd = message.sendTime + Math.max(1, message.airtime);
  const collides = localActive.some((a) => {
    const aStart = a.sendTime;
    const aEnd = a.sendTime + Math.max(1, a.airtime);
    return inboundStart < aEnd && aStart < inboundEnd;
  });

  const withId = message.id !== undefined ? { id: message.id } : {};
  if (collides) {
    return {
      ...withId,
      kind: "collision",
      simTime: message.sendTime,
      sender: message.sender,
      recipient: message.recipient,
    };
  }

  const send: ChannelSend = {
    ...withId,
    sender: message.sender,
    recipient: message.recipient,
    sendTime: message.sendTime,
    payload: Uint8Array.from(message.payload),
    airtime: message.airtime,
  };
  const seed = deriveSendSeed(runSeed, message.sender, message.seq);
  const events = runChannel(seed, profile, [send]);
  // A single send yields at most one event (received/garbled) or none (dropped).
  return events.length > 0 ? events[0] : null;
}

/** Options for constructing a {@link LoopbackTransport}. */
export interface LoopbackTransportOptions {
  seed: number;
  profile: ChannelProfile;
  /** The local tab's device/role id. */
  localId: string;
  /** The `BroadcastChannel` (or a test double) carrying cross-tab sends. */
  channel: BroadcastChannelLike;
}

/**
 * The two-tab {@link Transport}. Posts local sends over the injected
 * `BroadcastChannel`; resolves inbound sends from the other tab through the
 * seeded channel and emits the outcome, honouring the half-duplex rule.
 */
export class LoopbackTransport implements Transport {
  private readonly registry = new ListenerRegistry();
  private readonly statuses = new StatusRegistry();
  private readonly halfDuplex = new HalfDuplexState();
  private readonly options: LoopbackTransportOptions;
  /** Local sends still occupying the air, for collision detection. */
  private readonly active: ActiveSend[] = [];
  private seq = 0;
  private closed = false;

  constructor(options: LoopbackTransportOptions) {
    this.options = options;
    this.options.channel.onmessage = (event) => this.handleMessage(event.data);
    this.options.channel.onmessageerror = () => {
      if (!this.closed) this.statuses.emit({ kind: "error", reason: "message-error" });
    };
  }

  get mode(): TransportMode {
    return this.halfDuplex.mode;
  }

  on(listener: TransportListener): Unsubscribe {
    return this.registry.on(listener);
  }

  /**
   * Link status: `error` (reason `"message-error"`) when the other tab's message
   * could not be read, and `ended` (reason `"closed"`) when this transport is
   * closed.
   */
  onStatus(listener: TransportStatusListener): Unsubscribe {
    return this.statuses.on(listener);
  }

  /**
   * Post a local frame to the other tab. Marks the device `transmitting` for the
   * frame's airtime window (requirement 2.3) and records the send so a
   * concurrent inbound send can be detected as a collision locally.
   */
  send(frame: TransportFrame): void {
    if (this.closed) return;
    const airtime = frame.airtime ?? NOMINAL_AIRTIME;
    this.halfDuplex.beginTransmit(frame.sendTime, airtime);
    this.active.push({ sendTime: frame.sendTime, airtime });

    const message: LoopbackMessage = {
      ...(frame.id !== undefined ? { id: frame.id } : {}),
      sender: frame.sender,
      recipient: frame.recipient,
      sendTime: frame.sendTime,
      airtime,
      seq: this.seq++,
      payload: Array.from(frame.payload),
    };
    this.options.channel.postMessage(message);
  }

  /**
   * Clear the local `transmitting` state once a send's carrier is off. A console
   * calls this when its transmit animation completes; the airtime window is also
   * self-expiring via the half-duplex time check.
   */
  endTransmit(): void {
    this.halfDuplex.endTransmit();
    this.active.length = 0;
  }

  private handleMessage(data: unknown): void {
    if (this.closed) return;
    const message = data as LoopbackMessage;
    // Ignore our own echo and anything not addressed to this tab.
    if (message.sender === this.options.localId) return;
    if (message.recipient !== this.options.localId) return;

    const event = resolveInbound({
      runSeed: this.options.seed,
      profile: this.options.profile,
      message,
      localActive: this.active,
    });
    if (event === null) return; // dropped by the channel

    // Half-duplex: suppress a decoded outcome landing while we transmit; a
    // collision is always surfaced (requirement 2.3).
    if (!this.halfDuplex.shouldDecode(event)) return;
    this.registry.emit(event);
  }

  close(): void {
    // Safe to call more than once: the BroadcastChannel is closed exactly once.
    if (this.closed) return;
    this.closed = true;
    this.registry.clear();
    this.options.channel.onmessage = null;
    this.options.channel.onmessageerror = null;
    this.options.channel.close();
    this.statuses.emit({ kind: "ended", reason: "closed" });
    this.statuses.clear();
  }
}

/** Convenience factory mirroring `new LoopbackTransport(options)`. */
export function createLoopbackTransport(
  options: LoopbackTransportOptions,
): LoopbackTransport {
  return new LoopbackTransport(options);
}
