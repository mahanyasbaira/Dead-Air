// @vitest-environment jsdom
/**
 * Keyboard and focus accessibility of the shell and both consoles (consoles
 * 12.1, Req 5.1 and the access rule in Req 6.1). Drives RunHost through every
 * screen with Testing Library roles and visible text only.
 *
 * Run screens are covered twice: once on a fake transport (which follows the
 * Transport interface) and once on the real scripted transport. Storage is a
 * fake. Audio is a counting synth. Visible focus cannot be computed in jsdom;
 * `focus-css.test.ts` checks the stylesheets and the real appearance is a
 * manual browser check (docs/RESULTS.md).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAudioBus, type Synth } from "./fx/audio";
import type { TransportEvent, TransportFrame, TransportMode } from "../transport/types";
import { RunHost } from "./shell/RunHost";

afterEach(cleanup);

type Screen = "entry" | "roles" | "booth" | "tower" | "end";
type Kind = "fake" | "scripted";

function makeFake() {
  const listeners = new Set<(e: TransportEvent) => void>();
  return {
    sent: [] as TransportFrame[],
    mode: "idle" as TransportMode,
    send(frame: TransportFrame) {
      this.sent.push(frame);
    },
    on(l: (e: TransportEvent) => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    close() {},
    emit(e: TransportEvent) {
      act(() => [...listeners].forEach((l) => l(e)));
    },
  };
}
type Fake = ReturnType<typeof makeFake>;

function makeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function mount(kind: Kind) {
  const fakes: Fake[] = [];
  const synth: Synth = { carrierOn() {}, carrierOff() {}, chirp() {} };
  const common = {
    storage: makeStorage(),
    createBus: createAudioBus,
    createSynth: () => synth,
  };
  render(
    kind === "fake" ? (
      <RunHost
        {...common}
        createScripted={() => {
          const f = makeFake();
          fakes.push(f);
          return f;
        }}
      />
    ) : (
      <RunHost {...common} />
    ),
  );
  return { fakes, user: userEvent.setup() };
}

async function reach(kind: Kind, to: Screen) {
  const ctx = mount(kind);
  const { user } = ctx;
  if (to === "entry") return ctx;
  await user.click(screen.getByRole("button", { name: "Solo" }));
  if (to === "roles") return ctx;
  await user.click(screen.getByRole("button", { name: to === "tower" ? /Field Lead/ : /Dispatch/ }));
  if (to === "end") await user.click(screen.getByRole("button", { name: "See the replay" }));
  return ctx;
}

const SCREENS: Screen[] = ["entry", "roles", "booth", "tower", "end"];
const NAMED_ROLES = ["button", "link", "textbox", "listbox", "option", "checkbox"] as const;
const TABBABLE_ROLES = ["button", "link", "textbox", "listbox", "checkbox"] as const;

/** Enabled controls a keyboard user must be able to reach. */
function controls(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const role of TABBABLE_ROLES) {
    for (const el of screen.queryAllByRole(role)) {
      if (!(el as HTMLButtonElement).disabled) found.add(el);
    }
  }
  // Focusable regions and rows that carry tabindex="0" (history, replay rows).
  for (const el of document.querySelectorAll<HTMLElement>('[tabindex="0"]')) found.add(el);
  return [...found];
}

describe.each(["fake", "scripted"] as const)("accessibility on %s transport", (kind) => {
  describe.each(SCREENS)("%s screen", (name) => {
    it("gives every interactive control a non-empty accessible name", async () => {
      await reach(kind, name);
      for (const role of NAMED_ROLES) {
        const all = screen.queryAllByRole(role);
        const named = screen.queryAllByRole(role, { name: /\S/ });
        expect(named, `unnamed ${role}`).toHaveLength(all.length);
      }
      expect(controls().length).toBeGreaterThan(0);
    });

    it("has exactly one main landmark, one level-1 heading and one status region", async () => {
      await reach(kind, name);
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });

    it("starts at level 1 and skips no heading level", async () => {
      await reach(kind, name);
      const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
      expect(levels[0]).toBe(1);
      levels.forEach((l, i) => {
        if (i > 0) expect(l, `heading ${i} of ${levels.join(",")}`).toBeLessThanOrEqual(levels[i - 1] + 1);
      });
    });

    it("reaches every enabled control by Tab with no trap", async () => {
      const { user } = await reach(kind, name);
      const wanted = controls();
      const visited: HTMLElement[] = [];
      // Focus may start mid-page (the replay heading takes focus), so the first
      // wrap past the end lands on the body; keep going until an element repeats.
      let wrapped = false;
      for (let i = 0; i < wanted.length + 6; i++) {
        await user.tab();
        const el = document.activeElement as HTMLElement;
        if (el === document.body) continue;
        if (visited.includes(el)) {
          wrapped = true;
          break;
        }
        visited.push(el);
      }
      expect(wrapped, "Tab order never wrapped: possible trap").toBe(true);
      for (const el of wanted) expect(visited, el.outerHTML.slice(0, 80)).toContain(el);
    });
  });
});

describe("the replay by keyboard alone", () => {
  /** Tab until `el` has focus, within a bound. */
  async function tabTo(user: ReturnType<typeof userEvent.setup>, el: HTMLElement) {
    for (let i = 0; i < 40 && document.activeElement !== el; i++) await user.tab();
    expect(document.activeElement).toBe(el);
  }

  it("moves the cursor, toggles the clear line, copies the summary and the link, and opens the text timeline", async () => {
    // Make a decision first so the record has a time range to move through.
    const { user } = await reach("fake", "booth");
    await user.keyboard("1");
    await user.click(screen.getByRole("button", { name: "See the replay" }));

    const slider = screen.getByRole("slider", { name: "Moment in the record" });
    // A run with one decision and no sends has a single moment, so the slider cannot
    // travel; the decision node is what moves the cursor here.
    const replay = screen.getByRole("group", { name: /^Replay:/ });
    const node = within(replay).getAllByRole("button")[0] as HTMLElement;
    await tabTo(user, node);
    await user.keyboard("{Enter}");
    expect(node).toHaveAttribute("aria-pressed", "true");
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^At /);
    await user.keyboard("{Escape}");
    expect(node).toHaveAttribute("aria-pressed", "false");
    expect(slider).toHaveAttribute("aria-valuetext", "End of the record");
    await tabTo(user, slider);

    const clear = screen.getByRole("button", { name: "Clear line" });
    await tabTo(user, clear);
    await user.keyboard("{Enter}");
    expect(clear).toHaveAttribute("aria-pressed", "true");
    await user.keyboard(" ");
    expect(clear).toHaveAttribute("aria-pressed", "false");

    await tabTo(user, screen.getByRole("button", { name: "Copy summary" }));
    await user.keyboard("{Enter}");
    expect(await navigator.clipboard.readText()).toMatch(/\S/);

    await tabTo(user, screen.getByRole("button", { name: "Copy link" }));
    await user.keyboard("{Enter}");
    expect(await navigator.clipboard.readText()).toContain("#s=");

    const summary = screen.getByText("Text timeline");
    await tabTo(user, summary);
    // The summary is reached by Tab. user-event does not turn Enter on a <summary>
    // into the browser's toggle, so the opening itself is a click.
    await user.click(summary);
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(true);
  });
});

describe("key hints and keys", () => {
  it("shows a number hint on each decision and the number key chooses it", async () => {
    const { user } = await reach("fake", "booth");
    const options = within(screen.getByRole("region", { name: /pretend log/i })).getAllByRole("button");
    expect(options.length).toBeGreaterThan(1);
    options.forEach((b, i) => expect(within(b).getByText(String(i + 1))).toBeVisible());
    await user.keyboard("2");
    expect(options[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/You chose:/)).toBeVisible();
  });

  it("shows Up, Down and Send hints in the Tower and each key works", async () => {
    const { user, fakes } = await reach("fake", "tower");
    const keys = within(screen.getByRole("group", { name: "Pager keys" }));
    expect(within(keys.getByRole("button", { name: "Up" })).getByText("Arrow up")).toBeVisible();
    expect(within(keys.getByRole("button", { name: "Down" })).getByText("Arrow down")).toBeVisible();
    expect(within(keys.getByRole("button", { name: "Send" })).getByText("Enter")).toBeVisible();

    const list = screen.getByRole("listbox", { name: "Canned codes" });
    const options = within(list).getAllByRole("option");
    list.focus();
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(fakes[0].sent).toHaveLength(1);
    expect(new TextDecoder().decode(fakes[0].sent[0].payload)).toBe("Say again.");
  });

  it("shows that Enter sends in the Booth and Enter sends", async () => {
    const { user, fakes } = await reach("fake", "booth");
    expect(screen.getByText("Enter sends.")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "hello{Enter}");
    expect(fakes[0].sent).toHaveLength(1);
    expect(new TextDecoder().decode(fakes[0].sent[0].payload)).toBe("hello");
  });
});
