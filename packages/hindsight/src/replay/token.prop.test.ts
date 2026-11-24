import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../ledger/ledger";
import { decodeReplayRecord, encodeReplayRecord, type ReplayRecord } from "./token";

// Feature: seance-replay, Property 13: The share token round-trips and never throws
// **Validates: Requirements 4.1**

const str = fc.oneof(fc.string({ maxLength: 12 }), fc.string({ unit: "binary", maxLength: 8 }), fc.constantFrom("", "é", "日本", "💥", "__proto__"));
// `+ 0` turns -0 into 0, which JSON cannot carry.
const num = fc.oneof(fc.integer({ min: -1000, max: 100000 }), fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => n + 0));
const outcome = fc.constantFrom("received" as const, "garbled" as const, "collision" as const);

const sent = fc
  .record({ messageId: str, sender: str, recipient: str, simTime: num }, { requiredKeys: ["messageId", "sender", "recipient", "simTime"] })
  .chain((base) =>
    fc.record({ bytes: fc.option(num, { nil: undefined }), airtime: fc.option(num, { nil: undefined }) }).map((o) => {
      const e: LedgerEvent = { kind: "sent", ...base };
      if (o.bytes !== undefined) e.bytes = o.bytes;
      if (o.airtime !== undefined) e.airtime = o.airtime;
      return e;
    }),
  );

const event: fc.Arbitrary<LedgerEvent> = fc.oneof(
  fc.record({ kind: fc.constant("learned" as const), participant: str, factId: str, simTime: num }),
  sent,
  fc.record({ kind: fc.constant("outcome" as const), messageId: str, outcome, simTime: num }),
  fc.record({ kind: fc.constant("arrival" as const), messageId: str, sender: str, recipient: str, outcome, simTime: num }),
  fc.record({ kind: fc.constant("readback" as const), participant: str, messageId: str, simTime: num }),
);

const participant = fc
  .record({
    id: str,
    label: str,
    kind: fc.option(fc.constantFrom("role" as const, "source" as const), { nil: undefined }),
    history: fc.option(fc.constantFrom("complete" as const, "arrivals-only" as const), { nil: undefined }),
    limitNote: fc.option(str, { nil: undefined }),
  })
  .map((p) => {
    const out: ReplayRecord["participants"][number] = { id: p.id, label: p.label };
    if (p.kind !== undefined) out.kind = p.kind;
    if (p.history !== undefined) out.history = p.history;
    if (p.limitNote !== undefined) out.limitNote = p.limitNote;
    return out;
  });

const recordArb: fc.Arbitrary<ReplayRecord> = fc.record({
  version: fc.constant(1 as const),
  scenarioId: str,
  participants: fc.array(participant, { maxLength: 5 }),
  events: fc.array(event, { maxLength: 20 }),
  decisions: fc.array(fc.record({ id: str, actor: str, simTime: num, title: str }), { maxLength: 6 }),
});

describe("Property 13: The share token round-trips and never throws", () => {
  it("decode(encode(r)) deep-equals r, or encoding reports too-large and gives no token", () => {
    fc.assert(
      fc.property(recordArb, (r) => {
        const e = encodeReplayRecord(r);
        if (!e.ok) {
          expect(e.reason).toBe("too-large");
          expect("token" in e).toBe(false);
          return;
        }
        expect(decodeReplayRecord(e.token)).toEqual({ ok: true, record: r });
      }),
      { numRuns: 200 },
    );
  });

  it("decode returns a result for any string and never throws", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.stringMatching(/^[A-Za-z0-9_-]{0,200}$/)), (s) => {
        const d = decodeReplayRecord(s);
        expect(typeof d.ok).toBe("boolean");
      }),
      { numRuns: 300 },
    );
  });

  it("decode returns a result for a valid token that is cut or has a character changed", () => {
    fc.assert(
      fc.property(recordArb, fc.nat(), fc.constantFrom("+", "=", "!", "A", "_"), (r, n, ch) => {
        const e = encodeReplayRecord(r);
        if (!e.ok) return;
        const i = e.token.length === 0 ? 0 : n % e.token.length;
        for (const t of [e.token.slice(0, i), e.token.slice(0, i) + ch + e.token.slice(i + 1)]) {
          expect(typeof decodeReplayRecord(t).ok).toBe("boolean");
        }
      }),
      { numRuns: 150 },
    );
  });

  it("a record with a non-finite time is refused, not thrown", () => {
    fc.assert(
      fc.property(fc.constantFrom(Number.NaN, Infinity, -Infinity), (bad) => {
        const e = encodeReplayRecord({ version: 1, scenarioId: "s", participants: [], events: [], decisions: [{ id: "d", actor: "a", simTime: bad, title: "t" }] });
        expect(e.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
