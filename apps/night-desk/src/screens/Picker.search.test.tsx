// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Picker } from "./Picker";
import { nights as real } from "../nights";
import type { Night } from "../nights";

const names = ["Alder", "Birch", "Cedar", "Dogwood", "Elm", "Fir", "Gum", "Hazel"];
function synthetic(count: number): Night[] {
  const base = real[0]!;
  return names.slice(0, count).map((name, i) => ({
    id: `n${i}`,
    scenario: { ...base.scenario, id: `n${i}`, title: name },
    script: { ...base.script, id: `n${i}`, tags: [i % 2 === 0 ? "noise" : "lockout"] },
  }));
}
const titles = () =>
  within(screen.getByRole("list", { name: "Nights" }))
    .queryAllByRole("button")
    .map((b) => b.querySelector(".night-title")?.textContent);

describe("Picker search", () => {
  it("with eight nights, typing narrows the list on each keystroke and clearing restores it", async () => {
    const user = userEvent.setup();
    render(<Picker nights={synthetic(8)} onChoose={() => {}} />);
    const field = screen.getByRole("searchbox", { name: "Search nights" });
    expect(titles()).toHaveLength(8);
    await user.type(field, "e");
    // "e" is in these titles, and in the tag "noise" (even-numbered nights: Alder, Cedar, Elm, Gum).
    expect(titles()).toEqual(["Alder", "Cedar", "Elm", "Gum", "Hazel"]);
    await user.clear(field);
    await user.type(field, "d");
    expect(titles()).toEqual(["Alder", "Cedar", "Dogwood"]);
    await user.type(field, "o");
    expect(titles()).toEqual(["Dogwood"]);
    await user.clear(field);
    expect(titles()).toHaveLength(8);
  });

  it("a tag filter narrows to that tag and pressing it again restores the list", async () => {
    const user = userEvent.setup();
    render(<Picker nights={synthetic(8)} onChoose={() => {}} />);
    const group = screen.getByRole("group", { name: "Filter by tag" });
    await user.click(within(group).getByRole("button", { name: "lockout" }));
    expect(titles()).toEqual(["Birch", "Dogwood", "Fir", "Hazel"]);
    await user.click(within(group).getByRole("button", { name: "lockout" }));
    expect(titles()).toHaveLength(8);
  });

  it("with seven nights, no search field or filters appear", () => {
    render(<Picker nights={synthetic(7)} onChoose={() => {}} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by tag" })).not.toBeInTheDocument();
    expect(titles()).toHaveLength(7);
  });
});
