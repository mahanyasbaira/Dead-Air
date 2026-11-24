/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { parseBrief, printBrief } from "hindsight";
import md from "../scenarios/briefs/example-noise-complaint.md?raw";

describe("example noise-complaint brief", () => {
  it("parses and round-trips", () => {
    const r = parseBrief(md);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.brief.participants.length).toBeGreaterThanOrEqual(2);
    expect(r.brief.decisions.every((d) => d.options.length >= 2)).toBe(true);
    expect(parseBrief(printBrief(r.brief))).toEqual(r);
  });
});
