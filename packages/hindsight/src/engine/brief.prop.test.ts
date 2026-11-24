import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { parseBrief, printBrief, type Brief } from "./brief";
import type { EventType } from "./types";

// Feature: skeleton, Property 9: Brief round trip
// **Validates: Requirements 5.1**

const UNITS = ["|", "\\", "-", " ", ":", "#", "a", "Z", "7", "é", "日", "🙂", "\\|", " - ", ": "];
const text = fc
  .array(fc.constantFrom(...UNITS), { maxLength: 8 })
  .map((a) => a.join("").trim());
const nonEmpty = text.filter((s) => s !== "");
const name = nonEmpty.filter((s) => !`${s} `.includes(" - "));
const key = nonEmpty.filter((s) => !s.includes(": "));
const ids = fc.oneof(key, fc.constantFrom("__proto__", "constructor", "toString", "hasOwnProperty", "all"));
const TYPES: EventType[] = ["info", "message_created", "message_delivered", "decision", "debrief"];

const brief: fc.Arbitrary<Brief> = fc
  .uniqueArray(ids, { minLength: 1, maxLength: 4 })
  .chain((pids) =>
    fc.record({
      title: nonEmpty,
      participants: fc.tuple(...pids.map((id) => fc.record({ id: fc.constant(id), name, blurb: text }))),
      beats: fc.array(
        fc.record({
          time: fc.nat(100000),
          audience: fc.constantFrom("all", ...pids),
          type: fc.constantFrom(...TYPES),
          title: text,
          body: text,
        }),
        { maxLength: 5 },
      ),
      decisions: fc.array(
        fc.record({
          participant: fc.constantFrom(...pids),
          prompt: nonEmpty,
          options: fc.array(fc.record({ id: key, label: nonEmpty }), { maxLength: 4 }),
        }),
        { maxLength: 3 },
      ),
    }),
  )
  .map((b) => ({ ...b, participants: [...b.participants] }));

describe("Feature: skeleton, Property 9: brief round trip", () => {
  it("parse(print(b)) equals b and print is stable", () => {
    fc.assert(
      fc.property(brief, (b) => {
        const printed = printBrief(b);
        const r = parseBrief(printed);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.brief).toEqual(b);
        expect(printBrief(r.brief)).toBe(printed);
      }),
      { numRuns: 200 },
    );
  });

  it("never throws on arbitrary text and errors carry valid line numbers", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (s) => {
        const r = parseBrief(s);
        if (!r.ok) {
          const lines = s.split(/\r?\n/).length;
          expect(r.errors.length).toBeGreaterThan(0);
          for (const e of r.errors) {
            expect(e.line).toBeGreaterThanOrEqual(1);
            expect(e.line).toBeLessThanOrEqual(lines);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
