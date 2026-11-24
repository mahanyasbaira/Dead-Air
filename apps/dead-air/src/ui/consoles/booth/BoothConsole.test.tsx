// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoothConsole, type BoothConsoleProps } from "./BoothConsole";
import { CarrierLamp } from "./CarrierLamp";
import { COLLISION_LINE, GARBLED_LINE, type BoothEvent } from "./Teleprinter";
import { GARBLED_MARKER } from "./garbled";
import { carrierText } from "../../shell/StatusLine";
import type { Transport, TransportMode } from "../../shell/types";

const enc = new TextEncoder();

function fakeTransport(mode: TransportMode = "idle") {
  const send = vi.fn();
  const t: Transport = { send, on: () => () => {}, mode, close() {} };
  return { t, send };
}

function setup(events: BoothEvent[] = [], extra: Partial<BoothConsoleProps> = {}, mode: TransportMode = "idle") {
  const { t, send } = fakeTransport(mode);
  render(
    <BoothConsole events={events} transport={t} mode="solo" self="booth" partner="tower" now={() => 7} {...extra} />,
  );
  return { send, user: userEvent.setup() };
}

const received = (text: string, undecodable?: number[]): BoothEvent => ({
  kind: "received",
  simTime: 1,
  sender: "tower",
  recipient: "booth",
  payload: enc.encode(text),
  ...(undecodable ? { undecodable } : {}),
});

describe("Teleprinter", () => {
  it("shows accented text and emoji readable, with airtime", () => {
    setup([received("Café"), received("Go 🚀")]);
    expect(screen.getByText("Café")).toBeInTheDocument();
    expect(screen.getByText("Go 🚀")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Teleprinter" })).getAllByText(/s on air\./).length).toBe(2);
  });

  it("marks a damaged byte and says how many could not be read", () => {
    setup([received("abc", [1])]);
    expect(screen.getByText(GARBLED_MARKER)).toBeInTheDocument();
    expect(screen.getByText(/1 could not be read/)).toBeInTheDocument();
  });

  it("shows a could-not-be-read line for a garbled event without a payload", () => {
    setup([{ kind: "garbled", simTime: 1, sender: "tower", recipient: "booth" }]);
    expect(screen.getByText(GARBLED_LINE)).toBeInTheDocument();
  });

  it("shows a collision line of its own", () => {
    setup([{ kind: "collision", simTime: 1, sender: "tower", recipient: "booth" }]);
    expect(screen.getByText(COLLISION_LINE)).toBeInTheDocument();
  });
});

describe("CarrierLamp", () => {
  it.each(["IDLE", "SENDING", "RECEIVING", "COLLISION"] as const)("shows text for %s", (s) => {
    render(<CarrierLamp state={s} />);
    expect(screen.getByText(carrierText(s))).toBeInTheDocument();
  });

  it("derives sending from the transport mode and collision from the last event", () => {
    setup([], {}, "transmitting");
    expect(screen.getByText(carrierText("SENDING"))).toBeInTheDocument();
  });
});

describe("SignalIndicator in the booth", () => {
  it("is unavailable in solo mode", () => {
    setup();
    expect(screen.getByText(/not measured in this mode/)).toBeInTheDocument();
  });
});

describe("Composer", () => {
  it("updates the budget as multi-byte text is typed", async () => {
    const { user } = setup();
    expect(screen.getByText(/64 bytes left/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Message"), "é🚀");
    expect(screen.getByText(/58 bytes left/)).toBeInTheDocument();
  });

  it("blocks an over-limit message by click and by Enter, and says why", async () => {
    const { user, send } = setup();
    const input = screen.getByLabelText("Message");
    await user.click(input);
    await user.paste("x".repeat(66));
    expect(screen.getByText(/Over the limit by 2 bytes/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.type(input, "{Enter}");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a valid message once, at most 64 bytes, with the frame ends and time", async () => {
    const { user, send } = setup();
    await user.type(screen.getByLabelText("Message"), "Café{Enter}");
    expect(send).toHaveBeenCalledTimes(1);
    const frame = send.mock.calls[0][0];
    expect(frame.payload.length).toBeLessThanOrEqual(64);
    expect(new TextDecoder().decode(frame.payload)).toBe("Café");
    expect(frame).toMatchObject({ sender: "booth", recipient: "tower", sendTime: 7 });
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("sends by clicking the button too", async () => {
    const { user, send } = setup();
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
