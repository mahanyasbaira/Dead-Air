import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_REASONS, MIC_TIMEOUT_MS, selectTransport, type MediaDevicesLike } from "./select";
import type { Transport } from "./types";

function fake(label: string): Transport & { label: string } {
  return { label, mode: "idle", send() {}, on: () => () => {}, close() {} };
}

function setup(devices: MediaDevicesLike | undefined, isSecureContext?: boolean) {
  const createAcoustic = vi.fn(() => fake("acoustic"));
  const createScripted = vi.fn(() => fake("scripted"));
  return {
    createAcoustic,
    createScripted,
    run: () => selectTransport({ mediaDevices: devices, isSecureContext, createAcoustic, createScripted }),
  };
}

function rejecting(name: string): MediaDevicesLike {
  return { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name })) };
}

describe("selectTransport", () => {
  it("chooses acoustic and releases the probe stream when the microphone works", async () => {
    const stop = vi.fn();
    const s = setup({ getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) });
    const r = await s.run();
    expect(r.kind).toBe("acoustic");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(s.createScripted).not.toHaveBeenCalled();
  });

  it("falls back to scripted with a denied reason on NotAllowedError", async () => {
    const r = await setup(rejecting("NotAllowedError")).run();
    expect(r).toMatchObject({ kind: "scripted", cause: "denied", reason: FALLBACK_REASONS.denied });
  });

  it("falls back with a no-device reason on NotFoundError", async () => {
    const r = await setup(rejecting("NotFoundError")).run();
    expect(r).toMatchObject({ kind: "scripted", cause: "no-device" });
  });

  it("falls back with a no-device reason when mediaDevices is undefined", async () => {
    const r = await setup(undefined).run();
    expect(r).toMatchObject({ kind: "scripted", cause: "no-device" });
  });

  it("falls back with an insecure reason outside a secure context", async () => {
    const devices = rejecting("NotAllowedError");
    const r = await setup(devices, false).run();
    expect(r).toMatchObject({ kind: "scripted", cause: "insecure" });
    expect(devices.getUserMedia).not.toHaveBeenCalled();
  });

  it("falls back with a generic reason on any other error, including acoustic setup", async () => {
    expect(await setup(rejecting("AbortError")).run()).toMatchObject({ cause: "error" });
    const createScripted = vi.fn(() => fake("scripted"));
    const r = await selectTransport({
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
      createAcoustic: () => Promise.reject(new Error("worklet failed")),
      createScripted,
    });
    expect(r).toMatchObject({ kind: "scripted", cause: "error" });
  });

  it("gives each reason as a distinct sentence without exclamation marks", () => {
    const reasons = Object.values(FALLBACK_REASONS);
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const t of reasons) {
      expect(t).not.toContain("!");
      expect(t.endsWith(".")).toBe(true);
    }
  });
});

interface NodeLike {
  on(event: "unhandledRejection", fn: (...a: unknown[]) => void): void;
  off(event: "unhandledRejection", fn: (...a: unknown[]) => void): void;
}

describe("selectTransport timeout and late results", () => {
  afterEach(() => vi.useRealTimers());

  function deferred() {
    let resolve!: (v: { getTracks(): { stop(): void }[] }) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<{ getTracks(): { stop(): void }[] }>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("falls back to scripted with the timeout reason after 10 s of silence", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const s = setup({ getUserMedia: () => new Promise(() => {}) });
    const p = s.run();
    await vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS);
    const r = await p;
    expect(MIC_TIMEOUT_MS).toBe(10_000);
    expect(r).toMatchObject({ kind: "scripted", cause: "timeout", reason: FALLBACK_REASONS.timeout });
    expect(s.createAcoustic).not.toHaveBeenCalled();
  });

  it("stops a stream that arrives after the timeout and keeps the timeout result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const d = deferred();
    const stops = [vi.fn(), vi.fn()];
    const s = setup({ getUserMedia: () => d.promise });
    const p = s.run();
    await vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS);
    const r = await p;
    d.resolve({ getTracks: () => stops.map((stop) => ({ stop })) });
    await vi.advanceTimersByTimeAsync(0);
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(s.createAcoustic).not.toHaveBeenCalled();
    expect(r).toMatchObject({ kind: "scripted", cause: "timeout" });
  });

  it("ignores a rejection that arrives after the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const unhandled = vi.fn();
    const proc = (globalThis as unknown as { process: NodeLike }).process;
    const tick = (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate;
    proc.on("unhandledRejection", unhandled);
    try {
      const d = deferred();
      const s = setup({ getUserMedia: () => d.promise });
      const p = s.run();
      await vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS);
      await p;
      d.reject(Object.assign(new Error("late"), { name: "NotAllowedError" }));
      await vi.advanceTimersByTimeAsync(0);
      await new Promise<void>((r) => tick(r));
      expect(unhandled).not.toHaveBeenCalled();
      expect(s.createScripted).toHaveBeenCalledTimes(1);
    } finally {
      proc.off("unhandledRejection", unhandled);
    }
  });

  it("still goes acoustic just before 10 s and clears the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const d = deferred();
    const stop = vi.fn();
    const s = setup({ getUserMedia: () => d.promise });
    const p = s.run();
    await vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS - 1);
    d.resolve({ getTracks: () => [{ stop }] });
    const r = await p;
    expect(r.kind).toBe("acoustic");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles as cancelled on abort, then releases a late stream without building acoustic", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const d = deferred();
    const stop = vi.fn();
    const controller = new AbortController();
    const createAcoustic = vi.fn(() => fake("acoustic"));
    const p = selectTransport({
      mediaDevices: { getUserMedia: () => d.promise },
      createAcoustic,
      createScripted: () => fake("scripted"),
      signal: controller.signal,
    });
    controller.abort();
    expect(await p).toEqual({ kind: "cancelled" });
    expect(vi.getTimerCount()).toBe(0);
    d.resolve({ getTracks: () => [{ stop }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(createAcoustic).not.toHaveBeenCalled();
  });
});
