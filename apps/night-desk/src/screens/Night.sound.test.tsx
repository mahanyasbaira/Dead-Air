// @vitest-environment jsdom
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applyAction, foldNight } from "../model/night";
import { emptyLog, fixtureScenario, fixtureScript } from "../model/fixtures";
import type { DeskScript, NightState } from "../model/types";
import type { Night as NightDef } from "../nights";
import type { Clip } from "../voice/voice";
import { Night } from "./Night";

// i3 (chat, minute 9) carries a clip. It reaches the player after "read" (5 min) and four waits.
const script: DeskScript = {
  ...fixtureScript,
  items: fixtureScript.items.map((i) => (i.id === "i3" ? { ...i, voice: { file: "i3.mp3" } } : i)),
};
const night: NightDef = { id: script.id, scenario: fixtureScenario, script };

function stateAfter(...ids: string[]): NightState {
  let log = emptyLog(script);
  for (const id of ids) {
    const next = applyAction(script, log, id);
    if (!next.ok) throw new Error(next.error.message);
    log = next.value;
  }
  const folded = foldNight(script, log);
  if (!folded.ok) throw new Error(folded.error.message);
  return folded.value;
}
const start = stateAfter();
const arrived = stateAfter("read", "wait", "wait", "wait", "wait");

function fake() {
  const clips: { file: string; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const factory = vi.fn((file: string): Clip => {
    const clip = { file, play: vi.fn(), stop: vi.fn() };
    clips.push(clip);
    return clip;
  });
  return { clips, factory };
}

describe("Night: voice and the sound control", () => {
  it("plays nothing on render and builds no clip", () => {
    const { factory } = fake();
    render(<Night night={night} state={arrived} onAction={() => {}} voiceFactory={factory} />);
    expect(factory).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sound off/i })).toBeInTheDocument();
  });

  it("plays nothing on the first gesture while sound is off, and shows the transcript", async () => {
    const user = userEvent.setup();
    const { factory } = fake();
    const view = render(<Night night={night} state={start} onAction={() => {}} voiceFactory={factory} />);
    await user.keyboard("{Shift}");
    view.rerender(<Night night={night} state={arrived} onAction={() => {}} voiceFactory={factory} />);
    expect(factory).not.toHaveBeenCalled();
    expect(screen.getByText("Body of i3")).toBeInTheDocument();
  });

  it("with sound on, a gesture and a delivered item with a clip play it once, transcript visible", async () => {
    const user = userEvent.setup();
    const { clips, factory } = fake();
    const view = render(<Night night={night} state={start} onAction={() => {}} voiceFactory={factory} />);
    await user.click(screen.getByRole("button", { name: /sound off/i }));
    expect(screen.getByRole("button", { name: /sound on/i })).toBeInTheDocument();
    view.rerender(<Night night={night} state={arrived} onAction={() => {}} voiceFactory={factory} />);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.file).toBe("i3.mp3");
    expect(clips[0]!.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Body of i3")).toBeInTheDocument();
    // The same item does not play again on a later render.
    view.rerender(<Night night={night} state={arrived} onAction={() => {}} voiceFactory={factory} />);
    expect(clips).toHaveLength(1);
  });

  it("the sound key toggles sound, and is not an action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Night night={night} state={start} onAction={onAction} />);
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: /sound on/i })).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("a night whose action uses the sound key keeps it as an action and shows no hint", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const clash: DeskScript = {
      ...script,
      actions: script.actions.map((a) => (a.id === "wait" ? { ...a, key: "m" } : a)),
    };
    render(<Night night={{ ...night, script: clash }} state={start} onAction={onAction} />);
    await user.keyboard("m");
    expect(onAction).toHaveBeenCalledWith("wait");
    expect(screen.getByRole("button", { name: /sound off/i })).not.toHaveAttribute("aria-keyshortcuts");
  });

  it("under StrictMode a clip plays once, and unmount stops it", async () => {
    const user = userEvent.setup();
    const { clips, factory } = fake();
    const view = render(
      <StrictMode>
        <Night night={night} state={start} onAction={() => {}} voiceFactory={factory} />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: /sound off/i }));
    view.rerender(
      <StrictMode>
        <Night night={night} state={arrived} onAction={() => {}} voiceFactory={factory} />
      </StrictMode>,
    );
    expect(clips).toHaveLength(1);
    expect(clips[0]!.play).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(clips[0]!.stop).toHaveBeenCalledTimes(1);
  });
});
