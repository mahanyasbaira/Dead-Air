// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Picker } from "./Picker";
import { nights } from "../nights";

describe("Picker", () => {
  it("lists the four nights by title, tags and length, each a button, with no search field", () => {
    render(<Picker nights={nights} onChoose={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Choose a night" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Nights" })).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    nights.forEach((n, i) => {
      const button = within(rows[i] as HTMLElement).getByRole("button");
      expect(button).toHaveTextContent(n.scenario.title);
      expect(button).toHaveTextContent(n.script.tags.join(", "));
      expect(button).toHaveTextContent(`${n.script.endsAt} min`);
    });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("choosing a night passes that night on, by click or keyboard", async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<Picker nights={nights} onChoose={onChoose} />);
    await user.click(screen.getByRole("button", { name: new RegExp(nights[2]!.scenario.title) }));
    expect(onChoose).toHaveBeenLastCalledWith(nights[2]);
    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledTimes(2);
  });
});
