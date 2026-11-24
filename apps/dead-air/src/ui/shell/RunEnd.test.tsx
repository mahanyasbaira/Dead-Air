// @vitest-environment jsdom
/** RunEnd: the knowledge limit is a visible sentence, shown once, and only when it applies. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { deriveState } from "./log";
import { RunEnd } from "./RunEnd";
import type { ConsoleLogEntry, PlayMode } from "./types";

afterEach(cleanup);

const NOTE = "Their sends happen elsewhere and are not recorded here.";
const log: ConsoleLogEntry[] = [
  { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 2, bytes: 3 } },
  {
    kind: "wire",
    event: { kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) },
  },
];

function show(mode: PlayMode, entries: ConsoleLogEntry[]) {
  render(
    <RunEnd
      scenario={staticOnChannel9}
      log={entries}
      state={deriveState(staticOnChannel9, entries)}
      mode={mode}
      localRole="dispatch"
      onRunAgain={() => {}}
    />,
  );
}

describe("RunEnd names", () => {
  const option = staticOnChannel9.decisionPrompts.dispatch?.options[0]?.id ?? "";
  const decision: ConsoleLogEntry = { kind: "decision", decision: { role: "dispatch", optionId: option, recordedAtSimTime: 2 } };

  it("names a message by role and send time in the sentence for a selected decision (solo)", () => {
    show("solo", [
      { kind: "send", send: { id: "field-0", sender: "field", recipient: "dispatch", sendTime: 1, bytes: 1 } },
      { kind: "wire", event: { kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) } },
      decision,
    ]);
    fireEvent.keyDown(screen.getAllByRole("button", { pressed: false })[0] as HTMLElement, { key: "Enter" });
    expect(screen.getByText(/Not yet arrived: Message from .+ at sim-minute 1\./)).toBeInTheDocument();
  });

  it("names a partner message in two tabs by its arrival, never by a send time", () => {
    show("loopback", [
      { kind: "wire", event: { kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) } },
      decision,
    ]);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Message from .+, arrived sim-minute 4/);
    expect(text).not.toMatch(/Message from [^,.]+ at sim-minute/);
  });
});

describe("RunEnd habits", () => {
  const option = staticOnChannel9.decisionPrompts.dispatch?.options[0]?.id ?? "";
  const decision: ConsoleLogEntry = { kind: "decision", decision: { role: "dispatch", optionId: option, recordedAtSimTime: 6 } };
  const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
  const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((c) => c.textContent);

  it("Solo: transmissions and mean bytes for both roles, read-back not recorded", () => {
    show("solo", [
      { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 1, bytes: 4, airtime: 4 } },
      { kind: "send", send: { id: "dispatch-1", sender: "dispatch", recipient: "field", sendTime: 8, bytes: 6, airtime: 4 } },
      { kind: "send", send: { id: "field-0", sender: "field", recipient: "dispatch", sendTime: 3, bytes: 3, airtime: 4 } },
      { kind: "wire", event: { kind: "received", id: "field-0", simTime: 5, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1, 2, 3) } },
      decision,
    ]);
    const [dispatch, field] = rows().map(cells);
    // columns: transmissions, mean bytes, mean time, involved, begun second, read back
    expect(dispatch?.slice(0, 3)).toEqual(["2", "5", "4"]);
    expect(field?.slice(0, 3)).toEqual(["1", "3", "4"]);
    expect(dispatch?.[5]).toBe("Not recorded");
    expect(field?.[5]).toBe("Not recorded");
  });

  it("Solo with no airtime in an older save reads Not recorded, never 0", () => {
    show("solo", [
      { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 1, bytes: 4 } },
      { kind: "send", send: { id: "field-0", sender: "field", recipient: "dispatch", sendTime: 3, bytes: 3 } },
      decision,
    ]);
    const [dispatch] = rows().map(cells);
    expect(dispatch?.[2]).toBe("Not recorded");
  });

  it("Two tabs: the partner row reads Not known here", () => {
    show("loopback", [
      { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 1, bytes: 4, airtime: 4 } },
      { kind: "wire", event: { kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) } },
      decision,
    ]);
    const [dispatch, field] = rows().map(cells);
    expect(dispatch?.[0]).toBe("1");
    expect(field?.slice(0, 5)).toEqual(Array(5).fill("Not known here"));
    expect(field?.[5]).toBe("Not known here");
  });
});

describe("RunEnd knowledge limit", () => {
  it("says once that the partner's sends are not recorded in two tabs", () => {
    show("loopback", log);
    expect(screen.getAllByText(new RegExp(NOTE.replace(/\./g, "\\.")))).toHaveLength(1);
  });

  it("says nothing in solo when every send is recorded", () => {
    show("solo", [
      { kind: "send", send: { id: "field-0", sender: "field", recipient: "dispatch", sendTime: 1, bytes: 1 } },
      log[1] as ConsoleLogEntry,
    ]);
    expect(screen.queryByText(new RegExp("not recorded here"))).toBeNull();
  });
});
