// @vitest-environment jsdom
// The finished night as a document (Req 4.1, 4.2, 4.3).
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Document } from "./Document";
import { nights } from "../nights";
import type { Night } from "../nights";
import { applyAction, foldNight } from "../model/night";
import { emptyLog } from "../model/fixtures";
import { HABIT_WHY } from "../model/habits";

/** Replay a list of action ids; null if one is refused. */
function run(night: Night, ids: string[]) {
  let log = emptyLog(night.script);
  for (const id of ids) {
    const r = applyAction(night.script, log, id);
    if (!r.ok) return null;
    log = r.value;
  }
  const s = foldNight(night.script, log);
  return s.ok ? { log, state: s.value } : null;
}

/**
 * Play one night to its end by waiting. With `goAway`, the night's first "away"
 * action is taken as soon as the game allows it, so queued and lost items occur.
 */
function waitToEnd(night: Night, goAway = false) {
  const away = goAway ? night.script.actions.find((a) => a.attention === "away") : undefined;
  const ids: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const tryAway = away !== undefined && !ids.includes(away.id) ? run(night, [...ids, away.id]) : null;
    if (tryAway !== null) ids.push((away as { id: string }).id);
    else ids.push("wait");
    const played = run(night, ids);
    if (played === null) throw new Error(`${night.id}: ${ids.join(",")} refused`);
    if (played.state.ended) return played;
  }
  throw new Error(`${night.id} did not end`);
}

const noop = (): void => {};

describe("Document", () => {
  const night = nights[0] as Night;
  const { log, state } = waitToEnd(night);

  it("is a document: one h1, section headings at level 2, a labelled ordered list", () => {
    render(<Document night={night} log={log} state={state} onPlayAgain={noop} onChooseAnother={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "The night in brief" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Three habits" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Each choice" }).tagName).toBe("OL");
  });

  it("shows the summary and one sentence per decision", () => {
    render(<Document night={night} log={log} state={state} onPlayAgain={noop} onChooseAnother={noop} />);
    expect(screen.getByText(/^You made \d+ choices? between /)).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Each choice" })).getAllByRole("listitem");
    expect(items).toHaveLength(log.entries.length);
    expect(items[0]?.textContent).toMatch(/^At \d+:\d\d (am|pm) you chose /);
  });

  it("shows the three habit figures, each with its fixed line", () => {
    render(<Document night={night} log={log} state={state} onPlayAgain={noop} onChooseAnother={noop} />);
    const terms = screen.getAllByRole("term");
    expect(terms.map((t) => t.textContent)).toEqual([
      "Time from arrival to acting",
      "Written down, compared with known",
      "Time to call the staff member",
    ]);
    for (const why of Object.values(HABIT_WHY)) expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.getAllByRole("definition")).toHaveLength(6);
  });

  it("labels the replay and has no word score and no kit habits table", () => {
    render(<Document night={night} log={log} state={state} onPlayAgain={noop} onChooseAnother={noop} />);
    expect(screen.getByRole("group", { name: /^Replay:/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/score/i);
  });

  it("shows Play it again and Choose another night enabled, with no waiting note, and one Copy link", async () => {
    const again = vi.fn();
    const another = vi.fn();
    render(<Document night={night} log={log} state={state} onPlayAgain={again} onChooseAnother={another} />);
    const user = userEvent.setup();
    for (const [name, fn] of [
      ["Play it again", again],
      ["Choose another night", another],
    ] as const) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeEnabled();
      expect(b).not.toHaveAccessibleDescription();
      await user.click(b);
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(document.body.textContent ?? "").not.toMatch(/is built/);
    expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(1);
  });

  it("never prints the text of a missed item, on any night", () => {
    let missedSeen = 0;
    for (const n of nights) {
      const played = waitToEnd(n, true);
      const { unmount } = render(<Document night={n} log={played.log} state={played.state} onPlayAgain={noop} onChooseAnother={noop} />);
      const page = document.body.textContent ?? "";
      for (const m of played.state.missed) {
        missedSeen += 1;
        const event = n.scenario.events.find((e) => e.id === m.id && e.type === "message_created");
        for (const t of [event?.body, event?.title]) {
          if (t !== undefined && t.trim() !== "") expect(page, `${n.id}/${m.id}`).not.toContain(t);
        }
      }
      unmount();
    }
    expect(missedSeen).toBeGreaterThan(0);
  });
});
