import { describe, expect, it } from "vitest";
import { applyAction, foldNight } from "./night";
import { narrate } from "./narrate";
import { toLedger } from "./replay-input";
import { emptyLog, fixtureScenario, fixtureScript } from "./fixtures";
import type { NightLog, NightState } from "./types";

function play(ids: string[]): { log: NightLog; state: NightState } {
  let log = emptyLog();
  for (const id of ids) {
    const r = applyAction(fixtureScript, log, id);
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  const s = foldNight(fixtureScript, log);
  if (!s.ok) throw new Error(s.error.message);
  return { log, state: s.value };
}

describe("narrate", () => {
  it("names a missed call as missed, with its source and time and not its text", () => {
    const { log, state } = play(["read", "go", "text"]);
    const out = narrate(fixtureScenario, fixtureScript, log, state, toLedger(fixtureScript, log));
    expect(out.decisions[2]).toBe(
      'At 11:21 pm you chose "Reply by text"; you had Item i1 and Item i3; missed was a call from Phone, sent at 11:18 pm.',
    );
    expect(out.summary).toContain("Missed: call from Phone at 11:18 pm");
    expect(JSON.stringify(out)).not.toContain("Body of");
  });

  it("says what had reached the player at the first choice, and nothing before it", () => {
    const { log, state } = play(["read"]);
    const out = narrate(fixtureScenario, fixtureScript, log, state, toLedger(fixtureScript, log));
    expect(out.decisions).toEqual(['At 11:10 pm you chose "Read the message"; you had Item i1.']);
  });

  it("says nothing had reached the player when nothing had", () => {
    const { log, state } = play(["wait"]);
    const late = { ...log, entries: [{ at: 0, actionId: "wait" }] };
    const ledger = toLedger({ ...fixtureScript, items: fixtureScript.items.filter((i) => i.at > 0) }, late);
    const out = narrate(fixtureScenario, fixtureScript, late, state, ledger);
    expect(out.decisions[0]).toBe('At 11:10 pm you chose "Wait"; nothing had reached you yet.');
  });

  // The attention model delivers a queued item at the minute the next choice starts, so a real
  // log never has an item on its way at a choice. This pins the wording with a hand-made
  // entry at minute 10, when the real night's text (sent at 9) had not yet been delivered (11).
  it("says a sent item was still on its way when it reaches the player later", () => {
    const { log, state } = play(["read", "go", "text"]);
    const early = { ...log, entries: [log.entries[0], log.entries[1], { at: 10, actionId: "wait" }] };
    const out = narrate(fixtureScenario, fixtureScript, early, state, toLedger(fixtureScript, log));
    expect(out.decisions[2]).toBe(
      'At 11:20 pm you chose "Wait"; you had Item i1; still on its way was a message from Chat, sent at 11:19 pm; missed was a call from Phone, sent at 11:18 pm.',
    );
  });

  it("states whether the staff member was called", () => {
    const none = play(["read"]);
    expect(narrate(fixtureScenario, fixtureScript, none.log, none.state, toLedger(fixtureScript, none.log)).summary).toContain(
      "The staff member on call was not called.",
    );
    const called = play(["read", "call-staff"]);
    expect(
      narrate(fixtureScenario, fixtureScript, called.log, called.state, toLedger(fixtureScript, called.log)).summary,
    ).toContain("The staff member on call was called at 11:15 pm.");
  });

  it("does not change its inputs", () => {
    const { log, state } = play(["read", "go", "text"]);
    const before = JSON.stringify([log, state]);
    narrate(fixtureScenario, fixtureScript, log, state, toLedger(fixtureScript, log));
    expect(JSON.stringify([log, state])).toBe(before);
  });
});
