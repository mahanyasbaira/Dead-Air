import { describe, expect, it } from "vitest";
import { filterNights, tagsOf } from "./picker";

const mk = (title: string, tags: string[]) => ({ scenario: { title }, script: { tags } });
const list = [mk("Quiet hours", ["noise", "roommate"]), mk("Locked out", ["lockout"]), mk("Loud floor", ["noise"])];

describe("filterNights", () => {
  it("matches the title, case-insensitively", () => {
    expect(filterNights(list, "LOCKED").map((n) => n.scenario.title)).toEqual(["Locked out"]);
  });
  it("matches a tag and keeps the original order", () => {
    expect(filterNights(list, "noise").map((n) => n.scenario.title)).toEqual(["Quiet hours", "Loud floor"]);
  });
  it("trims the query; a blank query returns everything", () => {
    expect(filterNights(list, "  lockout ")).toHaveLength(1);
    expect(filterNights(list, "   ")).toHaveLength(3);
    expect(filterNights(list, "")).toEqual(list);
  });
  it("returns nothing when nothing matches", () => {
    expect(filterNights(list, "zzz")).toEqual([]);
  });
});

describe("tagsOf", () => {
  it("lists each tag once, in order of first appearance", () => {
    expect(tagsOf(list)).toEqual(["noise", "roommate", "lockout"]);
  });
});
