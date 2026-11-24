/**
 * Booth console: teleprinter, carrier lamp, signal indicator and composer.
 * Props are the role-visible events and the transport; the Shell (RunHost) owns
 * the run. Sending builds a TransportFrame and calls transport.send once.
 */
import type { ReceiveMetadata } from "../../../transport/acoustic-metadata";
import type { PlayMode, Transport } from "../../shell/types";
import { SignalIndicator } from "../../fx/waterfall";
import { carrierState } from "./carrier";
import { CarrierLamp } from "./CarrierLamp";
import { Composer } from "./ComposerForm";
import { Teleprinter, type BoothEvent } from "./Teleprinter";
import "./booth.css";

export interface BoothConsoleProps {
  /** Role-visible outcomes, oldest first. */
  events: readonly BoothEvent[];
  transport: Transport;
  mode: PlayMode;
  /** This device's id and the other end's id, for the outgoing frame. */
  self: string;
  partner: string;
  /** Current sim-time, for the frame's sendTime. */
  now: () => number;
  /** Latest acoustic burst measurement, if any. */
  lastMeasurement?: ReceiveMetadata;
}

export function BoothConsole({
  events,
  transport,
  mode,
  self,
  partner,
  now,
  lastMeasurement,
}: BoothConsoleProps) {
  const recent = events.length > 0 ? events[events.length - 1].kind : undefined;
  const state = carrierState(transport.mode, recent);
  return (
    <section className="booth" aria-labelledby="booth-title">
      <h2 id="booth-title" className="booth-title">Booth</h2>
      <CarrierLamp state={state} />
      <SignalIndicator mode={mode} lastMeasurement={lastMeasurement} />
      <Teleprinter events={events} />
      <Composer
        onSend={(payload) =>
          transport.send({ sender: self, recipient: partner, payload, sendTime: now() })
        }
      />
    </section>
  );
}
