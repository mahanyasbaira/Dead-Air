// @vitest-environment jsdom
/** Share link out (RunEnd) and in (ShareGate): same replay, no run, saved run untouched. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { encodeReplayRecord } from "hindsight/replay";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { deriveState } from "./log";
import { RunEnd } from "./RunEnd";
import { ROLE_KEY } from "./RunHost.model";
import { STORAGE_KEY } from "./persist";
import { ShareGate } from "./ShareGate";
import { BAD_LINK_SENTENCE, TOO_LARGE_SENTENCE, UNKNOWN_SCENARIO_SENTENCE } from "./share";
import type { ConsoleLogEntry, PlayMode } from "./types";

const NOTE = "Their sends happen elsewhere and are not recorded here.";
const option = staticOnChannel9.decisionPrompts.dispatch?.options[0]?.id ?? "";
const soloLog: ConsoleLogEntry[] = [
  { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 2, bytes: 3 } },
  { kind: "send", send: { id: "field-0", sender: "field", recipient: "dispatch", sendTime: 1, bytes: 1 } },
  { kind: "wire", event: { kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) } },
  { kind: "decision", decision: { role: "dispatch", optionId: option, recordedAtSimTime: 5 } },
];
const loopbackLog: ConsoleLogEntry[] = [
  { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 2, bytes: 3 } },
  { kind: "wire", event: { kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) } },
  { kind: "decision", decision: { role: "dispatch", optionId: option, recordedAtSimTime: 5 } },
];

function finish(mode: PlayMode, log: ConsoleLogEntry[]) {
  return render(
    <RunEnd scenario={staticOnChannel9} log={log} state={deriveState(staticOnChannel9, log)} mode={mode} localRole="dispatch" onRunAgain={() => {}} />,
  );
}

/** Finishes a run, presses Copy link (jsdom has no clipboard, so the field shows) and returns the URL and the lines. */
function linkFor(mode: PlayMode, log: ConsoleLogEntry[]) {
  finish(mode, log);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  const url = (screen.getByLabelText("Link text") as HTMLTextAreaElement).value;
  const lines = screen.getAllByRole("listitem").map((li) => li.textContent);
  const text = screen.getByRole("figure").textContent;
  cleanup();
  return { url, lines, text };
}

const hashOf = (url: string) => url.slice(url.indexOf("#"));

let fetchSpy: ReturnType<typeof vi.fn>;
let micSpy: ReturnType<typeof vi.fn>;
let channelSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  micSpy = vi.fn();
  channelSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("BroadcastChannel", channelSpy);
  vi.stubGlobal("AudioContext", channelSpy);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: micSpy }, configurable: true });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
  window.localStorage.clear();
});

describe("link out", () => {
  it("builds <origin><base>#s=<token>", () => {
    const { url } = linkFor("solo", soloLog);
    expect(url.startsWith(`${window.location.origin}/dead-air/#s=`)).toBe(true);
    expect(url).toMatch(/^[^#]+#s=[A-Za-z0-9_-]+$/);
  });

  it("says so in one sentence and shows no link when the run is too large", () => {
    const many: ConsoleLogEntry[] = Array.from({ length: 400 }, (_, i) => ({
      kind: "wire" as const,
      event: { kind: "received" as const, id: `field-${i}`, simTime: i, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) },
    }));
    finish("solo", many);
    expect(screen.getByText(TOO_LARGE_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
});

describe("link in", () => {
  it("shows the same replay sentences from a Solo run's link, with empty storage", () => {
    const first = linkFor("solo", soloLog);
    render(<ShareGate hash={hashOf(first.url)} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(first.lines);
    expect(screen.getByRole("figure").textContent).toBe(first.text);
    expect(first.lines.length).toBeGreaterThan(0);
  });

  it("starts nothing: no transport, no microphone, no fetch, no storage write", () => {
    const { url } = linkFor("solo", soloLog);
    const set = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    render(<ShareGate hash={hashOf(url)} />);
    expect(screen.queryByRole("button", { name: "Two tabs" })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(micSpy).not.toHaveBeenCalled();
    expect(channelSpy).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    set.mockRestore();
    remove.mockRestore();
  });

  it("takes precedence over a saved run and leaves the stored value byte-identical", () => {
    const { url } = linkFor("solo", soloLog);
    const raw = '{"version":1,"anything":"kept exactly \\u00e9"}  ';
    window.localStorage.setItem(STORAGE_KEY, raw);
    window.localStorage.setItem(ROLE_KEY, "dispatch");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    render(<ShareGate hash={hashOf(url)} />);
    expect(screen.getByRole("heading", { name: "A shared replay" })).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(window.localStorage.getItem(ROLE_KEY)).toBe("dispatch");
    expect(remove).not.toHaveBeenCalled();
    remove.mockRestore();
  });

  it("keeps the arrivals-only notice, once, for a Two tabs run's link", () => {
    const original = linkFor("loopback", loopbackLog);
    expect(original.text).toContain(NOTE);
    render(<ShareGate hash={hashOf(original.url)} />);
    expect(screen.getAllByText(new RegExp(NOTE.replace(/\./g, "\\.")))).toHaveLength(1);
    expect(screen.getByRole("figure").textContent).toBe(original.text);
  });

  it("shows one sentence and the entry screen for a bad token", () => {
    render(<ShareGate hash="#s=!!not-a-token!!" />);
    expect(screen.getByText(BAD_LINK_SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Two tabs" })).toBeInTheDocument();
  });

  it("shows one sentence and the entry screen for an unknown scenario", () => {
    const encoded = encodeReplayRecord({ version: 1, scenarioId: "no-such-drill", participants: [], events: [], decisions: [] });
    if (!encoded.ok) throw new Error("encode failed");
    render(<ShareGate hash={`#s=${encoded.token}`} />);
    expect(screen.getByText(UNKNOWN_SCENARIO_SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Two tabs" })).toBeInTheDocument();
  });

  it("opens the normal entry with no sentence when there is no link", () => {
    render(<ShareGate hash="" />);
    expect(screen.getByRole("button", { name: "Two tabs" })).toBeInTheDocument();
    expect(screen.queryByText(BAD_LINK_SENTENCE)).toBeNull();
  });
});
