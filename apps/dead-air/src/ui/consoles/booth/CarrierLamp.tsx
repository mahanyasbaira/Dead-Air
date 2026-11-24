/**
 * Carrier lamp: the carrier state as plain text. No colour-coded lamp (design
 * language rule 2); only a collision uses the accent, because it is a loss.
 */
import { carrierText, isLossState } from "../../shell/StatusLine";
import type { CarrierState } from "../../shell/types";

export interface CarrierLampProps {
  state: CarrierState;
}

export function CarrierLamp({ state }: CarrierLampProps) {
  return (
    <p className={"booth-carrier" + (isLossState(state) ? " booth-loss" : "")} data-state={state}>
      <span className="booth-label">Carrier</span> <span>{carrierText(state)}</span>
    </p>
  );
}
