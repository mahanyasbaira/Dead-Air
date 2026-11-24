/**
 * Default transport factories for the Entry screen (consoles 11.1).
 *
 * Entry takes these as props so tests can stub them. The acoustic factory loads
 * its Web Audio code on demand, so nothing audio-related is imported until a
 * person picks "Two devices by sound".
 *
 * Run settings (task 11.2): Entry builds the transport before the player has
 * chosen a role, so the ids, seed, partner schedule and clock live in one
 * mutable `LinkSettings` object that RunHost fills in later. Each transport reads
 * its options lazily, so a getter over this object always answers with the
 * current values. Called with no argument, every factory behaves as before.
 */
import type { ChannelProfile } from "hindsight";
import { createLoopbackTransport, type BroadcastChannelLike } from "../../transport/loopback";
import { createScriptedTransport, type ScriptedSend } from "../../transport/scripted";
import type { Transport } from "../../transport/types";
const PREVIEW_SEED = 9;
const PREVIEW_PROFILE: ChannelProfile = { minDelay: 1, maxDelay: 3, dropProb: 0.1, bitFlipProb: 0.002 };
const LOCAL_ID = "dispatch";
const REMOTE_ID = "field";
/** What a run decides after the transport exists. Read lazily by every transport. */
export interface LinkSettings {
  localId: string;
  remoteId: string;
  seed: number;
  /** The scripted partner's sends (solo only). */
  schedule: readonly ScriptedSend[];
  /** Sim-time stamped on a burst the microphone hears (acoustic only). */
  now: () => number;
}
export function defaultLink(): LinkSettings {
  return {
    localId: LOCAL_ID,
    remoteId: REMOTE_ID,
    seed: PREVIEW_SEED,
    schedule: [],
    now: () => Math.round(performance.now() / 1000),
  };
}
export function createDefaultScripted(link: LinkSettings = defaultLink()): Transport {
  return createScriptedTransport({
    get seed() {
      return link.seed;
    },
    profile: PREVIEW_PROFILE,
    get schedule() {
      return link.schedule;
    },
    get localId() {
      return link.localId;
    },
  });
}
export function createDefaultLoopback(link: LinkSettings = defaultLink()): Transport {
  return createLoopbackTransport({
    get seed() {
      return link.seed;
    },
    profile: PREVIEW_PROFILE,
    get localId() {
      return link.localId;
    },
    channel: new BroadcastChannel("dead-air-loopback") as unknown as BroadcastChannelLike,
  });
}
export async function createDefaultAcoustic(link: LinkSettings = defaultLink()): Promise<Transport> {
  const [{ AcousticTransport, createWebAudioIO }, worklet] = await Promise.all([
    import("../../transport/acoustic"),
    import("../../transport/acoustic-worklet?worker&url"),
  ]);
  const io = await createWebAudioIO(worklet.default);
  const transport = new AcousticTransport({
    io,
    get localId() {
      return link.localId;
    },
    get remoteId() {
      return link.remoteId;
    },
    now: () => link.now(),
  });
  await transport.start();
  return transport;
}
