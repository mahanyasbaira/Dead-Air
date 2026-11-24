// @vitest-environment jsdom
/**
 * Requirement 1.3 across modes and phases (consoles 11.4).
 *
 * Req 1.1 is pinned in Entry.test.tsx ("offers three modes, each with a name and
 * one sentence") and Req 1.2 in RunHost.test.tsx ("reaches the first beat in two
 * clicks in Solo"). Those files only check the drill marker and mute control on
 * Entry and at the console in Solo. This file checks that both are visible on
 * every screen (Entry, role choice, console, replay) in every mode.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAudioBus, type Synth } from "../fx/audio";
import type { Transport } from "../../transport/types";
import type { MediaDevicesLike } from "../../transport/select";
import { RunHost } from "./RunHost";
import { DRILL_MARKER } from "./Entry";

afterEach(cleanup);

function fakeTransport(): Transport {
  return { mode: "idle", send() {}, on: () => () => {}, close() {} };
}

const synth: Synth = { carrierOn() {}, carrierOff() {}, chirp() {} };
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};
const mediaDevices: MediaDevicesLike = {
  getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }),
};

function expectMarkerAndMute() {
  expect(screen.getByText(DRILL_MARKER)).toBeVisible();
  expect(screen.getByRole("button", { name: "Mute" })).toBeVisible();
}

describe("drill marker and mute control on every screen", () => {
  it.each([
    ["Solo", "Solo"],
    ["Two tabs", "Two tabs"],
    ["acoustic", "Two devices by sound"],
  ])("are present at Entry, role choice, console and replay in %s", async (_label, button) => {
    const user = userEvent.setup();
    render(
      <RunHost
        storage={storage()}
        createScripted={fakeTransport}
        createLoopback={fakeTransport}
        createAcoustic={fakeTransport}
        mediaDevices={mediaDevices}
        isSecureContext
        createBus={createAudioBus}
        createSynth={() => synth}
      />,
    );
    expectMarkerAndMute();

    await user.click(screen.getByRole("button", { name: button }));
    await screen.findByRole("heading", { name: "Choose your role" });
    expectMarkerAndMute();

    await user.click(screen.getByRole("button", { name: /Dispatch/ }));
    await screen.findByRole("heading", { name: "What you know" });
    expectMarkerAndMute();

    await user.click(screen.getByRole("button", { name: "See the replay" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /The drill (is over|was ended early)/ })).toBeVisible());
    expectMarkerAndMute();
  });
});
