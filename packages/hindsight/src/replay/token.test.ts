import { describe, expect, it } from "vitest";
import { decodeReplayRecord, encodeReplayRecord, type ReplayRecord } from "./token";

const record: ReplayRecord = {
  version: 1,
  scenarioId: "wire-report",
  participants: [
    { id: "a", label: "Alder", kind: "role", history: "complete" },
    { id: "b", label: "Birch é 日本 💥", history: "arrivals-only", limitNote: "Their sends are elsewhere." },
    { id: "src", label: "Source", kind: "source" },
  ],
  events: [
    { kind: "sent", messageId: "m1", sender: "a", recipient: "b", simTime: 2, bytes: 12, airtime: 3 },
    { kind: "sent", messageId: "m2", sender: "b", recipient: "a", simTime: 4 },
    { kind: "outcome", messageId: "m1", outcome: "garbled", simTime: 5 },
    { kind: "arrival", messageId: "x1", sender: "b", recipient: "a", outcome: "received", simTime: 7 },
    { kind: "learned", participant: "a", factId: "f1", simTime: 7 },
    { kind: "readback", participant: "a", messageId: "x1", simTime: 8 },
  ],
  decisions: [{ id: "d1", actor: "a", simTime: 6, title: "Ask again" }],
};

// Test-only helpers; the kit codec itself uses neither.
function b64(s: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64(t: string): string {
  const bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function token(r: ReplayRecord): string {
  const e = encodeReplayRecord(r);
  if (!e.ok) throw new Error("expected a token");
  return e.token;
}

describe("replay token", () => {
  it("round-trips a worked record", () => {
    expect(decodeReplayRecord(token(record))).toEqual({ ok: true, record });
  });

  it("uses only base64url characters", () => {
    expect(token(record)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects another version", () => {
    const other = b64(JSON.stringify({ v: 2, s: "x", p: [], e: [], d: [] }));
    expect(decodeReplayRecord(other)).toEqual({ ok: false, reason: "wrong-version" });
  });

  it("rejects characters outside base64url", () => {
    expect(decodeReplayRecord("abc+/=")).toEqual({ ok: false, reason: "bad-characters" });
    expect(decodeReplayRecord("ab cd")).toEqual({ ok: false, reason: "bad-characters" });
  });

  it("rejects a truncated token", () => {
    const t = token(record);
    for (const cut of [0, 1, 5, Math.floor(t.length / 2), t.length - 1]) {
      expect(decodeReplayRecord(t.slice(0, cut)).ok).toBe(false);
    }
  });

  it("rejects the wrong shape", () => {
    const wrap = (o: unknown) => b64(JSON.stringify(o));
    expect(decodeReplayRecord(wrap([1, 2]))).toEqual({ ok: false, reason: "bad-shape" });
    expect(decodeReplayRecord(wrap({ v: 1, s: "x", p: [], e: [["s", "m"]], d: [] }))).toEqual({ ok: false, reason: "bad-shape" });
    expect(decodeReplayRecord(wrap({ v: 1, s: 4, p: [], e: [], d: [] }))).toEqual({ ok: false, reason: "bad-shape" });
    expect(decodeReplayRecord(wrap({ v: 1, s: "x", p: [], e: [["l", "a", "f", null]], d: [] }))).toEqual({ ok: false, reason: "bad-shape" });
  });

  it("rejects an unknown participant kind", () => {
    const t = b64(JSON.stringify({ v: 1, s: "x", p: [["a", "A", "ghost", null]], e: [], d: [] }));
    expect(decodeReplayRecord(t)).toEqual({ ok: false, reason: "unknown-kind" });
  });

  it("reports an oversize record and produces no token", () => {
    const big: ReplayRecord = { ...record, decisions: [{ id: "d", actor: "a", simTime: 1, title: "x".repeat(7000) }] };
    expect(encodeReplayRecord(big)).toEqual({ ok: false, reason: "too-large" });
    expect(decodeReplayRecord("A".repeat(7000))).toEqual({ ok: false, reason: "too-large" });
  });

  it("refuses a non-finite time instead of throwing", () => {
    const r: ReplayRecord = { ...record, decisions: [{ id: "d", actor: "a", simTime: Number.NaN, title: "t" }] };
    expect(encodeReplayRecord(r)).toEqual({ ok: false, reason: "invalid" });
  });

  it("carries only the replay fields", () => {
    const text = unb64(token(record));
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["d", "e", "p", "s", "v"]);
  });
});
