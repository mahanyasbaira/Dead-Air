/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { lintText } from "./banned-words";

// Heuristic only (see banned-words.ts). A human read of each night is still required.

const briefs = import.meta.glob("../briefs/*.md", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;
const scenarioFiles = import.meta.glob(["../*.ts", "!../*.test.ts"], { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** Every string anywhere inside a value, so new text fields are covered without an edit. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

describe("content lint rule", () => {
  it("flags out-of-scope words and real-institution markers", () => {
    const bad = [
      "He pulled a knife in the corridor.",
      "She talked about suicide.",
      "Call an ambulance, it is a medical emergency.",
      "Email the dean at someone@school.edu",
      "Students at the University of Somewhere",
      "The hall is in Paris, France.",
    ];
    for (const text of bad) expect(lintText(text).length, text).toBeGreaterThan(0);
    expect(lintText("GUNS and Knives").map((h) => h.term).sort()).toEqual(["gun", "knives"]);
  });

  it("passes clean text, including words that contain a listed word", () => {
    const clean = [
      "A student is locked out of room 204 and the music in 206 is loud.",
      "Her skill at the desk; he has begun to knock; a skillful reply.",
      "Linden Hall, Harlow Hall, Marsh Hall and Ferris Hall are invented.",
      "The duty phone buzzed. Ms Alder is a phone call away.",
      "Parisian pastry", // not the whole word "paris"
    ];
    for (const text of clean) expect(lintText(text), text).toEqual([]);
  });
});

describe("shipped briefs and scenario text", () => {
  it("finds briefs and scenarios, so the globs are working", () => {
    expect(Object.keys(briefs).length).toBeGreaterThan(0);
    expect(Object.keys(scenarioFiles).length).toBeGreaterThan(0);
  });

  for (const [path, md] of Object.entries(briefs)) {
    it(`${path} has no out-of-scope or real-institution text`, () => {
      expect(lintText(md)).toEqual([]);
    });
  }

  for (const [path, mod] of Object.entries(scenarioFiles)) {
    it(`${path} has no out-of-scope or real-institution text`, () => {
      expect(lintText(strings(mod).join("\n"))).toEqual([]);
    });
  }
});
