// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

/**
 * Exercises the actual rendered UI through the full journey:
 * intro -> start -> role switch -> advance past the delayed delivery ->
 * record both decisions -> debrief shows created/delivered/decided timing ->
 * reset returns to intro.
 */
describe("Dead Air demo journey (rendered UI)", () => {
  it("plays through role switch, delayed message, decisions, and debrief", async () => {
    const user = userEvent.setup();
    render(<App />);

    // SIMULATION label is present up front.
    expect(screen.getAllByText(/SIMULATION/i).length).toBeGreaterThan(0);

    // Intro -> start.
    await user.click(screen.getByRole("button", { name: /start the exercise/i }));

    // Default role is Dispatch; the field-only gust note is NOT visible to dispatch
    // at sim-minute 0.
    expect(screen.queryByText(/field sees a gust/i)).not.toBeInTheDocument();

    // Switch to Field Lead and advance to sim-minute 1 to see the field-only event.
    await user.click(screen.getByRole("tab", { name: /view as field lead/i }));
    await user.click(screen.getByRole("button", { name: /advance timeline/i }));
    expect(screen.getByText(/field sees a gust/i)).toBeInTheDocument();

    // Timeline steps are [0,1,2,3,5,6]. We are now at sim-minute 1.
    // The delayed wind note must NOT be visible to field before delivery (sim-min 5).
    // Advance to sim-minute 2 (dispatch writes the note) — still before delivery.
    await user.click(screen.getByRole("button", { name: /advance timeline/i }));
    expect(screen.queryByText(/wind note finally arrives/i)).not.toBeInTheDocument();

    // Record the field decision now (before the note arrives) at sim-minute 2.
    await user.click(screen.getByLabelText(/keep going but watch the banners/i));
    expect(screen.getByText(/choice recorded at sim-minute 2/i)).toBeInTheDocument();

    // Advance 2 -> 3 (crowd grows), still before delivery.
    await user.click(screen.getByRole("button", { name: /advance timeline/i }));
    expect(screen.queryByText(/wind note finally arrives/i)).not.toBeInTheDocument();

    // Advance 3 -> 5: the delayed note arrives for field.
    await user.click(screen.getByRole("button", { name: /advance timeline/i }));
    expect(screen.getByText(/wind note finally arrives/i)).toBeInTheDocument();

    // Switch to Dispatch and record its decision.
    await user.click(screen.getByRole("tab", { name: /view as dispatch/i }));
    await user.click(screen.getByLabelText(/suggest holding the acoustic set/i));

    // Advance to the end, then go to the debrief.
    await user.click(screen.getByRole("button", { name: /advance timeline/i }));
    await user.click(screen.getByRole("button", { name: /go to debrief/i }));

    // Debrief shows the dead-air gap (created 2, delivered 5, gap 3).
    const debriefHeading = screen.getByRole("heading", { name: /who knew what, when/i });
    expect(debriefHeading).toBeInTheDocument();
    expect(screen.getByText(/3 sim-minutes of dead air/i)).toBeInTheDocument();

    // Both decisions appear with their recorded sim-times.
    expect(screen.getByText(/keep going but watch the banners/i)).toBeInTheDocument();
    expect(screen.getByText(/suggest holding the acoustic set/i)).toBeInTheDocument();

    // Reset returns to the intro screen.
    await user.click(screen.getByRole("button", { name: /reset demo/i }));
    expect(screen.getByRole("button", { name: /start the exercise/i })).toBeInTheDocument();
  });

  it("keeps role-specific info out of the other role's view", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /start the exercise/i }));

    // Advance to sim-minute 2 as Dispatch: the created wind note is visible to dispatch.
    await user.click(screen.getByRole("button", { name: /advance timeline/i })); // ->1
    await user.click(screen.getByRole("button", { name: /advance timeline/i })); // ->2
    const dispatchPanel = screen.getByRole("tabpanel");
    expect(within(dispatchPanel).getByText(/dispatch writes a wind note/i)).toBeInTheDocument();

    // Field should not see that created note at sim-minute 2.
    await user.click(screen.getByRole("tab", { name: /view as field lead/i }));
    const fieldPanel = screen.getByRole("tabpanel");
    expect(
      within(fieldPanel).queryByText(/dispatch writes a wind note/i),
    ).not.toBeInTheDocument();
  });
});
