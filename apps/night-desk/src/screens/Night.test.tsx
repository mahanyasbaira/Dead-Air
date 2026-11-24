// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { applyAction, foldNight } from "../model/night";
import { emptyLog, fixtureScenario, fixtureScript } from "../model/fixtures";
import type { NightLog, NightState } from "../model/types";
import type { Night as NightDef } from "../nights";
import { Night } from "./Night";

const night: NightDef = { id: fixtureScript.id, scenario: fixtureScenario, script: fixtureScript };

function play(...ids: string[]): { log: NightLog; state: NightState } {
  let log = emptyLog();
  for (const id of ids) {
    const next = applyAction(fixtureScript, log, id);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
  }
  const folded = foldNight(fixtureScript, log);
  if (!folded.ok) throw new Error(folded.error.message);
  return { log, state: folded.value };
}

const show = (state: NightState) => render(<Night night={night} state={state} onAction={() => {}} />);

describe("Night: missed and queued items", () => {
  // Clock starts 11:10 pm. "read" (5 min) then "go" (away, 6 min) covers minutes 5 to 11.
  // i2 (phone, minute 8) is lost; i3 (chat, minute 9) is queued until minute 11.
  it("an away action turns a phone item into 'Missed call at ...' with no body text", () => {
    show(play("read", "go").state);
    expect(screen.getByText("Missed call at 11:18 pm")).toBeInTheDocument();
    expect(screen.queryByText(/body of i2/i)).not.toBeInTheDocument();
    // The delivered items still show their text.
    expect(screen.getByText("Body of i1")).toBeInTheDocument();
  });

  it("a queued item shows when it was sent and when it reached the player", () => {
    show(play("read", "go").state);
    const item = screen.getByText("Body of i3").closest("li") as HTMLElement;
    expect(within(item).getByText("11:19 pm")).toBeInTheDocument();
    expect(within(item).getByText("11:21 pm")).toBeInTheDocument();
  });

  it("an expired message reads 'A message went unseen' and a knock names its time", () => {
    // i5 (chat, minute 12, expires after 2) is queued behind "text" (busy, minute 11 to 15) and lost.
    show(play("read", "go", "text").state);
    expect(screen.getByText("A message went unseen")).toBeInTheDocument();
    expect(screen.queryByText(/body of i5/i)).not.toBeInTheDocument();
  });

  it("the staff call is offered before and after any action", () => {
    const { unmount } = show(play().state);
    expect(screen.getByRole("button", { name: /call the staff member/i })).toBeInTheDocument();
    unmount();
    show(play("read", "go").state);
    expect(screen.getByRole("button", { name: /call the staff member/i })).toBeInTheDocument();
  });
});

describe("Night: the professional line", () => {
  it("shows the plain line beside an item marked needsProfessional, and not beside others", () => {
    // Eight one-minute waits after "go" bring the clock to minute 19, when i8 arrives.
    const { state } = play("read", "go", "wait", "wait", "wait", "wait", "wait", "wait", "wait", "wait");
    expect(state.delivered.some((d) => d.id === "i8") || state.missed.some((m) => m.id === "i8")).toBe(true);
    show(state);
    expect(screen.getAllByText("The staff member on call is a phone call away.")).toHaveLength(1);
  });
});
