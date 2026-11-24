// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalIndicator } from "./SignalIndicator";

describe("SignalIndicator", () => {
  it("shows the unavailable text and draws no bar in solo", () => {
    render(<SignalIndicator mode="solo" />);
    expect(screen.getByText("Signal level: not measured in this mode.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the unavailable text and no bar in loopback, even with a measurement", () => {
    render(<SignalIndicator mode="loopback" lastMeasurement={{ airtimeMs: 420, rms: 0.1, dbfs: -18, peak: 0.3 }} />);
    expect(screen.getByText("Signal level: not measured in this mode.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the no-message text in acoustic mode before a burst", () => {
    render(<SignalIndicator mode="acoustic" />);
    expect(screen.getByText("Signal level: no message heard yet.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("names the graphic with the measured value and shows the same text", () => {
    render(<SignalIndicator mode="acoustic" lastMeasurement={{ airtimeMs: 420, rms: 0.125, dbfs: -18, peak: 0.3 }} />);
    const text = "Last message: \u221218 dBFS, 420 ms.";
    expect(screen.getByRole("img", { name: text })).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
  });
});
