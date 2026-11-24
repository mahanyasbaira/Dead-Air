/**
 * The `Transport` interface for Dead Air's Wire.
 *
 * A transport is anything that carries framed messages between two devices and
 * surfaces each outcome as one of three events: `received`, `garbled` or
 * `collision` (spec glossary; requirement 4.1). The system provides three
 * implementations behind this one interface — acoustic (speaker→mic, Phase C),
 * loopback (two tabs via `BroadcastChannel`) and scripted (solo partner) — so
 * the consoles above can swap the link without knowing which one is live.
 *
 * Import direction stays one-way: `transport -> modem/channel -> engine`. A
 * transport emits plain {@link TransportEvent} objects the existing engine
 * reducer already understands; the engine never reaches outward into transports
 * (design "Scope and boundaries").
 *
 * ## Half-duplex (requirement 2.3)
 *
 * A real device cannot decode incoming audio while its own speaker is
 * transmitting. Every transport models this as a small state machine with a
 * {@link TransportMode}: while `transmitting`, inbound decoding is suppressed and
 * no `received`/`garbled` event is delivered. Overlapping transmissions surface
 * as a `collision` to both parties (handled by the simulated channel core).
 */

import type { ChannelEvent } from "hindsight";

/**
 * One outcome a transport reports to its listeners. This is exactly the
 * {@link ChannelEvent} shape from the simulated channel (design "Data model"):
 * `{ kind, simTime, sender, recipient, payload? }`, so a listener can append it
 * to the engine log as one event (requirement 5.1) with no reshaping.
 */
export type TransportEvent = ChannelEvent;

/** The three outcome kinds a transport can emit. */
export type TransportEventKind = TransportEvent["kind"];

/**
 * Half-duplex state of a device's link (requirement 2.3).
 * - `idle`: listening; inbound events are delivered.
 * - `transmitting`: the device's own carrier is on; inbound decoding is
 *   suppressed until transmission ends.
 */
export type TransportMode = "idle" | "transmitting";

/**
 * A frame queued for transmission by the local device.
 *
 * The transport frames and impairs the `payload`; `sender`/`recipient` identify
 * the two ends of the link and `airtime` is how long the carrier occupies the
 * medium (used for collision detection). Airtime is optional: until the FSK
 * sample length arrives in B1 a nominal value is used (see
 * {@link Transport} docs and `docs/RESULTS.md`).
 */
export interface TransportFrame {
  sender: string;
  recipient: string;
  /** Payload bytes (0–64); framed and possibly corrupted in transit. */
  payload: Uint8Array;
  /** Sim-time the transmission begins. */
  sendTime: number;
  /** Carrier airtime in sim-time units. Defaults to the channel's nominal value. */
  airtime?: number;
  /**
   * Optional stable message id. When present the transport carries it onto the
   * outcome of this send (the simulated channel copies it), so a log can match a
   * send to what became of it. Transports that cannot carry it leave it out.
   */
  id?: string;
}

/** A listener invoked once per transport outcome. */
export type TransportListener = (event: TransportEvent) => void;

/** Unsubscribe handle returned by {@link Transport.on}. */
export type Unsubscribe = () => void;

/**
 * A change in the link itself, not in a message (consoles 11.2 follow-up).
 * - `ended`: the link is gone for good (closed, microphone unplugged, audio
 *   context closed). Emitted at most once per transport.
 * - `error`: the link hit a fault but may still work (a message that could not
 *   be read from the other tab, audio interrupted). May repeat.
 * `reason` is a short stable code such as `"closed"` or `"microphone-ended"`,
 * not a sentence; the interface words it.
 */
export interface TransportStatus {
  kind: "ended" | "error";
  reason: string;
}

/** A listener invoked once per {@link TransportStatus}. */
export type TransportStatusListener = (status: TransportStatus) => void;

/**
 * The one interface every link implements (requirement 4.1).
 *
 * `send` queues a frame for transmission; `on` subscribes to outcomes; `mode`
 * exposes the half-duplex state so a console can show the carrier lamp and a
 * test can assert that decoding is suppressed while `transmitting`
 * (requirement 2.3). `close` releases any underlying resource (e.g. a
 * `BroadcastChannel`).
 */
export interface Transport {
  /** Queue a frame for transmission over the link. */
  send(frame: TransportFrame): void;
  /** Subscribe to transport outcomes; returns an unsubscribe handle. */
  on(listener: TransportListener): Unsubscribe;
  /**
   * Subscribe to link status (end or fault). Optional so existing transports and
   * test doubles keep compiling; the three real transports implement it.
   */
  onStatus?(listener: TransportStatusListener): Unsubscribe;
  /** Current half-duplex mode (`idle` or `transmitting`). */
  readonly mode: TransportMode;
  /** Release any underlying resources. Safe to call more than once. */
  close(): void;
}
