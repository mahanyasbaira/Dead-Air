// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";
import { summarise } from "./summary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = buildParticipantsFixture(["a", "b"]);
const events: LedgerEvent[] = [
  { kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 5 },
];
const show = (discussionPrompts: string[]) => {
  const scenario: Scenario = { ...base, discussionPrompts };
  const view = render(<ReplayView ledger={buildLedger(events)} scenario={scenario} formatTime={(t) => `T${t}`} />);
  return { scenario, view };
};

describe("ReplayView prompts and summary", () => {
  it("shows three prompts and not a fourth", () => {
    show(["First?", "Second?", "Third?", "Fourth?"]);
    expect(screen.getByText("First?")).toBeTruthy();
    expect(screen.getByText("Third?")).toBeTruthy();
    expect(screen.queryByText("Fourth?")).toBeNull();
  });

  it("shows fewer when the scenario has fewer and invents none", () => {
    show(["Only one?"]);
    expect(screen.getAllByRole("listitem").filter((li) => li.textContent === "Only one?")).toHaveLength(1);
    cleanup();
    show([]);
    expect(screen.queryByText("Discussion prompts")).toBeNull();
  });

  it("copies the summary paragraph to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { scenario } = show(["One?"]);
    const paragraph = summarise({ ledger: buildLedger(events), scenario }, (t) => `T${t}`);
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(paragraph));
    expect(screen.queryByRole("textbox", { name: "Summary text" })).toBeNull();
  });

  it("shows a read-only field with the text when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    const { scenario } = show(["One?"]);
    const paragraph = summarise({ ledger: buildLedger(events), scenario }, (t) => `T${t}`);
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
    const field = (await screen.findByRole("textbox", { name: "Summary text" })) as HTMLTextAreaElement;
    expect(field.value).toBe(paragraph);
    expect(field.readOnly).toBe(true);
  });

  it("hides both sections when switched off", () => {
    const scenario: Scenario = { ...base, discussionPrompts: ["One?"] };
    render(<ReplayView ledger={buildLedger(events)} scenario={scenario} sections={{ prompts: false, summary: false }} />);
    expect(screen.queryByText("One?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy summary" })).toBeNull();
  });
});
