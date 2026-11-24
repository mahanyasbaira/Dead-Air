// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, DRILL_MARKER, type EntryProps } from "./Entry";
import { FALLBACK_REASONS, MIC_TIMEOUT_MS, type MediaDevicesLike } from "../../transport/select";
import type { Transport } from "../../transport/types";

function fake(label: string): Transport & { label: string } {
  return { label, mode: "idle", send() {}, on: () => () => {}, close: vi.fn() };
}

function rejecting(name: string): MediaDevicesLike {
  return { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name })) };
}

function working(): MediaDevicesLike {
  return { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }) };
}

function setup(extra: Partial<EntryProps> = {}) {
  const onStart = vi.fn();
  const scripted = fake("scripted");
  const acoustic = fake("acoustic");
  const loopback = fake("loopback");
  render(
    <Entry
      onStart={onStart}
      createScripted={() => scripted}
      createLoopback={() => loopback}
      createAcoustic={() => acoustic}
      {...extra}
    />,
  );
  return { onStart, scripted, acoustic, loopback, user: userEvent.setup() };
}

describe("Entry", () => {
  it("offers three modes, each with a name and one sentence", () => {
    setup();
    for (const [name, sentence] of [
      ["Solo", /scripted partner/i],
      ["Two tabs", /second tab/i],
      ["Two devices by sound", /speaker and microphone/i],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAccessibleDescription(sentence);
      expect(screen.getByText(sentence)).toBeVisible();
    }
  });

  it("shows the drill marker and a mute control", async () => {
    const { user } = setup();
    expect(screen.getByText(DRILL_MARKER)).toBeVisible();
    expect(DRILL_MARKER).toBe("Fiction. Practice drill.");
    const mute = screen.getByRole("button", { name: "Mute" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    await user.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true");
  });

  it("starts Solo with the scripted transport", async () => {
    const { onStart, scripted, user } = setup();
    await user.click(screen.getByRole("button", { name: "Solo" }));
    expect(onStart).toHaveBeenCalledWith({ mode: "solo", transport: scripted });
  });

  it("starts Two tabs with the loopback transport", async () => {
    const { onStart, loopback, user } = setup();
    await user.click(screen.getByRole("button", { name: "Two tabs" }));
    expect(onStart).toHaveBeenCalledWith({ mode: "loopback", transport: loopback });
  });

  it("starts acoustic with no reason when the microphone works", async () => {
    const { onStart, acoustic, user } = setup({ mediaDevices: working(), isSecureContext: true });
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(onStart).toHaveBeenCalledWith({ mode: "acoustic", transport: acoustic });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    for (const reason of Object.values(FALLBACK_REASONS)) expect(screen.queryByText(reason)).toBeNull();
  });

  const cases: [string, Partial<EntryProps>, string][] = [
    ["permission is denied", { mediaDevices: rejecting("NotAllowedError"), isSecureContext: true }, FALLBACK_REASONS.denied],
    ["no microphone is found", { mediaDevices: rejecting("NotFoundError"), isSecureContext: true }, FALLBACK_REASONS["no-device"]],
    ["the page is not secure", { mediaDevices: working(), isSecureContext: false }, FALLBACK_REASONS.insecure],
  ];
  it.each(cases)("shows the reason and keeps Solo working when %s", async (_label, props, reason) => {
    const { onStart, scripted, user } = setup(props);
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    expect(await screen.findByText(reason)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(reason);
    expect(onStart).not.toHaveBeenCalled();
    const solo = screen.getByRole("button", { name: "Solo" });
    expect(solo).toBeEnabled();
    await user.click(solo);
    expect(onStart).toHaveBeenCalledWith({ mode: "solo", transport: scripted, reason });
  });

  it("works from the keyboard alone", async () => {
    const { onStart, scripted, user } = setup();
    await user.tab(); // mute control comes first in the page
    expect(screen.getByRole("button", { name: "Mute" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Solo" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onStart).toHaveBeenCalledWith({ mode: "solo", transport: scripted });
  });
});

describe("Entry with a microphone request that never answers", () => {
  afterEach(() => vi.useRealTimers());

  function pendingDevices() {
    let resolve!: (v: { getTracks(): { stop(): void }[] }) => void;
    const promise = new Promise<{ getTracks(): { stop(): void }[] }>((r) => (resolve = r));
    const stops = [vi.fn(), vi.fn()];
    const stream = { getTracks: () => stops.map((stop) => ({ stop })) };
    return { mediaDevices: { getUserMedia: () => promise } as MediaDevicesLike, arrive: () => resolve(stream), stops };
  }

  function setupFake(extra: Partial<EntryProps>) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const s = setup(extra);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    return { ...s, user };
  }

  it("shows the timeout reason after 10 s and keeps Solo working", async () => {
    const p = pendingDevices();
    const { onStart, scripted, user } = setupFake({ mediaDevices: p.mediaDevices, isSecureContext: true });
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    expect(screen.getByRole("status")).toHaveTextContent("Asking for the microphone.");
    expect(screen.getByRole("button", { name: "Two devices by sound" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS));
    expect(screen.getByRole("status")).toHaveTextContent(FALLBACK_REASONS.timeout);
    expect(screen.getByRole("button", { name: "Two devices by sound" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Solo" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith({ mode: "solo", transport: scripted, reason: FALLBACK_REASONS.timeout });
  });

  it("ignores a stream that arrives after the timeout and stops its tracks", async () => {
    const p = pendingDevices();
    const { onStart, user } = setupFake({ mediaDevices: p.mediaDevices, isSecureContext: true });
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    await act(() => vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS));
    await act(async () => {
      p.arrive();
      await vi.advanceTimersByTimeAsync(0);
    });
    for (const stop of p.stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(FALLBACK_REASONS.timeout);
  });

  it("starts Solo once when chosen while pending, and stops a late stream", async () => {
    const p = pendingDevices();
    const { onStart, scripted, user } = setupFake({ mediaDevices: p.mediaDevices, isSecureContext: true });
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    await user.click(screen.getByRole("button", { name: "Solo" }));
    await act(async () => {
      p.arrive();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith({ mode: "solo", transport: scripted });
    for (const stop of p.stops) expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops a late stream after unmount and logs no warning", async () => {
    const p = pendingDevices();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const onStart = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(
      <Entry onStart={onStart} mediaDevices={p.mediaDevices} isSecureContext={true} createScripted={() => fake("s")} createAcoustic={() => fake("a")} />,
    );
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    unmount();
    await act(async () => {
      p.arrive();
      await vi.advanceTimersByTimeAsync(MIC_TIMEOUT_MS);
    });
    for (const stop of p.stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("Entry mute", () => {
  it("starts muted when the parent says so and reports each change once", async () => {
    const onMutedChange = vi.fn();
    const { user } = setup({ initialMuted: true, onMutedChange });
    const mute = screen.getByRole("button", { name: "Mute" });
    expect(mute).toHaveAttribute("aria-pressed", "true");
    await user.click(mute);
    expect(onMutedChange).toHaveBeenCalledTimes(1);
    expect(onMutedChange).toHaveBeenCalledWith(false);
  });
});
