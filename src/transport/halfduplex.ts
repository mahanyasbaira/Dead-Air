/**
 * Shared half-duplex state machine and listener registry for transports.
 *
 * Pure and deterministic: no DOM, no timers, no randomness. Both the scripted
 * and loopback transports compose this so the half-duplex rule (requirement
 * 2.3) is defined in exactly one place and testable without any audio or
 * `BroadcastChannel`.
 *
 * ## Half-duplex rule (requirement 2.3)
 *
 * WHILE a device is transmitting, the modem SHALL NOT decode incoming audio.
 * Modelled here as a mode flag: a device enters `transmitting` for the airtime
 * window of its own send and returns to `idle` afterwards. Any inbound outcome
 * observed while `transmitting` is suppressed — not delivered to listeners —
 * which is the transport-level expression of "do not decode while transmitting".
 */

import type {
  TransportEvent,
  TransportListener,
  TransportMode,
  Unsubscribe,
} from "./types";

/** A fan-out registry of transport listeners. */
export class ListenerRegistry {
  private readonly listeners = new Set<TransportListener>();

  on(listener: TransportListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Deliver one event to every current listener. */
  emit(event: TransportEvent): void {
    // Iterate a snapshot so a listener that unsubscribes during dispatch does
    // not perturb the current fan-out.
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Tracks the local device's half-duplex mode (requirement 2.3).
 *
 * A device transmitting over `[sendTime, sendTime + airtime)` is `transmitting`
 * for any observation time inside that half-open window and `idle` otherwise.
 * The window is half-open to match the channel's collision definition (open
 * design point 3): a transmission ending exactly when another observation
 * happens no longer blocks it.
 */
export class HalfDuplexState {
  private txStart = 0;
  private txEnd = 0;
  private active = false;

  /** Begin a transmission occupying `[sendTime, sendTime + airtime)`. */
  beginTransmit(sendTime: number, airtime: number): void {
    this.txStart = sendTime;
    this.txEnd = sendTime + Math.max(1, airtime);
    this.active = true;
  }

  /** End the current transmission; the device returns to `idle`. */
  endTransmit(): void {
    this.active = false;
  }

  /** Is the device transmitting at observation time `at`? */
  isTransmittingAt(at: number): boolean {
    return this.active && at >= this.txStart && at < this.txEnd;
  }

  /** The mode at observation time `at`. */
  modeAt(at: number): TransportMode {
    return this.isTransmittingAt(at) ? "transmitting" : "idle";
  }

  /** Current mode ignoring a specific observation time (uses the tx window end). */
  get mode(): TransportMode {
    return this.active ? "transmitting" : "idle";
  }

  /**
   * Should an inbound outcome observed at `simTime` be decoded (delivered)?
   * Suppressed while the device is transmitting at that instant (requirement
   * 2.3). A `collision` is always surfaced: it is the explicit outcome of
   * overlapping transmissions and must reach both parties even though neither
   * decoded a clean frame.
   */
  shouldDecode(event: Pick<TransportEvent, "kind" | "simTime">): boolean {
    if (event.kind === "collision") return true;
    return !this.isTransmittingAt(event.simTime);
  }
}
