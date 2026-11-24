/**
 * Seeded simulated lossy channel.
 *
 * It applies to a stream of messages the kinds of impairment a poor line
 * applies: delay, drop, bit flips, and collision when two transmissions overlap
 * (half-duplex). Every impairment decision is drawn from the seeded
 * PRNG in `src/channel/prng.ts`, so the same `(seed, profile, ordered sends)`
 * always yields the identical ordered event sequence (the determinism contract
 * that backs property P4, requirement 3.1). No wall-clock time and no unseeded randomness.
 *
 * Pure: a function over plain data, no DOM and no audio hardware, so it runs
 * identically in Node (tests) and the browser. A transport wraps this core and
 * hands each emitted event to the engine reducer as exactly one appended event
 * (requirement 5.1).
 *
 * ## Open design point 3 — collision definition
 *
 * Each send occupies an airtime interval `[sendTime, sendTime + airtime)`
 * (half-open). Two frames collide when their airtime intervals **strictly
 * overlap**: `a.start < b.end && b.start < a.end`. Frames that merely touch at an
 * endpoint — one ending exactly when the next begins — do **not** collide. The
 * half-open interval makes that boundary unambiguous and symmetric. A collided
 * frame is never delivered and never garbled-delivered; both parties see a
 * `collision` (requirement 3.2).
 *
 * ## Open design point 4 — channel event time unit
 *
 * The channel works directly in the engine's integer sim-time unit. `sendTime`,
 * `airtime`, the profile's delays and the emitted `simTime` are all integers in
 * that one unit; nothing is converted at the transport boundary. Keeping a single
 * unit end-to-end means a channel event can be appended to the engine log as-is
 * (requirement 5.1) and the Séance reads one consistent timeline.
 */

import { Prng } from "./prng";

/**
 * Impairment parameters for a window of the drill, scripted by the scenario.
 * Delays are in the engine's integer sim-time unit; probabilities are in [0, 1].
 */
export interface ChannelProfile {
  /** Minimum transit delay added to every delivered frame (sim-time units). */
  minDelay: number;
  /** Maximum transit delay; delay is drawn uniformly in `[minDelay, maxDelay]`. */
  maxDelay: number;
  /** Probability in [0, 1] that a frame is dropped outright (never delivered). */
  dropProb: number;
  /** Per-bit probability in [0, 1] that a payload bit flips in transit. */
  bitFlipProb: number;
}

/** A frame handed to the channel to transmit. */
export interface ChannelSend {
  /** Optional message id; copied onto every event this send produces. */
  id?: string;
  /** Role (or device id) that transmitted the frame. */
  sender: string;
  /** Intended recipient role (or device id). */
  recipient: string;
  /** Sim-time the transmission began. */
  sendTime: number;
  /** Payload bytes (0–64); the channel may corrupt them. */
  payload: Uint8Array;
  /**
   * Airtime the transmission occupies, in sim-time units. Used only for the
   * collision test. Defaults to {@link DEFAULT_AIRTIME} when omitted so callers
   * that do not model airtime still get deterministic, symmetric collisions.
   */
  airtime?: number;
}

/**
 * One outcome the channel emits. Shaped so a transport can append it to the
 * engine log as exactly one event (requirement 5.1):
 * - `received`: delivered intact; `payload` is present.
 * - `garbled`: delivered but corrupted (bad CRC); no valid payload.
 * - `collision`: airtime overlapped another frame; delivered to neither party,
 *   surfaced to both.
 */
export interface ChannelEvent {
  /** Present only when the originating send carried an id. */
  id?: string;
  kind: "received" | "garbled" | "collision";
  /** Sim-time the outcome is observed by the recipient. */
  simTime: number;
  sender: string;
  recipient: string;
  /** Present only on a `received` event: the recovered payload bytes. */
  payload?: Uint8Array;
}

/**
 * Default airtime (sim-time units) used for a send that does not specify one.
 * A single unit means a send occupies just its own instant, so distinct integer
 * send times never spuriously collide while identical send times do.
 */
export const DEFAULT_AIRTIME = 1;

/** Carry the optional id through only when present. */
function idOf(send: ChannelSend): { id?: string } {
  return send.id !== undefined ? { id: send.id } : {};
}

/** Resolve a send's airtime, clamped to at least one unit. */
function airtimeOf(send: ChannelSend): number {
  const a = send.airtime ?? DEFAULT_AIRTIME;
  return a > 0 ? a : DEFAULT_AIRTIME;
}

/**
 * Do two sends overlap in airtime? Half-open intervals
 * `[start, start + airtime)`; touching endpoints do not count (open point 3).
 */
function overlaps(a: ChannelSend, b: ChannelSend): boolean {
  const aStart = a.sendTime;
  const aEnd = a.sendTime + airtimeOf(a);
  const bStart = b.sendTime;
  const bEnd = b.sendTime + airtimeOf(b);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Flip payload bits with per-bit probability `bitFlipProb`, drawing every
 * decision from the PRNG. Returns the (possibly) corrupted copy and whether any
 * bit actually flipped. One PRNG draw per payload bit keeps the stream position
 * a deterministic function of the payload length, independent of outcomes.
 */
function applyBitFlips(
  payload: Uint8Array,
  bitFlipProb: number,
  prng: Prng,
): { bytes: Uint8Array; corrupted: boolean } {
  const bytes = payload.slice();
  let corrupted = false;
  for (let i = 0; i < bytes.length; i++) {
    for (let bit = 0; bit < 8; bit++) {
      if (prng.nextBool(bitFlipProb)) {
        bytes[i] ^= 1 << bit;
        corrupted = true;
      }
    }
  }
  return { bytes, corrupted };
}

/**
 * ## Loss source: the one documented interface for "lost"
 *
 * The channel owns collision geometry and event ordering. A {@link LossSource}
 * owns everything else an application means by "lost": whether a send that did
 * not collide is dropped, how late it arrives, and whether its bytes arrive
 * damaged.
 *
 * - `assess(send, prng)` is called once per non-collided send, in the channel's
 *   stable order (by `sendTime`, then original index). Collided sends are never
 *   assessed, so a source cannot shift the draws of other sends by colliding.
 * - All randomness must come from the `prng` argument. A source must not read a
 *   wall clock, an unseeded random source, or any state that differs between two runs.
 *   Under that rule, two runs with the same seed, source and sends give equal
 *   output.
 * - It returns an {@link Impairment}: `dropped` (no event at all), `delay`
 *   (integer sim-time units, `>= 0`), `payload` (the bytes as the recipient would
 *   see them) and `corrupted` (any difference from the sent bytes yields a
 *   `garbled` event and no payload; otherwise `received` carries a copy).
 * - A negative or non-integer `delay` makes `runChannel` throw a `RangeError`
 *   naming the send id, because it would put an event before its send time.
 * - A source may read outside state (for example, whether the recipient was
 *   busy at `send.sendTime`) as long as that state is itself deterministic.
 *
 * {@link profileLoss} builds the source for a {@link ChannelProfile}. It draws in
 * a fixed order: drop, then delay, then one draw per payload bit.
 * `runChannel(seed, profile, sends)` wraps a bare profile with it, so
 * `runChannel(seed, profile, sends)` equals
 * `runChannel(seed, profileLoss(profile), sends)`.
 */
export interface Impairment {
  /** True when the send never arrives; the channel emits no event for it. */
  dropped: boolean;
  /** Extra transit time in integer sim-time units, `>= 0`. */
  delay: number;
  /** Bytes as the recipient would see them. */
  payload: Uint8Array;
  /** True when `payload` no longer equals the sent bytes. */
  corrupted: boolean;
}

/** Decides what happens to each non-collided send. See the block above. */
export interface LossSource {
  /**
   * Called once per non-collided send, in the channel's stable order. Must take
   * all randomness from `prng` and read no wall clock.
   */
  assess(send: ChannelSend, prng: Prng): Impairment;
}

/**
 * The loss source for a {@link ChannelProfile}: drop, then delay, then one draw
 * per payload bit, exactly the draw sequence `runChannel` used before sources
 * existed.
 */
export function profileLoss(profile: ChannelProfile): LossSource {
  const delaySpan = Math.max(0, profile.maxDelay - profile.minDelay);
  return {
    assess(send, prng) {
      const dropped = prng.nextBool(profile.dropProb);
      const delay =
        profile.minDelay +
        (delaySpan > 0 ? Math.floor(prng.nextFloat() * (delaySpan + 1)) : 0);
      const { bytes, corrupted } = applyBitFlips(send.payload, profile.bitFlipProb, prng);
      return { dropped, delay, payload: bytes, corrupted };
    },
  };
}

/** Accept either a profile or a source; a profile is wrapped with profileLoss. */
function toLossSource(loss: ChannelProfile | LossSource): LossSource {
  return "assess" in loss ? loss : profileLoss(loss);
}

/**
 * Run a batch of sends through the seeded simulated channel.
 *
 * Determinism (requirement 3.1): impairment decisions are drawn from a single
 * PRNG seeded by `seed`, in a fixed order — sends are processed in a stable order
 * (by `sendTime`, then original index), and for each non-collided send the draws
 * happen in a fixed sequence (drop, then delay, then per-bit flips). Collisions
 * are decided first from the send geometry alone (no PRNG), so adding or removing
 * collisions never shifts the PRNG stream for the surviving frames.
 *
 * Delivery order (requirement 3.3): every `received` event's `simTime` is at
 * least `sendTime + minDelay`; dropped and collided frames emit no `received`
 * event, so the bound holds vacuously for them.
 *
 * @param seed uint32 seed for the run's PRNG.
 * @param loss a {@link ChannelProfile} (wrapped with {@link profileLoss}) or a
 *        {@link LossSource}.
 * @param sends the frames to transmit, in any order.
 * @returns the ordered list of channel events (sorted by `(simTime, sender,
 *          recipient, kind)` for a stable, seed-reproducible sequence).
 */
export function runChannel(
  seed: number,
  loss: ChannelProfile | LossSource,
  sends: readonly ChannelSend[],
): ChannelEvent[] {
  const source = toLossSource(loss);
  const prng = new Prng(seed);

  // Stable processing order: by send time, then by original position. Keeps the
  // PRNG draw order a pure function of the inputs regardless of caller ordering.
  const indexed = sends.map((send, index) => ({ send, index }));
  indexed.sort((a, b) =>
    a.send.sendTime !== b.send.sendTime
      ? a.send.sendTime - b.send.sendTime
      : a.index - b.index,
  );

  // Collision detection is pure geometry: a send collides if its airtime
  // overlaps any other send. Decided before any PRNG draw so it never perturbs
  // the impairment stream of the surviving frames.
  const collided = new Array<boolean>(indexed.length).fill(false);
  for (let i = 0; i < indexed.length; i++) {
    for (let j = i + 1; j < indexed.length; j++) {
      if (overlaps(indexed[i].send, indexed[j].send)) {
        collided[i] = true;
        collided[j] = true;
      }
    }
  }

  const events: ChannelEvent[] = [];

  for (let i = 0; i < indexed.length; i++) {
    const { send } = indexed[i];

    if (collided[i]) {
      // Delivered to neither party; both see a collision at the send instant.
      events.push({
        ...idOf(send),
        kind: "collision",
        simTime: send.sendTime,
        sender: send.sender,
        recipient: send.recipient,
      });
      continue;
    }

    // One assessment per surviving send; the source fixes its own draw order.
    const { dropped, delay, payload: seen, corrupted } = source.assess(send, prng);
    if (!Number.isInteger(delay) || delay < 0) {
      throw new RangeError(
        `loss source returned an invalid delay ${delay} for send ${send.id ?? "(no id)"}: ` +
          "expected a non-negative integer",
      );
    }

    if (dropped) {
      // A dropped frame produces no event at all — it never arrives.
      continue;
    }

    const simTime = send.sendTime + delay;

    if (corrupted) {
      // A real bit flip would fail the link's integrity check: the recipient
      // sees `garbled`, never a silently repaired payload (requirement 1.2).
      events.push({
        ...idOf(send),
        kind: "garbled",
        simTime,
        sender: send.sender,
        recipient: send.recipient,
      });
    } else {
      // Clean transit: the recipient gets an independent copy of the payload.
      const payload = seen.slice();
      events.push({
        ...idOf(send),
        kind: "received",
        simTime,
        sender: send.sender,
        recipient: send.recipient,
        payload,
      });
    }
  }

  // Deterministic, seed-reproducible ordering of the emitted events.
  events.sort(
    (a, b) =>
      a.simTime - b.simTime ||
      a.sender.localeCompare(b.sender) ||
      a.recipient.localeCompare(b.recipient) ||
      a.kind.localeCompare(b.kind),
  );

  return events;
}
