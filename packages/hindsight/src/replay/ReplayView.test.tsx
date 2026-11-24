// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import { buildLedger } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";

afterEach(cleanup);

describe("ReplayView", () => {
  it("renders one labelled group per participant, with text labels", () => {
    const ids = ["constructor", "b", "c"];
    const ledger = buildLedger([{ kind: "learned", participant: "b", factId: "f", simTime: 2 }]);
    const { container } = render(<ReplayView ledger={ledger} scenario={buildParticipantsFixture(ids)} />);
    const rows = within(screen.getByRole("group", { name: "Replay: Participants fixture" })).getAllByRole("group");
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.getAttribute("tabindex")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.getByText("Participant 1")).toBeTruthy();
    expect(rows[1]!.getAttribute("aria-label")).toBe("Participant 2: 1 marks");
  });
});
