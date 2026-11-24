/**
 * Booth composer budget (consoles Req 2.2, design Property 2).
 *
 * Pure functions, no DOM. Byte counts are UTF-8 lengths, not character counts.
 * Frame overhead comes from the real framing code and the baud from the real FSK
 * parameters, so the airtime shown matches what the modem puts on the wire.
 */
import { MAX_PAYLOAD, frame } from "../../../modem/frame";
import { BAUD } from "../../../modem/fsk";
import type { ComposerBudget } from "../../shell/types";

const encoder = new TextEncoder();

/** Preamble + sync + length + CRC, measured from `frame` itself. */
const FRAME_OVERHEAD_BYTES = frame(new Uint8Array(0)).length;

/** Bits on the wire per frame byte (binary FSK, one bit per symbol, no stop bits). */
const BITS_PER_BYTE = 8;

/** UTF-8 encoded length of `text`. */
export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Seconds the carrier is on the air for a payload of `payloadBytes` bytes.
 * Payloads above the 64-byte limit are measured as 64, the most that is ever sent.
 */
export function estimateAirtimeSeconds(payloadBytes: number): number {
  const n = Math.min(Math.max(0, payloadBytes), MAX_PAYLOAD);
  return ((FRAME_OVERHEAD_BYTES + n) * BITS_PER_BYTE) / BAUD;
}

/**
 * Live budget for the text in the composer. `estimatedAirtime` is in seconds.
 */
export function composerBudget(text: string): ComposerBudget {
  const usedBytes = utf8Length(text);
  return {
    usedBytes,
    remainingBytes: Math.max(0, MAX_PAYLOAD - usedBytes),
    estimatedAirtime: estimateAirtimeSeconds(usedBytes),
    overLimit: usedBytes > MAX_PAYLOAD,
  };
}

/**
 * Encode `text` for the transport: at most 64 bytes. When the text is longer it
 * is cut at a character (code point) boundary, so a multi-byte character is
 * dropped whole rather than split.
 */
export function buildPayload(text: string): Uint8Array {
  const all = encoder.encode(text);
  if (all.length <= MAX_PAYLOAD) return all;

  let end = 0;
  for (const ch of text) {
    const next = end + encoder.encode(ch).length;
    if (next > MAX_PAYLOAD) break;
    end = next;
  }
  return all.slice(0, end);
}
