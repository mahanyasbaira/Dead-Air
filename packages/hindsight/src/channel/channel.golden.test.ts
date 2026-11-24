import { describe, expect, it } from "vitest";
import { runChannel, type ChannelProfile, type ChannelSend } from "./channel";

/**
 * Golden vectors for `runChannel`: 3 fixed seeds x 2 profiles over one fixed
 * send list (includes a collision pair, empty to 64-byte payloads). The expected
 * lists were generated from the code before the channel was decoupled from the
 * frame module (skeleton task 2.1) and must never change with that refactor.
 * Payloads are hex strings; `null` means the event carries no payload.
 *
 * **Validates: Requirements 2.3, 4.4**
 */

interface Golden {
  kind: string;
  simTime: number;
  sender: string;
  recipient: string;
  payload: string | null;
}

const SEEDS = [1, 20261204, 4294967295] as const;

const PROFILES: Record<string, ChannelProfile> = {
  mild: { minDelay: 1, maxDelay: 4, dropProb: 0.1, bitFlipProb: 0.001 },
  harsh: { minDelay: 2, maxDelay: 12, dropProb: 0.35, bitFlipProb: 0.01 },
};

function bytes(n: number, mul: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * mul + n) & 0xff);
}

const SENDS: ChannelSend[] = [
  { sender: "p1", recipient: "p2", sendTime: 0, payload: bytes(0, 1) },
  { sender: "p2", recipient: "p1", sendTime: 5, payload: bytes(1, 7) },
  { sender: "p3", recipient: "p1", sendTime: 10, payload: bytes(17, 3), airtime: 4 },
  { sender: "p1", recipient: "p3", sendTime: 12, payload: bytes(9, 5), airtime: 4 },
  { sender: "p2", recipient: "p3", sendTime: 20, payload: bytes(33, 11) },
  { sender: "p3", recipient: "p2", sendTime: 25, payload: bytes(64, 13) },
  { sender: "p1", recipient: "p2", sendTime: 30, payload: bytes(48, 17) },
  { sender: "p2", recipient: "p1", sendTime: 40, payload: bytes(5, 19) },
];

const EXPECTED: Record<string, Golden[]> = {
  "1/mild": [
    { kind: "received", simTime: 1, sender: "p1", recipient: "p2", payload: "" },
    { kind: "received", simTime: 9, sender: "p2", recipient: "p1", payload: "01" },
    { kind: "collision", simTime: 10, sender: "p3", recipient: "p1", payload: null },
    { kind: "collision", simTime: 12, sender: "p1", recipient: "p3", payload: null },
    { kind: "received", simTime: 22, sender: "p2", recipient: "p3", payload: "212c37424d58636e79848f9aa5b0bbc6d1dce7f2fd08131e29343f4a55606b7681" },
    { kind: "received", simTime: 32, sender: "p1", recipient: "p2", payload: "30415263748596a7b8c9daebfc0d1e2f405162738495a6b7c8d9eafb0c1d2e3f5061728394a5b6c7d8e9fa0b1c2d3e4f" },
    { kind: "received", simTime: 44, sender: "p2", recipient: "p1", payload: "05182b3e51" },
  ],
  "1/harsh": [
    { kind: "received", simTime: 2, sender: "p1", recipient: "p2", payload: "" },
    { kind: "collision", simTime: 10, sender: "p3", recipient: "p1", payload: null },
    { kind: "collision", simTime: 12, sender: "p1", recipient: "p3", payload: null },
    { kind: "received", simTime: 17, sender: "p2", recipient: "p1", payload: "01" },
    { kind: "garbled", simTime: 36, sender: "p1", recipient: "p2", payload: null },
    { kind: "received", simTime: 52, sender: "p2", recipient: "p1", payload: "05182b3e51" },
  ],
  "20261204/mild": [
    { kind: "received", simTime: 3, sender: "p1", recipient: "p2", payload: "" },
    { kind: "received", simTime: 6, sender: "p2", recipient: "p1", payload: "01" },
    { kind: "collision", simTime: 10, sender: "p3", recipient: "p1", payload: null },
    { kind: "collision", simTime: 12, sender: "p1", recipient: "p3", payload: null },
    { kind: "garbled", simTime: 22, sender: "p2", recipient: "p3", payload: null },
    { kind: "garbled", simTime: 26, sender: "p3", recipient: "p2", payload: null },
    { kind: "received", simTime: 42, sender: "p2", recipient: "p1", payload: "05182b3e51" },
  ],
  "20261204/harsh": [
    { kind: "received", simTime: 9, sender: "p1", recipient: "p2", payload: "" },
    { kind: "collision", simTime: 10, sender: "p3", recipient: "p1", payload: null },
    { kind: "collision", simTime: 12, sender: "p1", recipient: "p3", payload: null },
    { kind: "garbled", simTime: 27, sender: "p3", recipient: "p2", payload: null },
    { kind: "received", simTime: 47, sender: "p2", recipient: "p1", payload: "05182b3e51" },
  ],
  "4294967295/mild": [
    { kind: "received", simTime: 1, sender: "p1", recipient: "p2", payload: "" },
    { kind: "received", simTime: 9, sender: "p2", recipient: "p1", payload: "01" },
    { kind: "collision", simTime: 10, sender: "p3", recipient: "p1", payload: null },
    { kind: "collision", simTime: 12, sender: "p1", recipient: "p3", payload: null },
    { kind: "received", simTime: 23, sender: "p2", recipient: "p3", payload: "212c37424d58636e79848f9aa5b0bbc6d1dce7f2fd08131e29343f4a55606b7681" },
    { kind: "garbled", simTime: 29, sender: "p3", recipient: "p2", payload: null },
    { kind: "garbled", simTime: 32, sender: "p1", recipient: "p2", payload: null },
    { kind: "received", simTime: 41, sender: "p2", recipient: "p1", payload: "05182b3e51" },
  ],
  "4294967295/harsh": [
    { kind: "received", simTime: 4, sender: "p1", recipient: "p2", payload: "" },
    { kind: "collision", simTime: 10, sender: "p3", recipient: "p1", payload: null },
    { kind: "collision", simTime: 12, sender: "p1", recipient: "p3", payload: null },
    { kind: "received", simTime: 17, sender: "p2", recipient: "p1", payload: "01" },
    { kind: "garbled", simTime: 36, sender: "p3", recipient: "p2", payload: null },
    { kind: "received", simTime: 43, sender: "p2", recipient: "p1", payload: "05182b3e51" },
  ],
};

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("runChannel golden vectors", () => {
  for (const seed of SEEDS) {
    for (const [name, profile] of Object.entries(PROFILES)) {
      it(`seed ${seed}, profile ${name}`, () => {
        const actual = runChannel(seed, profile, SENDS).map((e) => ({
          kind: e.kind,
          simTime: e.simTime,
          sender: e.sender,
          recipient: e.recipient,
          payload: e.payload ? hex(e.payload) : null,
        }));
        expect(actual).toEqual(EXPECTED[`${seed}/${name}`]);
      });
    }
  }
});
