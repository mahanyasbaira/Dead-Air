// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";

afterEach(cleanup);

describe("ReplayView console output", () => {
  it("logs no React warning for a ledger with sends, outcomes, learned facts and decisions", () => {
    const base = buildParticipantsFixture(["a", "b"]);
    const scenario: Scenario = {
      ...base,
      events: [
        ...base.events,
        { id: "decision-a", type: "decision", simTime: 3, audience: "a", actor: "a", title: "Wait", body: "" },
      ],
    };
    const ledger = buildLedger([
      { kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2 },
      { kind: "outcome", messageId: "m1", outcome: "received", simTime: 5 },
      { kind: "sent", messageId: "m2", sender: "b", recipient: "a", simTime: 6 },
      { kind: "learned", participant: "a", factId: "f", simTime: 1 },
    ]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(
        <StrictMode>
          <ReplayView ledger={ledger} scenario={scenario} />
        </StrictMode>,
      );
      expect(spy).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });
});
