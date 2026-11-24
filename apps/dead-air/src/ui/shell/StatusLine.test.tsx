// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLine, carrierText, HISTORY, type StatusMessage } from "./StatusLine";
import { statusText } from "../fx/audio/status-twin";
import type { CarrierState } from "./types";

const STATES: CarrierState[] = ["IDLE", "SENDING", "RECEIVING", "COLLISION"];

describe("StatusLine", () => {
  it("renders exactly one polite status region", () => {
    render(<StatusLine messages={[{ key: 1, text: "Carrier idle." }]} />);
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0].getAttribute("aria-live")).toBe("polite");
  });

  it("renders a sound text and a carrier text", () => {
    const messages: StatusMessage[] = [
      { key: 1, text: statusText({ kind: "chirp", direction: "received" }) },
      { key: 2, text: carrierText("COLLISION"), loss: true },
    ];
    render(<StatusLine messages={messages} />);
    expect(screen.getByText("Chirp: message received.")).toBeTruthy();
    expect(screen.getByText("Collision: both messages lost.")).toBeTruthy();
  });

  it("updates on new props and keeps a short history", () => {
    const { rerender } = render(<StatusLine messages={[{ key: 1, text: "Carrier idle." }]} />);
    const next: StatusMessage[] = [1, 2, 3, 4].map((k) => ({ key: k, text: `Line ${k}.` }));
    rerender(<StatusLine messages={next} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByText("Line 1.")).toBeNull();
    expect(screen.getByText("Line 4.")).toBeTruthy();
    expect(HISTORY).toBe(3);
  });

  it("shows a repeated text as a separate line", () => {
    render(
      <StatusLine
        messages={[
          { key: 1, text: "Carrier tone on." },
          { key: 2, text: "Carrier tone on." },
        ]}
      />,
    );
    expect(screen.getAllByText("Carrier tone on.")).toHaveLength(2);
  });
});

describe("carrierText", () => {
  it("gives each state distinct text", () => {
    const texts = STATES.map(carrierText);
    expect(new Set(texts).size).toBe(STATES.length);
  });

  it("has no exclamation marks and uses loss wording only for collision", () => {
    for (const s of STATES) {
      const t = carrierText(s);
      expect(t).not.toContain("!");
      expect(/lost/i.test(t)).toBe(s === "COLLISION");
    }
  });
});
