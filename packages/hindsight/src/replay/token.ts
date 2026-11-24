// Share token for a replay record. Pure: no DOM global, no Buffer, no clock, no randomness.
// Wire format (version 1), then UTF-8, then base64url without padding:
//   {"v":1,"s":scenarioId,
//    "p":[[id,label,kind|null,history|null,limitNote?],...],
//    "e":[["l",participant,factId,t] | ["s",messageId,sender,recipient,t,bytes|null,airtime|null]
//        | ["o",messageId,outcome,t] | ["a",messageId,sender,recipient,outcome,t]
//        | ["r",participant,messageId,t],...],
//    "d":[[id,actor,t,title],...]}
// The token is not human-readable by design and is never trusted: decoding shape-checks every field.
import type { ParticipantId } from "../engine/types";
import type { LedgerEvent } from "../ledger/ledger";
import type { HistoryKnowledge, ReplayParticipant } from "./types";

export interface ReplayDecision {
  id: string;
  actor: ParticipantId;
  simTime: number;
  title: string;
}

export interface ReplayRecord {
  version: 1;
  scenarioId: string;
  participants: ReplayParticipant[];
  events: LedgerEvent[];
  decisions: ReplayDecision[];
}

/** Longest token, in characters (6 KB). */
export const MAX_TOKEN_LENGTH = 6144;

export type EncodeFailure = "too-large" | "invalid";
export type DecodeFailure =
  | "too-large"
  | "bad-characters"
  | "bad-encoding"
  | "wrong-version"
  | "bad-shape"
  | "unknown-kind";

export type EncodeResult = { ok: true; token: string } | { ok: false; reason: EncodeFailure };
export type DecodeResult = { ok: true; record: ReplayRecord } | { ok: false; reason: DecodeFailure };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** Strict UTF-8 decode. Returns null on malformed input. */
function utf8Decode(bytes: Uint8Array): string | null {
  const parts: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] as number;
    let need = 0;
    let cp = 0;
    let min = 0;
    if (b < 0x80) {
      cp = b;
    } else if (b >= 0xc0 && b < 0xe0) {
      need = 1;
      cp = b & 0x1f;
      min = 0x80;
    } else if (b >= 0xe0 && b < 0xf0) {
      need = 2;
      cp = b & 0x0f;
      min = 0x800;
    } else if (b >= 0xf0 && b < 0xf8) {
      need = 3;
      cp = b & 0x07;
      min = 0x10000;
    } else return null;
    for (let k = 1; k <= need; k++) {
      const n = bytes[i + k];
      if (n === undefined || (n & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (n & 63);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    parts.push(String.fromCodePoint(cp));
    i += need + 1;
  }
  return parts.join("");
}

function base64urlEncode(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    if (b !== undefined) out += ALPHABET[(n >> 6) & 63];
    if (c !== undefined) out += ALPHABET[n & 63];
  }
  return out;
}

function base64urlDecode(token: string): Uint8Array | "chars" | "encoding" {
  const values: number[] = [];
  for (let i = 0; i < token.length; i++) {
    const v = ALPHABET.indexOf(token.charAt(i));
    if (v < 0) return "chars";
    values.push(v);
  }
  if (token.length % 4 === 1) return "encoding";
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const v0 = values[i] as number;
    const v1 = values[i + 1] as number;
    const v2 = values[i + 2];
    const v3 = values[i + 3];
    const n = (v0 << 18) | (v1 << 12) | ((v2 ?? 0) << 6) | (v3 ?? 0);
    out.push((n >> 16) & 255);
    if (v2 !== undefined) out.push((n >> 8) & 255);
    if (v3 !== undefined) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const OUTCOMES = ["received", "garbled", "collision"] as const;
type Outcome = (typeof OUTCOMES)[number];
const isOutcome = (x: unknown): x is Outcome => OUTCOMES.includes(x as Outcome);

function wireEvent(e: LedgerEvent): unknown[] {
  switch (e.kind) {
    case "learned":
      return ["l", e.participant, e.factId, e.simTime];
    case "sent":
      return ["s", e.messageId, e.sender, e.recipient, e.simTime, e.bytes ?? null, e.airtime ?? null];
    case "outcome":
      return ["o", e.messageId, e.outcome, e.simTime];
    case "arrival":
      return ["a", e.messageId, e.sender, e.recipient, e.outcome, e.simTime];
    case "readback":
      return ["r", e.participant, e.messageId, e.simTime];
  }
}

function allNumbersFinite(r: ReplayRecord): boolean {
  for (const e of r.events) {
    if (!isNum(e.simTime)) return false;
    if (e.kind === "sent" && ((e.bytes !== undefined && !isNum(e.bytes)) || (e.airtime !== undefined && !isNum(e.airtime))))
      return false;
  }
  return r.decisions.every((d) => isNum(d.simTime));
}

/** Encode a record. Never throws. */
export function encodeReplayRecord(record: ReplayRecord): EncodeResult {
  try {
    if (!allNumbersFinite(record)) return { ok: false, reason: "invalid" };
    const wire = {
      v: 1,
      s: record.scenarioId,
      p: record.participants.map((p) => {
        const row: unknown[] = [p.id, p.label, p.kind ?? null, p.history ?? null];
        if (p.limitNote !== undefined) row.push(p.limitNote);
        return row;
      }),
      e: record.events.map(wireEvent),
      d: record.decisions.map((d) => [d.id, d.actor, d.simTime, d.title]),
    };
    const token = base64urlEncode(utf8Encode(JSON.stringify(wire)));
    if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "too-large" };
    return { ok: true, token };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

const bad = (reason: DecodeFailure): DecodeResult => ({ ok: false, reason });

function parseParticipant(row: unknown): ReplayParticipant | DecodeFailure {
  if (!Array.isArray(row) || (row.length !== 4 && row.length !== 5)) return "bad-shape";
  const [id, label, kind, history, note] = row as unknown[];
  if (!isStr(id) || !isStr(label)) return "bad-shape";
  if (kind !== null && kind !== "role" && kind !== "source") return isStr(kind) ? "unknown-kind" : "bad-shape";
  if (history !== null && history !== "complete" && history !== "arrivals-only") return "bad-shape";
  if (row.length === 5 && !isStr(note)) return "bad-shape";
  const p: ReplayParticipant = { id, label };
  if (kind !== null) p.kind = kind;
  if (history !== null) p.history = history as HistoryKnowledge;
  if (row.length === 5) p.limitNote = note as string;
  return p;
}

function parseEvent(row: unknown): LedgerEvent | null {
  if (!Array.isArray(row)) return null;
  const r = row as unknown[];
  switch (r[0]) {
    case "l":
      return r.length === 4 && isStr(r[1]) && isStr(r[2]) && isNum(r[3])
        ? { kind: "learned", participant: r[1], factId: r[2], simTime: r[3] }
        : null;
    case "s": {
      if (r.length !== 7 || !isStr(r[1]) || !isStr(r[2]) || !isStr(r[3]) || !isNum(r[4])) return null;
      if ((r[5] !== null && !isNum(r[5])) || (r[6] !== null && !isNum(r[6]))) return null;
      const e: LedgerEvent = { kind: "sent", messageId: r[1], sender: r[2], recipient: r[3], simTime: r[4] };
      if (r[5] !== null) e.bytes = r[5];
      if (r[6] !== null) e.airtime = r[6];
      return e;
    }
    case "o":
      return r.length === 4 && isStr(r[1]) && isOutcome(r[2]) && isNum(r[3])
        ? { kind: "outcome", messageId: r[1], outcome: r[2], simTime: r[3] }
        : null;
    case "a":
      return r.length === 6 && isStr(r[1]) && isStr(r[2]) && isStr(r[3]) && isOutcome(r[4]) && isNum(r[5])
        ? { kind: "arrival", messageId: r[1], sender: r[2], recipient: r[3], outcome: r[4], simTime: r[5] }
        : null;
    case "r":
      return r.length === 4 && isStr(r[1]) && isStr(r[2]) && isNum(r[3])
        ? { kind: "readback", participant: r[1], messageId: r[2], simTime: r[3] }
        : null;
    default:
      return null;
  }
}

/** Decode a token. Never throws; every field is shape-checked. */
export function decodeReplayRecord(token: string): DecodeResult {
  try {
    if (!isStr(token)) return bad("bad-shape");
    if (token.length > MAX_TOKEN_LENGTH) return bad("too-large");
    const bytes = base64urlDecode(token);
    if (bytes === "chars") return bad("bad-characters");
    if (bytes === "encoding") return bad("bad-encoding");
    const text = utf8Decode(bytes);
    if (text === null) return bad("bad-encoding");
    let wire: unknown;
    try {
      wire = JSON.parse(text);
    } catch {
      return bad("bad-encoding");
    }
    if (typeof wire !== "object" || wire === null || Array.isArray(wire)) return bad("bad-shape");
    const w = wire as Record<string, unknown>;
    if (w.v !== 1) return bad("wrong-version");
    if (!isStr(w.s) || !Array.isArray(w.p) || !Array.isArray(w.e) || !Array.isArray(w.d)) return bad("bad-shape");
    const participants: ReplayParticipant[] = [];
    for (const row of w.p) {
      const p = parseParticipant(row);
      if (typeof p === "string") return bad(p);
      participants.push(p);
    }
    const events: LedgerEvent[] = [];
    for (const row of w.e) {
      const e = parseEvent(row);
      if (e === null) return bad("bad-shape");
      events.push(e);
    }
    const decisions: ReplayDecision[] = [];
    for (const row of w.d) {
      if (!Array.isArray(row) || row.length !== 4) return bad("bad-shape");
      const [id, actor, t, title] = row as unknown[];
      if (!isStr(id) || !isStr(actor) || !isNum(t) || !isStr(title)) return bad("bad-shape");
      decisions.push({ id, actor, simTime: t, title });
    }
    return { ok: true, record: { version: 1, scenarioId: w.s, participants, events, decisions } };
  } catch {
    return bad("bad-shape");
  }
}
