// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { layoutWorldlines, timelineText } from "hindsight/replay";
import { Document } from "../screens/Document";
import { findNight } from "../nights";
import { applyAction, foldNight } from "./night";
import { toLedger, toNames, toParticipants, toReplayScenario } from "./replay-input";
import { emptyLog, fixtureScenario, fixtureScript } from "./fixtures";

function play(script: typeof fixtureScript, ids: string[]) {
  let log = emptyLog(script);
  for (const id of ids) {
    const r = applyAction(script, log, id);
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  const s = foldNight(script, log);
  if (!s.ok) throw new Error(s.error.message);
  return { log, state: s.value };
}

describe("toParticipants", () => {
  it("lists the player first, then the four sources, all complete", () => {
    const p = toParticipants(fixtureScenario);
    expect(p.map((x) => [x.id, x.kind, x.history])).toEqual([
      ["ra", "role", "complete"],
      ["phone", "source", "complete"],
      ["chat", "source", "complete"],
      ["door", "source", "complete"],
      ["staff", "source", "complete"],
    ]);
    expect(p.some((x) => x.limitNote !== undefined)).toBe(false);
  });
});

describe("the fixture night as worldlines", () => {
  const { log, state } = play(fixtureScript, ["read", "go", "text"]);
  const ledger = toLedger(fixtureScript, log);
  const scenario = toReplayScenario(fixtureScenario, fixtureScript, state);
  const layout = layoutWorldlines({ ledger, scenario, participants: toParticipants(fixtureScenario) });

  it("draws a delivered item as a signal with its delay and a missed call as a never-arrived line", () => {
    const delivered = layout.signals.find((s) => s.id === "i3");
    expect(delivered?.fate).toBe("received");
    expect(delivered?.spanIsDelay).toBe(true);
    expect((delivered?.arrivedAt ?? 0) - (delivered?.sentAt ?? 0)).toBe(2);
    const missed = layout.signals.find((s) => s.id === "i2");
    expect(missed?.fate).toBe("never-arrived");
    expect(missed?.tone).toBe("loss");
  });

  it("has no limit notice and no arrival ticks", () => {
    expect(layout.limits).toEqual([]);
    expect(layout.arrivals).toEqual([]);
  });

  it("says only the time and source of a missed item in the text timeline", () => {
    const text = timelineText(layout).map((e) => e.text).join("\n");
    expect(text).toMatch(/i2, Phone to You: sent at 8, did not arrive\./);
    expect(text).not.toMatch(/Body of/);
  });
});

describe("toNames", () => {
  const { state } = play(fixtureScript, ["read", "go", "text"]);
  const names = toNames(fixtureScenario, state);

  it("names a delivered item by its title and a missed item not at all", () => {
    expect(state.missed.map((m) => m.id)).toContain("i2");
    expect(names["i3"]).toBe("Item i3");
    expect(names["i2"]).toBeUndefined();
  });

  it("never carries an item body", () => {
    expect(Object.values(names).some((n) => n.includes("Body of"))).toBe(false);
  });

  it("shows a missed item by time and source only in the selected-decision sentence", () => {
    const { log, state: s } = play(fixtureScript, ["read", "go", "text"]);
    const layout = layoutWorldlines({
      ledger: toLedger(fixtureScript, log),
      scenario: toReplayScenario(fixtureScenario, fixtureScript, s),
      participants: toParticipants(fixtureScenario),
      names,
    });
    const text = timelineText(layout, names, (t) => String(t)).map((e) => e.text).join("\n");
    expect(text).toMatch(/i2, Phone to You: sent at 8, did not arrive\./);
    expect(text).not.toMatch(/Item i2/);
  });
});

describe("Document on the guided first night", () => {
  const night = findNight("guided-first-night");
  if (night === undefined) throw new Error("guided-first-night is not registered");
  const ids = ["read-text"];
  let played = play(night.script, ids);
  while (!played.state.ended) {
    ids.push("wait");
    played = play(night.script, ids);
  }
  const { log, state } = played;

  it("shows five lines and no limit notice, and never prints an item's text in the replay", () => {
    render(<Document night={night} log={log} state={state} onPlayAgain={() => {}} onChooseAnother={() => {}} />);
    const replay = screen.getByRole("group", { name: /^Replay:/ });
    expect(within(replay).getAllByRole("group")).toHaveLength(5);
    expect(screen.queryByText(/happen elsewhere|not recorded|send time not known/i)).not.toBeInTheDocument();
    // Night Desk keeps channel habits off: no habits table and none of its wording.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/transmissions|mean bytes|not known here/i)).not.toBeInTheDocument();
    const everything = document.body.textContent ?? "";
    // A delivered item is named by its short title; the guided night has no missed item.
    expect(everything).toMatch(/A knock at the door, The door to .*: sent at 11:21 pm/);
    expect(everything).not.toMatch(/student from the next floor/i);
    expect(everything).not.toMatch(/bass from 206/i);
  });
});
