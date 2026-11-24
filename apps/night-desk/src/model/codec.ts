// Log codec: base64url of UTF-8 JSON. Pure, never throws, no DOM beyond TextEncoder/btoa (global in Node 18+).
import type { LogEntry, NightLog, Result } from "./types";

/** A token longer than this is rejected before it is decoded. */
export const MAX_TOKEN_LENGTH = 8192;

export type CodecErrorKind = "too-long" | "not-base64" | "not-json" | "wrong-version" | "wrong-shape";

export interface CodecError {
  kind: CodecErrorKind;
  message: string;
}

const fail = (kind: CodecErrorKind, message: string): Result<never, CodecError> => ({
  ok: false,
  error: { kind, message },
});

export function encodeLog(log: NightLog): string {
  const bytes = new TextEncoder().encode(JSON.stringify(log));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isMinute = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function shapeEntry(raw: unknown): LogEntry | null {
  if (!isRec(raw)) return null;
  const { at, actionId, itemId, facts } = raw;
  if (!isMinute(at) || typeof actionId !== "string") return null;
  const entry: LogEntry = { at, actionId };
  if (itemId !== undefined) {
    if (typeof itemId !== "string") return null;
    entry.itemId = itemId;
  }
  if (facts !== undefined) {
    if (!Array.isArray(facts) || !facts.every((f): f is string => typeof f === "string")) return null;
    entry.facts = [...facts];
  }
  return entry;
}

/** Check an already-parsed value and rebuild it with known fields only. */
export function shapeLog(raw: unknown): Result<NightLog, CodecError> {
  if (!isRec(raw)) return fail("wrong-shape", "The log is not an object.");
  if (raw.v !== 1) return fail("wrong-version", "The log has an unsupported version.");
  const { scenarioId, rev, seed, entries } = raw;
  if (typeof scenarioId !== "string") return fail("wrong-shape", "scenarioId is not a string.");
  if (typeof rev !== "number" || !Number.isInteger(rev)) return fail("wrong-shape", "rev is not an integer.");
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0) return fail("wrong-shape", "seed is not a uint.");
  if (!Array.isArray(entries)) return fail("wrong-shape", "entries is not a list.");
  const out: LogEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = shapeEntry(entries[i]);
    if (entry === null) return fail("wrong-shape", `Entry ${i} is not valid.`);
    out.push(entry);
  }
  return { ok: true, value: { v: 1, scenarioId, rev, seed, entries: out } };
}

export function decodeLog(token: string): Result<NightLog, CodecError> {
  if (typeof token !== "string") return fail("not-base64", "The token is not text.");
  if (token.length > MAX_TOKEN_LENGTH) return fail("too-long", "The token is longer than 8 KB.");
  if (!/^[A-Za-z0-9_-]*$/.test(token) || token.length % 4 === 1) return fail("not-base64", "The token is not base64url.");
  let text: string;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((token.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("not-base64", "The token could not be decoded.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("not-json", "The token does not hold JSON.");
  }
  return shapeLog(parsed);
}
