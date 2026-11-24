// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import { buildLedger } from "../ledger/ledger";
import { formatLimit } from "./participants";
import { ReplayView } from "./ReplayView";
import type { ReplayParticipant } from "./types";
afterEach(cleanup);
const scenario = buildParticipantsFixture(["a", "b"]);
describe("ReplayView signals, notice and style", () => {
  it("lists a lost message as did not arrive in the text timeline", () => {
    const ledger = buildLedger([
      { kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2 },
      { kind: "sent", messageId: "m2", sender: "a", recipient: "b", simTime: 4 },
      { kind: "outcome", messageId: "m2", outcome: "received", simTime: 9 },
    ]);
    render(<ReplayView ledger={ledger} scenario={scenario} />);
    expect(screen.getByText(/m1, Participant 1 to Participant 2: sent at 2, did not arrive\./)).toBeTruthy();
    expect(screen.getByText(/m2, Participant 1 to Participant 2: sent at 4, arrived 9\./)).toBeTruthy();
  });

  it("shows the limit notice once for an arrivals-only participant, then the caller's note", () => {
    const participants: ReplayParticipant[] = [
      { id: "a", label: "Local" },
      { id: "b", label: "Remote", history: "arrivals-only", limitNote: "Their sends happen elsewhere." },
    ];
    const ledger = buildLedger([
      { kind: "arrival", messageId: "x1", sender: "b", recipient: "a", outcome: "received", simTime: 5 },
    ]);
    const { container } = render(<ReplayView ledger={ledger} scenario={scenario} participants={participants} />);
    const notice = `${formatLimit(["Remote"])} Their sends happen elsewhere.`;
    expect(screen.getAllByText(notice)).toHaveLength(1);
    expect(container.querySelector("figcaption")?.textContent).toContain(notice);
  });

  it("has no notice when every participant is complete", () => {
    const ledger = buildLedger([
      { kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2 },
      { kind: "outcome", messageId: "m1", outcome: "received", simTime: 4 },
    ]);
    const { container } = render(<ReplayView ledger={ledger} scenario={scenario} />);
    expect(container.querySelector("figcaption")?.textContent ?? "").not.toContain("are not in this log");
  });

  it("draws selectable text, formats time labels and keeps the text timeline closed", () => {
    const ledger = buildLedger([{ kind: "learned", participant: "a", factId: "f", simTime: 10 }]);
    const { container } = render(
      <ReplayView ledger={ledger} scenario={scenario} formatTime={(t) => `T${t}`} />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.querySelectorAll("text").length).toBeGreaterThan(0);
    expect(svg.getAttribute("viewBox")).toBe("0 0 840 560");
    expect(screen.getAllByText("T10").length).toBeGreaterThan(0);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Text timeline");
  });

  it("has an inline style with a print block, the reduced-motion rule and no forbidden effects", () => {
    const ledger = buildLedger([{ kind: "learned", participant: "a", factId: "f", simTime: 1 }]);
    const { container } = render(<ReplayView ledger={ledger} scenario={scenario} />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@media print");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("120ms");
    for (const word of ["animation", "gradient", "box-shadow", "filter"]) expect(css).not.toContain(word);
  });
});
