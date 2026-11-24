import type { CarrierState } from "../../shell/types";
import type { TransportEventKind, TransportMode } from "../../../transport/types";

/**
 * Carrier lamp state (consoles design, Property 1; Req 2.1).
 * transmitting => SENDING; else recent collision => COLLISION;
 * else recent received/garbled => RECEIVING; else IDLE.
 */
export function carrierState(
  mode: TransportMode,
  recentOutcomeKind?: TransportEventKind,
): CarrierState {
  if (mode === "transmitting") return "SENDING";
  if (recentOutcomeKind === "collision") return "COLLISION";
  if (recentOutcomeKind === "received" || recentOutcomeKind === "garbled") {
    return "RECEIVING";
  }
  return "IDLE";
}
