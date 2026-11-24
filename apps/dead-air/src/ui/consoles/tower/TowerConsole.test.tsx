// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TowerConsole } from "./TowerConsole";
import type { Sound } from "../../fx/audio";
import type { TransportEvent } from "../../shell/types";

const enc = new TextEncoder();
const received = (text: string, t = 0): TransportEvent => ({
  kind: "received",
  simTime: t,
  sender: "booth",
  recipient: "tower",
  payload: enc.encode(text),
});
const garbled = (t = 0): TransportEvent => ({
  kind: "garbled",
  simTime: t,
  sender: "booth",
  recipient: "tower",
});

function setup(events: readonly TransportEvent[] = []) {
  const onSend = vi.fn<(text: string, payload: Uint8Array) => void>();
  const onCue = vi.fn<(sound: Sound) => void>();
  const ui = (ev: readonly TransportEvent[]) => <TowerConsole events={ev} onSend={onSend} onCue={onCue} />;
  const view = render(ui(events));
  return { onSend, onCue, rerender: (ev: readonly TransportEvent[]) => view.rerender(ui(ev)) };
}

describe("TowerConsole chrome", () => {
  it("has exactly three named keys, each operable by keyboard", async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    const keys = screen.getAllByRole("button");
    expect(keys.map((k) => k.textContent)).toEqual(["UpArrow up", "DownArrow down", "SendEnter"]);
    expect(screen.getByRole("button", { name: "Up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Down" })).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send" });
    send.focus();
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("shows the canned codes and a free-text field; Up and Down change the selection", async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    const list = screen.getByRole("listbox", { name: "Canned codes" });
    expect(within(list).getAllByRole("option").length).toBeGreaterThan(1);
    expect(screen.getByRole("textbox", { name: "Free text" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Down" }));
    expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend.mock.calls[0][0]).toBe("Say again.");
  });

  it("blocks an over-limit free-text send and says why", async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    await user.type(screen.getByRole("textbox", { name: "Free text" }), "x".repeat(65));
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/Not sent: 1 byte over the 64-byte limit/)).toBeInTheDocument();
  });

  it("sends free text within the limit", async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    await user.type(screen.getByRole("textbox", { name: "Free text" }), "café 🙂{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe("café 🙂");
  });
});

describe("TowerConsole inbound alert and history", () => {
  it("one arrival: one cue, lamp lit, one text line, one history item", () => {
    const { onCue, rerender } = setup();
    expect(screen.getByText("Lamp: off.")).toBeInTheDocument();
    rerender([received("hello")]);
    expect(onCue).toHaveBeenCalledTimes(1);
    expect(onCue).toHaveBeenCalledWith({ kind: "chirp", direction: "received" });
    expect(screen.getByText("Lamp: lit, new message.")).toBeInTheDocument();
    expect(screen.getAllByText(/Chirp: message received\. New message from booth\./)).toHaveLength(1);
    const history = screen.getByRole("list", { name: /received messages/i });
    expect(within(history).getAllByRole("listitem")).toHaveLength(1);
    expect(within(history).getByText("hello")).toBeInTheDocument();
  });

  it("the lamp clears when the reader presses a key", async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    rerender([received("a")]);
    await user.click(screen.getByRole("button", { name: "Down" }));
    expect(screen.getByText("Lamp: off.")).toBeInTheDocument();
  });

  it("nine separate arrivals fire nine cues and keep the last eight", () => {
    const { onCue, rerender } = setup();
    const all: TransportEvent[] = [];
    for (let i = 1; i <= 9; i++) {
      all.push(received(`m${i}`, i));
      rerender([...all]);
    }
    expect(onCue).toHaveBeenCalledTimes(9);
    const items = within(screen.getByRole("list", { name: /received messages/i })).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(items.map((li) => li.textContent?.replace(/^From booth/, ""))).toEqual(
      ["m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"],
    );
  });

  it("a garbled arrival shows the could-not-be-read line and stays in history", () => {
    const { onCue, rerender } = setup();
    rerender([garbled()]);
    expect(onCue).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/could not be read/i).length).toBeGreaterThan(0);
    const items = within(screen.getByRole("list", { name: /received messages/i })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Message could not be read.");
  });

  it("a collision lights the lamp as a loss and adds no history", () => {
    const { onCue, rerender } = setup();
    rerender([{ kind: "collision", simTime: 1, sender: "booth", recipient: "tower" }]);
    expect(onCue).not.toHaveBeenCalled();
    expect(screen.getByText("Lamp: lit, something was lost.")).toBeInTheDocument();
    expect(screen.getByText("Nothing received.")).toBeInTheDocument();
  });

  it("does not cue for messages already present at mount", () => {
    const { onCue } = setup([received("old")]);
    expect(onCue).not.toHaveBeenCalled();
    expect(screen.getByText("Lamp: off.")).toBeInTheDocument();
  });

  it("renders accented text and emoji readable", () => {
    setup([received("café 🙂 señal")]);
    expect(screen.getAllByText("café 🙂 señal").length).toBeGreaterThan(0);
  });

  it("the history is a focusable region", () => {
    setup([received("a")]);
    expect(screen.getByRole("region", { name: "Message history" })).toHaveAttribute("tabindex", "0");
  });
});
