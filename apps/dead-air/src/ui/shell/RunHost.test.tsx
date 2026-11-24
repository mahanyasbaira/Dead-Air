// @vitest-environment jsdom
/**
 * RunHost (consoles 11.2). Drives the real components through roles and visible
 * text. Transports are a counting fake (which follows the Transport interface)
 * and the real scripted transport. Storage is a fake that records `setItem` and
 * `removeItem` and can throw. Airtime is a manual scheduler, so no real timers
 * run. Requirements 1.1, 1.2, 1.3, 6.1.
 */
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAudioBus, type AudioBus, type Synth } from "../fx/audio";
import type { TransportEvent, TransportFrame, TransportMode, TransportStatus } from "../../transport/types";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { RunHost, type RunHostProps } from "./RunHost";
import { ROLE_KEY, UNSAVED_LINE } from "./RunHost.model";
import { FIXED_SENTENCE } from "./DecisionPrompt";
import { STORAGE_KEY, restore, serialize } from "./persist";
import type { ConsoleLogEntry } from "./types";

afterEach(cleanup);

const bytes = (s: string) => new TextEncoder().encode(s);
const received = (text: string, simTime = 1): TransportEvent => ({
  kind: "received", simTime, sender: "field", recipient: "dispatch", payload: bytes(text),
});

function makeFake() {
  const listeners = new Set<(e: TransportEvent) => void>();
  const statusListeners = new Set<(s: TransportStatus) => void>();
  const f = {
    onStatus(l: (s: TransportStatus) => void) {
      statusListeners.add(l);
      return () => void statusListeners.delete(l);
    },
    status(s: TransportStatus) {
      act(() => [...statusListeners].forEach((l) => l(s)));
    },
    subscribes: 0,
    unsubscribes: 0,
    closes: 0,
    sent: [] as TransportFrame[],
    mode: "idle" as TransportMode,
    send(frame: TransportFrame) {
      f.sent.push(frame);
    },
    on(l: (e: TransportEvent) => void) {
      f.subscribes++;
      listeners.add(l);
      return () => {
        f.unsubscribes++;
        listeners.delete(l);
      };
    },
    close() {
      f.closes++;
    },
    emit(e: TransportEvent) {
      act(() => [...listeners].forEach((l) => l(e)));
    },
    active: () => f.subscribes - f.unsubscribes,
  };
  return f;
}
type Fake = ReturnType<typeof makeFake>;

function makeStorage(initial?: string, role?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  if (role !== undefined) data.set(ROLE_KEY, role);
  const s = {
    throwOnSet: false,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      if (s.throwOnSet) throw new Error("full");
      data.set(k, v);
    }),
    removeItem: vi.fn((k: string) => void data.delete(k)),
    stored: () => data.get(STORAGE_KEY) ?? null,
  };
  return s;
}

function manualScheduler() {
  const q: { fn: () => void; cancelled: boolean }[] = [];
  return {
    schedule: (fn: () => void) => {
      const t = { fn, cancelled: false };
      q.push(t);
      return () => {
        t.cancelled = true;
      };
    },
    fire: () => act(() => q.splice(0).filter((t) => !t.cancelled).forEach((t) => t.fn())),
  };
}

function setup(extra: Partial<RunHostProps> = {}, strict = false) {
  const fakes: Fake[] = [];
  const storage = (extra.storage as ReturnType<typeof makeStorage> | undefined) ?? makeStorage();
  const bars: AudioBus[] = [];
  const synth: Synth & { on: number; closes: number } = {
    on: 0,
    closes: 0,
    carrierOn() { this.on++; },
    carrierOff() {},
    chirp() {},
    close() { this.closes++; },
  };
  const ui = (
    <RunHost
      storage={storage}
      createScripted={() => {
        const f = makeFake();
        fakes.push(f);
        return f;
      }}
      createBus={(o) => {
        const b = createAudioBus(o);
        bars.push(b);
        return b;
      }}
      createSynth={() => synth}
      {...extra}
    />
  );
  const view = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
  const user = userEvent.setup();
  return { fakes, storage, bars, synth, user, ...view };
}

async function toConsole(user: ReturnType<typeof userEvent.setup>, role = /Dispatch/) {
  await user.click(screen.getByRole("button", { name: "Solo" }));
  await user.click(screen.getByRole("button", { name: role }));
}

const wireLog = (s: ReturnType<typeof makeStorage>) => {
  const r = restore(s.stored());
  if (!r.ok) throw new Error(r.reason);
  return r.run.log;
};

describe("RunHost flow", () => {
  it("reaches the first beat in two clicks in Solo", async () => {
    const { user } = setup();
    await toConsole(user);
    expect(screen.getByRole("heading", { name: "What you know" })).toBeVisible();
    expect(screen.getByText(/Drill begins/)).toBeVisible();
    expect(screen.getByText(/what do you note in the pretend log/i)).toBeVisible();
  });

  it("puts the second role at the Tower", async () => {
    const { user } = setup();
    await toConsole(user, /Field Lead/);
    expect(screen.getByRole("heading", { name: "Tower" })).toBeVisible();
  });
});

describe("RunHost events", () => {
  it("appends one entry per received outcome, unchanged, and saves it", async () => {
    const { user, fakes, storage } = setup();
    await toConsole(user);
    const before = wireLog(storage).length;
    fakes[0].emit(received("Hello"));
    expect(screen.getByText("Hello")).toBeVisible();
    const log = wireLog(storage);
    expect(log.length).toBe(before + 1);
    const last = log[log.length - 1] as Extract<ConsoleLogEntry, { kind: "wire" }>;
    expect(last.event.kind).toBe("received");
    expect(new TextDecoder().decode(last.event.payload)).toBe("Hello");
  });

  it("shows a garbled message and a collision as lines", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    fakes[0].emit({ kind: "garbled", simTime: 1, sender: "field", recipient: "dispatch" });
    fakes[0].emit({ kind: "collision", simTime: 2, sender: "field", recipient: "dispatch" });
    expect(screen.getByText("A message arrived but could not be read.")).toBeVisible();
    expect(screen.getByText("Collision: both messages were lost.")).toBeVisible();
  });

  it("ignores a repeated scripted outcome in Solo and keeps repeats on a real line", async () => {
    const solo = setup();
    await toConsole(solo.user);
    solo.fakes[0].emit(received("Hi"));
    solo.fakes[0].emit(received("Hi"));
    expect(wireLog(solo.storage).filter((e) => e.kind === "wire")).toHaveLength(1);
    cleanup();
    const tabs = setup({ createLoopback: () => makeFakeInto(tabsFakes) });
    await tabs.user.click(screen.getByRole("button", { name: "Two tabs" }));
    await tabs.user.click(screen.getByRole("button", { name: /Dispatch/ }));
    tabsFakes[0].emit(received("Hi"));
    tabsFakes[0].emit(received("Hi"));
    expect(wireLog(tabs.storage).filter((e) => e.kind === "wire")).toHaveLength(2);
  });
});
const tabsFakes: Fake[] = [];
function makeFakeInto(list: Fake[]): Fake {
  const f = makeFake();
  list.length = 0;
  list.push(f);
  return f;
}

describe("RunHost carrier", () => {
  it("shows sending after a send and returns to idle with no other interaction", async () => {
    const sched = manualScheduler();
    const { user } = setup({ createScripted: undefined, schedule: sched.schedule });
    await toConsole(user);
    expect(screen.getByText("Carrier idle.")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Wind rising");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("Carrier sending.")).toBeVisible();
    sched.fire();
    expect(screen.getByText("Carrier idle.")).toBeVisible();
  });

  it("sends exactly once through the transport", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Ping");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(fakes[0].sent).toHaveLength(1);
    expect(fakes[0].sent[0]).toMatchObject({ sender: "dispatch", recipient: "field", sendTime: 0 });
  });
});

describe("RunHost send clock", () => {
  it("does not stamp a second send inside the airtime of the first", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    for (const text of ["One", "Two"]) {
      await user.type(screen.getByRole("textbox", { name: "Message" }), text);
      await user.click(screen.getByRole("button", { name: "Send" }));
    }
    const [a, b] = fakes[0].sent;
    expect(b.sendTime).toBeGreaterThanOrEqual(a.sendTime + 4);
  });
});

describe("RunHost cleanup", () => {
  it("unsubscribes once and closes once on unmount", async () => {
    const { user, fakes, unmount } = setup();
    await toConsole(user);
    unmount();
    await act(async () => {});
    expect(fakes[0].unsubscribes).toBe(1);
    expect(fakes[0].closes).toBe(1);
  });

  it("closes the old transport on Run again and starts a fresh log", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    fakes[0].emit(received("Old news"));
    await user.click(screen.getByRole("button", { name: "See the replay" }));
    await user.click(screen.getByRole("button", { name: "Run again" }));
    expect(fakes[0].closes).toBe(1);
    expect(fakes[0].active()).toBe(0);
    await toConsole(user);
    expect(screen.queryByText("Old news")).toBeNull();
    expect(screen.getByText("Nothing has arrived yet.")).toBeVisible();
    expect(fakes[1].active()).toBe(1);
  });

  it("closes the transport when going back to Entry", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    await user.click(screen.getByRole("button", { name: "Back to the start" }));
    expect(fakes[0].closes).toBe(1);
    expect(screen.getByRole("button", { name: "Solo" })).toBeVisible();
  });
});

describe("RunHost under StrictMode", () => {
  it("keeps one subscription, shows an event once, and closes once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user, fakes, storage, unmount } = setup({}, true);
    await toConsole(user);
    expect(fakes).toHaveLength(1);
    expect(fakes[0].active()).toBe(1);
    fakes[0].emit(received("Once only"));
    expect(screen.getAllByText("Once only")).toHaveLength(1);
    expect(wireLog(storage).filter((e) => e.kind === "wire")).toHaveLength(1);
    unmount();
    await act(async () => {});
    expect(fakes[0].active()).toBe(0);
    expect(fakes[0].closes).toBe(1);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("RunHost restore", () => {
  const saved = (log: ConsoleLogEntry[]) =>
    serialize({ version: 1, scenarioId: staticOnChannel9.id, seed: 9, mode: "solo", log });

  it("resumes a valid saved run at the console with its messages and decision", () => {
    const log: ConsoleLogEntry[] = [
      { kind: "wire", event: received("Saved hello", 1) },
      { kind: "decision", decision: { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 1 } },
    ];
    setup({ storage: makeStorage(saved(log), "dispatch") });
    expect(screen.getByText("Saved hello")).toBeVisible();
    expect(screen.getByText(/You chose: Suggest holding the acoustic set/)).toBeVisible();
    expect(screen.getByText("Resumed your saved run.")).toBeVisible();
  });

  const bad: [string, string, RegExp][] = [
    ["bad JSON", "{not json", /not readable data/],
    ["unknown version", JSON.stringify({ version: 2 }), /different version/],
    ["unknown scenario", JSON.stringify({ version: 1, scenarioId: "nope", seed: 1, mode: "solo", log: [] }), /does not have/],
    [
      "bad entry",
      JSON.stringify({ version: 1, scenarioId: staticOnChannel9.id, seed: 1, mode: "solo", log: [{ kind: "x" }] }),
      /not valid/,
    ],
  ];
  it.each(bad)("keeps a saved run with %s, says why, and never overwrites it", async (_n, raw, why) => {
    const storage = makeStorage(raw, "dispatch");
    const { user, fakes } = setup({ storage });
    expect(screen.getByText(why, { exact: false })).toBeVisible();
    expect(screen.getByText(/The saved run has been kept\./)).toBeVisible();
    await toConsole(user);
    fakes[0].emit(received("Fresh"));
    await user.click(screen.getByRole("button", { name: /Suggest holding/ }));
    expect(screen.getByText("Fresh")).toBeVisible();
    expect(screen.getByText(/will not be saved while that saved run is kept/)).toBeVisible();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.stored()).toBe(raw);
  });

  it("discards the saved run only when asked, then saves again", async () => {
    const storage = makeStorage("{not json");
    const { user, fakes } = setup({ storage });
    await toConsole(user);
    await user.click(screen.getByRole("button", { name: "Discard the saved run" }));
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    fakes[0].emit(received("After discard"));
    expect(restore(storage.stored()).ok).toBe(true);
    expect(screen.getByText("The saved run was discarded. This run will be saved.")).toBeVisible();
  });

  it("keeps a saved two-device run and waits for the microphone", async () => {
    const log: ConsoleLogEntry[] = [{ kind: "wire", event: received("Over the air", 1) }];
    const raw = serialize({ version: 1, scenarioId: staticOnChannel9.id, seed: 9, mode: "acoustic", log });
    const storage = makeStorage(raw, "dispatch");
    const acoustic = makeFake();
    const { user } = setup({
      storage,
      createAcoustic: () => acoustic,
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }) },
      isSecureContext: true,
    });
    expect(screen.getByText(/Choose Two devices by sound to continue it/)).toBeVisible();
    expect(storage.setItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    expect(await screen.findByText("Over the air")).toBeVisible();
  });

  it("carries on in memory with one line when storage throws on write", async () => {
    const storage = makeStorage();
    storage.throwOnSet = true;
    const { user, fakes } = setup({ storage });
    await toConsole(user);
    expect(screen.getByText(UNSAVED_LINE)).toBeVisible();
    fakes[0].emit(received("Still here"));
    expect(screen.getByText("Still here")).toBeVisible();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

describe("RunHost decisions, replay and sound", () => {
  it("records a decision and locks it once the next beat begins", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    await user.click(screen.getByRole("button", { name: /Suggest holding/ }));
    expect(screen.getByText(/You chose: Suggest holding/)).toBeVisible();
    fakes[0].emit(received("Later", 3));
    expect(screen.getByRole("button", { name: /Suggest holding/ })).toBeDisabled();
    expect(screen.getByText(FIXED_SENTENCE)).toBeVisible();
  });

  it("ends with a labelled replay that has a row for each role and no score", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    fakes[0].emit(received("Wind note", 6));
    expect(screen.getByText("The drill has reached its last beat.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "See the replay" }));
    expect(screen.getByRole("heading", { name: "The drill is over" })).toBeVisible();
    const list = screen.getByRole("group", { name: /^Replay: / });
    const rows = within(list).getAllByRole("group");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("Dispatch (fictional)"),
      expect.stringContaining("Field Lead (fictional)"),
    ]);
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it("toggles mute and mutes the bus", async () => {
    const { user, bars } = setup();
    const mute = screen.getByRole("button", { name: "Mute" });
    await user.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(bars[0].muted).toBe(true);
    await toConsole(user);
    expect(screen.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
  });

  it("completes a Solo run from the keyboard alone", async () => {
    const { user, fakes } = setup();
    const tabTo = async (name: RegExp | string) => {
      for (let i = 0; i < 30; i++) {
        await user.tab();
        const label = (document.activeElement as HTMLElement | null)?.textContent ?? "";
        if (typeof name === "string" ? label === name : name.test(label)) return;
      }
      throw new Error(`no focus on ${String(name)}`);
    };
    await tabTo("Solo");
    await user.keyboard("{Enter}");
    await tabTo(/Dispatch/);
    await user.keyboard("{Enter}");
    await user.keyboard("1");
    expect(screen.getByText(/You chose: Suggest holding/)).toBeVisible();
    fakes[0].emit(received("Done", 6));
    await tabTo("See the replay");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "The drill is over" })).toBeVisible();
  });
});

describe("RunHost sound lifetime", () => {
  it("closes the audio bus once on final unmount, and keeps it through Run again", async () => {
    const { user, synth, unmount } = setup();
    await toConsole(user);
    await user.click(screen.getByRole("button", { name: "See the replay" }));
    await user.click(screen.getByRole("button", { name: "Run again" }));
    await act(async () => {});
    expect(synth.closes).toBe(0);
    unmount();
    await act(async () => {});
    expect(synth.closes).toBe(1);
  });

  it("under StrictMode does not close at the simulated unmount, only at the real one", async () => {
    const { user, synth, unmount } = setup({}, true);
    await toConsole(user);
    await act(async () => {});
    expect(synth.closes).toBe(0);
    unmount();
    await act(async () => {});
    expect(synth.closes).toBe(1);
  });
});

describe("RunHost link status", () => {
  it("says the other tab closed and keeps the run usable", async () => {
    const fakes: Fake[] = [];
    const { user } = setup({ createLoopback: () => makeFakeInto(fakes) });
    await user.click(screen.getByRole("button", { name: "Two tabs" }));
    await user.click(screen.getByRole("button", { name: /Dispatch/ }));
    fakes[0].status({ kind: "ended", reason: "closed" });
    expect(screen.getByText("The link to the other tab closed.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Suggest holding/ }));
    expect(screen.getByText(/You chose: Suggest holding/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "See the replay" }));
    expect(screen.getByRole("heading", { name: /The drill/ })).toBeVisible();
  });

  it("says the microphone stopped on a two-device run", async () => {
    const acoustic = makeFake();
    const { user } = setup({
      createAcoustic: () => acoustic,
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }) },
      isSecureContext: true,
    });
    await user.click(screen.getByRole("button", { name: "Two devices by sound" }));
    await user.click(await screen.findByRole("button", { name: /Dispatch/ }));
    acoustic.status({ kind: "ended", reason: "microphone-ended" });
    expect(screen.getByText("The microphone stopped, so nothing more can be heard.")).toBeVisible();
    expect(screen.getByRole("button", { name: "See the replay" })).toBeEnabled();
  });

  it("stays quiet about a transport it closed itself", async () => {
    const { user, fakes } = setup();
    await toConsole(user);
    await user.click(screen.getByRole("button", { name: "Back to the start" }));
    fakes[0].status({ kind: "ended", reason: "closed" });
    expect(screen.queryByText("The practice line closed.")).toBeNull();
  });
});

describe("RunHost send records", () => {
  it("logs the Solo partner's scheduled send when the role is chosen", async () => {
    const { user, storage } = setup();
    await toConsole(user, /Field Lead/);
    const sends = wireLog(storage).flatMap((e) => (e.kind === "send" ? [e.send] : []));
    expect(sends).toEqual([
      expect.objectContaining({ id: "dispatch-s0", sender: "dispatch", recipient: "field", sendTime: 2 }),
    ]);
  });

  it("gives each own send a stable id on the frame and in the log", async () => {
    const { user, fakes, storage } = setup();
    await toConsole(user);
    for (const text of ["One", "Two"]) {
      await user.type(screen.getByRole("textbox", { name: "Message" }), text);
      await user.click(screen.getByRole("button", { name: "Send" }));
    }
    expect(fakes[0].sent.map((f) => f.id)).toEqual(["dispatch-0", "dispatch-1"]);
    const own = wireLog(storage).flatMap((e) => (e.kind === "send" && e.send.sender === "dispatch" ? [e.send] : []));
    expect(own.map((s) => [s.id, s.bytes])).toEqual([["dispatch-0", 3], ["dispatch-1", 3]]);
  });

  it("continues the id count when a saved run resumes", () => {
    const log: ConsoleLogEntry[] = [
      { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 0, bytes: 2 } },
    ];
    const raw = serialize({ version: 1, scenarioId: staticOnChannel9.id, seed: 9, mode: "solo", log });
    const { fakes } = setup({ storage: makeStorage(raw, "dispatch") });
    return (async () => {
      const user = userEvent.setup();
      await user.type(screen.getByRole("textbox", { name: "Message" }), "Hi");
      await user.click(screen.getByRole("button", { name: "Send" }));
      expect(fakes[0].sent[0].id).toBe("dispatch-1");
    })();
  });
});

describe("RunHost replay screen", () => {
  it("logs no console error or warning on the replay screen", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { user, fakes } = setup({}, true);
    await toConsole(user);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    fakes[0].emit(received("Back", 3));
    await user.click(screen.getByRole("button", { name: "See the replay" }));
    expect(screen.getByRole("heading", { name: /The drill/ })).toBeVisible();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });
});
