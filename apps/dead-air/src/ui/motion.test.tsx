// @vitest-environment jsdom
/**
 * With `prefers-reduced-motion: reduce` (consoles 12.2, Req 5.2): a received
 * message and a send show up at once, and once the carrier airtime has run no
 * timer is left pending. Real browser rendering stays a manual check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAudioBus } from "./fx/audio";
import type { TransportEvent, TransportFrame, TransportMode } from "../transport/types";
import { RunHost } from "./shell/RunHost";

function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
  window.matchMedia = globalThis.matchMedia;
}

function fakeTransport() {
  const listeners = new Set<(e: TransportEvent) => void>();
  return {
    sent: [] as TransportFrame[],
    mode: "idle" as TransportMode,
    send(frame: TransportFrame) {
      this.sent.push(frame);
      this.mode = "transmitting";
    },
    endTransmit() {
      this.mode = "idle";
    },
    on(l: (e: TransportEvent) => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    close() {},
    emit(e: TransportEvent) {
      act(() => [...listeners].forEach((l) => l(e)));
    },
  };
}

beforeEach(() => {
  stubMatchMedia();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reduced motion, RunHost", () => {
  it("shows the Teleprinter line, status text and lamp state at once, and leaves no timers after airtime", async () => {
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    const fake = fakeTransport();
    const store = new Map<string, string>();
    const user = userEvent.setup({ delay: null });
    render(
      <RunHost
        storage={{
          getItem: (k) => store.get(k) ?? null,
          setItem: (k, v) => void store.set(k, v),
          removeItem: (k) => void store.delete(k),
        }}
        createScripted={() => fake}
        createBus={(o) => createAudioBus(o)}
        createSynth={() => ({ carrierOn() {}, carrierOff() {}, chirp() {} })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Solo" }));
    await user.click(screen.getByRole("button", { name: /Dispatch/ }));
    expect(screen.getByText("Carrier idle.")).toBeVisible();
    // Real timers get us through Entry; from here the clock is fake so every
    // timer the console creates is counted.
    vi.useFakeTimers();
    const baseline = vi.getTimerCount();

    // Received: no timer advance at all.
    fake.emit({
      kind: "received", simTime: 1, sender: "field", recipient: "dispatch",
      payload: new TextEncoder().encode("Wind rising"),
    });
    expect(screen.getByText("Wind rising")).toBeVisible();
    expect(screen.getByText("Carrier receiving.")).toBeVisible();

    // Send: the lamp and the status line change before any timer runs.
    // fireEvent, not user-event: user-event waits on timers, which are fake here.
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Copy that" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("Carrier sending.")).toBeVisible();
    expect(screen.getByText("Chirp: message sent.")).toBeVisible();
    expect(fake.sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBeGreaterThan(baseline); // the airtime scheduler

    // After the airtime, back to idle with nothing left pending.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText("Carrier sending.")).toBeNull();
    expect(vi.getTimerCount()).toBe(baseline);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(vi.getTimerCount()).toBe(baseline);
  });
});
