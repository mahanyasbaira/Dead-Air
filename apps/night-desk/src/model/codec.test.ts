import { describe, expect, it } from "vitest";
import { MAX_TOKEN_LENGTH, decodeLog, encodeLog } from "./codec";
import { tokenOf } from "../test-storage";
import { emptyLog } from "./fixtures";
import type { NightLog } from "./types";

const b64url = (value: unknown): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const sample: NightLog = {
  ...emptyLog(),
  entries: [
    { at: 0, actionId: "read", itemId: "i1" },
    { at: 5, actionId: "wait" },
    { at: 6, actionId: "log", facts: ["i1"] },
  ],
};

describe("log codec", () => {
  it("round-trips a log through a URL-safe token", () => {
    const token = encodeLog(sample);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLog(token)).toEqual({ ok: true, value: sample });
  });

  it("keeps non-ASCII text intact", () => {
    const log: NightLog = { ...sample, scenarioId: "nuit-é" };
    expect(decodeLog(encodeLog(log))).toEqual({ ok: true, value: log });
  });

  it("rejects a truncated token", () => {
    const token = encodeLog(sample);
    const result = decodeLog(token.slice(0, token.length - 6));
    expect(result.ok).toBe(false);
  });

  it("rejects text that is not base64url", () => {
    const result = decodeLog("not base64!");
    expect(result).toMatchObject({ ok: false, error: { kind: "not-base64" } });
  });

  it("rejects base64 that is not JSON", () => {
    const result = decodeLog(tokenOf("hello there"));
    expect(result).toMatchObject({ ok: false, error: { kind: "not-json" } });
  });

  it("rejects a wrong version", () => {
    expect(decodeLog(b64url({ ...sample, v: 2 }))).toMatchObject({ ok: false, error: { kind: "wrong-version" } });
  });

  it("rejects a wrong shape", () => {
    const bad = [
      { ...sample, entries: "none" },
      { ...sample, entries: [{ at: -1, actionId: "wait" }] },
      { ...sample, entries: [{ at: 0 }] },
      { ...sample, entries: [{ at: 0, actionId: "wait", facts: [1] }] },
      { ...sample, scenarioId: 4 },
      [],
    ];
    for (const value of bad) expect(decodeLog(b64url(value))).toMatchObject({ ok: false, error: { kind: "wrong-shape" } });
  });

  it("rejects a token over 8 KB without decoding it", () => {
    expect(decodeLog("A".repeat(MAX_TOKEN_LENGTH + 1))).toMatchObject({ ok: false, error: { kind: "too-long" } });
  });

  it("drops unknown fields from a decoded log", () => {
    const result = decodeLog(b64url({ ...sample, extra: 1, entries: [{ at: 0, actionId: "wait", note: "x" }] }));
    expect(result).toEqual({ ok: true, value: { ...sample, entries: [{ at: 0, actionId: "wait" }] } });
  });
});
