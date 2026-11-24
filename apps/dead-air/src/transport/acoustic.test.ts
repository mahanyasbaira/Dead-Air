import { describe, expect, it } from "vitest";
import { AcousticTransport, type AcousticEvent, type AudioIO } from "./acoustic";
import { modulate } from "../modem/fsk";
import { frame } from "../modem/frame";
import type { Transport, TransportStatus } from "./types";

const SR = 48000;

/** Test double for the hardware seam. No Web Audio. */
class FakeIO implements AudioIO {
  readonly sampleRate = SR;
  listening = true;
  played: Float32Array[] = [];
  closed = false;
  private onBurst: (s: Float32Array) => void = () => {};
  private release: () => void = () => {};
  async start(cb: (s: Float32Array) => void): Promise<void> {
    this.onBurst = cb;
  }
  setListening(on: boolean): void {
    this.listening = on;
  }
  play(samples: Float32Array): Promise<void> {
    this.played.push(samples);
    return new Promise((r) => (this.release = r));
  }
  finishPlayback(): void {
    this.release();
  }
  hear(samples: Float32Array): void {
    this.onBurst(samples);
  }
  private statusListener: (s: TransportStatus) => void = () => {};
  onStatus(listener: (s: TransportStatus) => void): void {
    this.statusListener = listener;
  }
  fault(s: TransportStatus): void {
    this.statusListener(s);
  }
  close(): void {
    this.closed = true;
  }
}

function setup() {
  const io = new FakeIO();
  let t = 10;
  const tr = new AcousticTransport({ io, localId: "tower", remoteId: "booth", now: () => t });
  const events: AcousticEvent[] = [];
  tr.on((e) => events.push(e as AcousticEvent));
  return { io, tr, events, setTime: (v: number) => (t = v) };
}

const burstOf = (bytes: number[]) => modulate(frame(Uint8Array.from(bytes)), SR);

describe("AcousticTransport", () => {
  it("satisfies the Transport interface (Req 4.1)", () => {
    const tr: Transport = setup().tr;
    expect(typeof tr.send).toBe("function");
    expect(tr.mode).toBe("idle");
  });

  it("delivers a received event with airtime and level metadata (Req 4.3)", async () => {
    const { io, tr, events } = setup();
    await tr.start();
    const burst = burstOf([7, 8, 9]);
    io.hear(burst);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.kind).toBe("received");
    expect(Array.from(e.payload ?? [])).toEqual([7, 8, 9]);
    expect(e).toMatchObject({ sender: "booth", recipient: "tower", simTime: 10 });
    expect(e.meta.airtimeMs).toBeCloseTo((burst.length / SR) * 1000, 6);
    expect(e.meta.dbfs).toBeLessThan(0);
    expect(e.meta.dbfs).toBeGreaterThan(-20);
  });

  it("reports a burst that does not parse as garbled", async () => {
    const { io, tr, events } = setup();
    await tr.start();
    io.hear(new Float32Array(SR / 10).fill(0.3));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("garbled");
    expect(events[0].payload).toBeUndefined();
  });

  it("does not decode while transmitting, and resumes after (Req 2.3)", async () => {
    const { io, tr, events } = setup();
    await tr.start();
    const sent = tr.send({ sender: "tower", recipient: "booth", payload: Uint8Array.of(1), sendTime: 10 });
    expect(tr.mode).toBe("transmitting");
    expect(io.listening).toBe(false);
    expect(io.played).toHaveLength(1);
    io.hear(burstOf([5]));
    expect(events).toHaveLength(0);
    io.finishPlayback();
    await sent;
    expect(tr.mode).toBe("idle");
    expect(io.listening).toBe(true);
    io.hear(burstOf([5]));
    expect(events).toHaveLength(1);
  });

  it("stops delivering and releases the device after close", async () => {
    const { io, tr, events } = setup();
    await tr.start();
    tr.close();
    tr.close();
    io.hear(burstOf([1]));
    expect(events).toHaveLength(0);
    expect(io.closed).toBe(true);
  });
});

describe("AcousticTransport link status", () => {
  it("passes on a microphone that ended, and an interruption, and reports ended only once", () => {
    const { io, tr } = setup();
    const seen: TransportStatus[] = [];
    tr.onStatus((s) => seen.push(s));
    io.fault({ kind: "ended", reason: "microphone-ended" });
    io.fault({ kind: "error", reason: "audio-interrupted" });
    tr.close();
    tr.close();
    io.fault({ kind: "ended", reason: "audio-closed" });
    expect(seen).toEqual([
      { kind: "ended", reason: "microphone-ended" },
      { kind: "error", reason: "audio-interrupted" },
    ]);
  });

  it("reports ended with reason closed when closed with no earlier end", () => {
    const { tr } = setup();
    const seen: TransportStatus[] = [];
    tr.onStatus((s) => seen.push(s));
    tr.close();
    expect(seen).toEqual([{ kind: "ended", reason: "closed" }]);
  });
});
