/**
 * Transport selection with microphone fallback (signal-chain Req 4.2).
 *
 * Tries the acoustic transport first. If the microphone cannot be used, falls
 * back to the scripted transport and returns a plain-text reason for the screen.
 *
 * Fallback is scripted, not loopback: loopback needs a second tab or a partner
 * already open, and Dead Air must offer something to a person alone. The
 * caller can still offer loopback by choice.
 *
 * Everything with a side effect is injected, so tests need no hardware.
 *
 * Timeout: if the browser never answers the permission request, the selection
 * settles after `MIC_TIMEOUT_MS` with the "timeout" fallback.
 *
 * Cancellation: pass `signal`. Aborting settles the promise with
 * `{ kind: "cancelled" }` and clears the timer. In every case where the result
 * has already been settled (timeout or abort), a stream that arrives late has
 * all its tracks stopped, no acoustic transport is built, and a late rejection
 * is swallowed. A `cancelled` result carries no transport; the caller must not
 * act on it.
 */
import type { Transport } from "./types";

/** The slice of `navigator.mediaDevices` the probe uses. */
export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<{
    getTracks(): { stop(): void }[];
  }>;
}

export interface SelectTransportInput {
  /** `navigator.mediaDevices`, which is undefined without a device or secure context. */
  mediaDevices: MediaDevicesLike | undefined;
  /** `window.isSecureContext`. Omit when unknown. */
  isSecureContext?: boolean;
  /** Build the acoustic transport once the microphone is confirmed. */
  createAcoustic: () => Promise<Transport> | Transport;
  /** Build the solo fallback. */
  createScripted: () => Transport;
  /** Abort to cancel the attempt. A late stream is then released and never used. */
  signal?: AbortSignal;
  /** Timer pair, injectable for tests. */
  timers?: TimerLike;
  /** Defaults to `MIC_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** How long to wait for the permission request before falling back. */
export const MIC_TIMEOUT_MS = 10_000;

/** The timer pair the selector uses. Defaults to the global `setTimeout` and `clearTimeout`. */
export interface TimerLike {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type FallbackCause = "denied" | "no-device" | "insecure" | "error" | "timeout";

export type TransportSelection =
  | { kind: "acoustic"; transport: Transport }
  | { kind: "scripted"; transport: Transport; cause: FallbackCause; reason: string }
  | { kind: "cancelled" };

export const FALLBACK_REASONS: Record<FallbackCause, string> = {
  denied: "Microphone access was denied, so this run uses the scripted partner.",
  "no-device": "No microphone was found, so this run uses the scripted partner.",
  insecure: "The microphone needs a secure page (https), so this run uses the scripted partner.",
  error: "The microphone could not be started, so this run uses the scripted partner.",
  timeout: "The microphone did not respond within 10 seconds, so this run uses the scripted partner.",
};

function errorName(e: unknown): string {
  return typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
}

export function classifyMicError(e: unknown): FallbackCause {
  const name = errorName(e);
  if (name === "NotAllowedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-device";
  if (name === "SecurityError") return "insecure";
  return "error";
}

export function selectTransport(input: SelectTransportInput): Promise<TransportSelection> {
  const fallback = (cause: FallbackCause): TransportSelection => ({
    kind: "scripted",
    transport: input.createScripted(),
    cause,
    reason: FALLBACK_REASONS[cause],
  });

  if (input.signal?.aborted) return Promise.resolve({ kind: "cancelled" });
  if (input.isSecureContext === false) return Promise.resolve(fallback("insecure"));
  if (!input.mediaDevices) return Promise.resolve(fallback("no-device"));
  const devices = input.mediaDevices;

  return new Promise<TransportSelection>((resolve) => {
    const timers: TimerLike = input.timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
    };
    let settled = false;
    let handle: unknown;
    const onAbort = () => finish(() => ({ kind: "cancelled" }));

    /** Settles once. Later calls do nothing and never run their thunk. */
    function finish(make: () => TransportSelection) {
      if (settled) return;
      settled = true;
      stopTimer();
      input.signal?.removeEventListener("abort", onAbort);
      resolve(make());
    }
    function stopTimer() {
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = undefined;
    }

    input.signal?.addEventListener("abort", onAbort);
    handle = timers.setTimeout(() => finish(() => fallback("timeout")), input.timeoutMs ?? MIC_TIMEOUT_MS);

    let request: Promise<{ getTracks(): { stop(): void }[] }>;
    try {
      request = devices.getUserMedia({ audio: true });
    } catch (e) {
      finish(() => fallback(classifyMicError(e)));
      return;
    }

    request.then(
      async (stream) => {
        // Probe only: always release the microphone, even for a stale attempt.
        for (const track of stream.getTracks()) track.stop();
        if (settled) return;
        stopTimer();
        try {
          const transport = await input.createAcoustic();
          if (settled) {
            transport.close();
            return;
          }
          finish(() => ({ kind: "acoustic", transport }));
        } catch (e) {
          finish(() => fallback(classifyMicError(e)));
        }
      },
      (e) => finish(() => fallback(classifyMicError(e))),
    );
  });
}
