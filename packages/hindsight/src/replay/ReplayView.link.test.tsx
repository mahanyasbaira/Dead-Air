// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { ReplayView } from "./ReplayView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scenario = buildParticipantsFixture(["a", "b"]);
const events: LedgerEvent[] = [
  { kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2 },
  { kind: "outcome", messageId: "m1", outcome: "received", simTime: 5 },
];
const URL_TEXT = "https://example.test/base#s=abc123";
const show = (shareUrl?: string) =>
  render(<ReplayView ledger={buildLedger(events)} scenario={scenario} {...(shareUrl === undefined ? {} : { shareUrl })} />);

describe("ReplayView Copy link", () => {
  it("shows the button only when shareUrl is given", () => {
    show();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    cleanup();
    show(URL_TEXT);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("copies the exact string to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show(URL_TEXT);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_TEXT));
    expect(screen.queryByRole("textbox", { name: "Link text" })).toBeNull();
  });

  it("shows a read-only field with the link when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    show(URL_TEXT);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    const field = (await screen.findByRole("textbox", { name: "Link text" })) as HTMLTextAreaElement;
    expect(field.value).toBe(URL_TEXT);
    expect(field.readOnly).toBe(true);
  });
});
