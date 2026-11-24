// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsoleFrame, type ConsoleFrameProps } from "./ConsoleFrame";

function setup(extra: Partial<ConsoleFrameProps> = {}) {
  const onToggleMute = vi.fn();
  const props: ConsoleFrameProps = {
    title: "Booth",
    statusMessages: [{ key: 1, text: "Carrier idle." }],
    muted: false,
    onToggleMute,
    children: <p>Console body</p>,
    ...extra,
  };
  const view = render(<ConsoleFrame {...props} />);
  return { onToggleMute, user: userEvent.setup(), ...view, props };
}

describe("ConsoleFrame", () => {
  it("shows the drill marker, the title and the children", () => {
    setup();
    expect(screen.getByText("Fiction. Practice drill.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Booth" })).toBeVisible();
    expect(screen.getByText("Console body")).toBeVisible();
  });

  it("renders status messages in exactly one status region", () => {
    setup({ statusMessages: [{ key: 1, text: "Carrier idle." }, { key: 2, text: "Chirp: message received." }] });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Carrier idle.")).toBeVisible();
    expect(screen.getByText("Chirp: message received.")).toBeVisible();
  });

  it("calls onToggleMute and reflects the muted prop", async () => {
    const { onToggleMute, user, rerender, props } = setup();
    const mute = screen.getByRole("button", { name: "Mute" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    await user.click(mute);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    rerender(<ConsoleFrame {...props} muted />);
    expect(screen.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reaches mute by keyboard", async () => {
    const { onToggleMute, user } = setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Mute" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });
});
