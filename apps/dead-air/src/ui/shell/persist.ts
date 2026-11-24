/**
 * Run persistence (consoles Req 6.1, design "serialize/restore").
 *
 * A run is stored as JSON under one local-storage key. The state is never
 * stored: `restore` validates the stored log and replays it through
 * `deriveState` (the engine reducer behind the decision lock), so a restored
 * run is exactly the run that was saved.
 *
 * Bytes: a wire event's `payload` (Uint8Array) does not survive JSON, so it is
 * written as a base64 string and decoded back to a Uint8Array on restore.
 *
 * Versioning: a send's optional numeric `airtime` was added the same way, with
 * no version change: a save without it restores as before. send entries (`kind: "send"`) were added without bumping
 * `version`. The change is additive: a save without them restores exactly as
 * before, and a reader from before the change meets an unknown entry kind, which
 * `decodeEntry` rejects as `bad-entry`; RunHost then keeps that save untouched
 * rather than clearing it. So an older build never loses a newer save.
 *
 * Nothing here throws. Bad JSON, an unknown version or scenario, a malformed
 * entry, or a failing `Storage` all come back as a typed discard result so the
 * Shell can start a fresh run.
 */
import { scenarios } from "../../scenarios/static-on-channel-9";
import { deriveState } from "./log";
import type {
  ConsoleLogEntry,
  PersistedRun,
  PlayMode,
  Scenario,
  SendRecord,
  SimState,
  TransportEvent,
} from "./types";

export const STORAGE_KEY = "dead-air:run";

const MODES: readonly PlayMode[] = ["solo", "loopback", "acoustic"];
const WIRE_KINDS: readonly TransportEvent["kind"][] = ["received", "garbled", "collision"];

export type DiscardReason =
  | "empty"
  | "bad-json"
  | "bad-shape"
  | "unknown-version"
  | "unknown-scenario"
  | "bad-entry"
  | "storage-error";

export type RestoreResult =
  | { ok: true; run: PersistedRun; state: SimState }
  | { ok: false; reason: DiscardReason; detail?: string };

export type SaveResult = { ok: true } | { ok: false; reason: "storage-error" };

// ---- bytes ----------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ---- write ----------------------------------------------------------------

function encodeEntry(entry: ConsoleLogEntry): unknown {
  if (entry.kind === "decision" || entry.kind === "send") return entry;
  const { payload, ...rest } = entry.event;
  return {
    kind: "wire",
    event: payload === undefined ? rest : { ...rest, payload: toBase64(payload) },
  };
}

/** The JSON text written to storage. Payload bytes are base64 strings. */
export function serialize(run: PersistedRun): string {
  return JSON.stringify({ ...run, log: run.log.map(encodeEntry) });
}

/** Write a run to storage. Storage failures (quota, private mode) are a value. */
export function save(storage: Pick<Storage, "setItem">, run: PersistedRun): SaveResult {
  try {
    storage.setItem(STORAGE_KEY, serialize(run));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

/** Remove any stored run. Never throws. */
export function clear(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

// ---- read -----------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function decodeWire(raw: unknown): TransportEvent | null {
  if (!isRec(raw)) return null;
  const { kind, simTime, sender, recipient, id, payload } = raw;
  if (!isStr(kind) || !(WIRE_KINDS as readonly string[]).includes(kind)) return null;
  if (!isNum(simTime) || !isStr(sender) || !isStr(recipient)) return null;
  if (id !== undefined && !isStr(id)) return null;
  if (payload !== undefined && kind !== "received") return null;
  const event: TransportEvent = { kind: kind as TransportEvent["kind"], simTime, sender, recipient };
  if (id !== undefined) event.id = id;
  if (payload !== undefined) {
    if (!isStr(payload)) return null;
    const bytes = fromBase64(payload);
    if (!bytes) return null;
    event.payload = bytes;
  }
  return event;
}

function decodeSend(raw: unknown): SendRecord | null {
  if (!isRec(raw)) return null;
  const { id, sender, recipient, sendTime, bytes, airtime } = raw;
  if (!isStr(id) || !isStr(sender) || !isStr(recipient) || !isNum(sendTime)) return null;
  if (!isNum(bytes) || !Number.isInteger(bytes) || bytes < 0) return null;
  // Optional and additive: absent in older saves, so no version change.
  if (airtime !== undefined && (!isNum(airtime) || airtime < 0)) return null;
  return airtime === undefined ? { id, sender, recipient, sendTime, bytes } : { id, sender, recipient, sendTime, bytes, airtime };
}

function decodeEntry(raw: unknown, scenario: Scenario): ConsoleLogEntry | null {
  if (!isRec(raw)) return null;
  if (raw.kind === "send") {
    const send = decodeSend(raw.send);
    return send ? { kind: "send", send } : null;
  }
  if (raw.kind === "wire") {
    const event = decodeWire(raw.event);
    return event ? { kind: "wire", event } : null;
  }
  if (raw.kind === "decision" && isRec(raw.decision)) {
    const { role, optionId, recordedAtSimTime } = raw.decision;
    if (!isStr(role) || !isStr(optionId) || !isNum(recordedAtSimTime)) return null;
    // Own keys only: a role of "constructor" or "__proto__" must not resolve.
    if (!Object.prototype.hasOwnProperty.call(scenario.decisionPrompts, role)) return null;
    const prompt = scenario.decisionPrompts[role];
    if (!prompt || !prompt.options.some((o) => o.id === optionId)) return null;
    return { kind: "decision", decision: { role, optionId, recordedAtSimTime } };
  }
  return null;
}

/**
 * Validate stored text and replay it. `raw` is what `getItem` returned
 * (null when nothing is stored).
 */
export function restore(raw: string | null): RestoreResult {
  if (raw === null || raw === "") return { ok: false, reason: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad-json" };
  }
  if (!isRec(parsed)) return { ok: false, reason: "bad-shape" };
  if (parsed.version !== 1) return { ok: false, reason: "unknown-version" };
  const { scenarioId, seed, mode, log } = parsed;
  if (!isStr(scenarioId)) return { ok: false, reason: "bad-shape", detail: "scenarioId" };
  if (!isNum(seed)) return { ok: false, reason: "bad-shape", detail: "seed" };
  if (!isStr(mode) || !(MODES as readonly string[]).includes(mode)) {
    return { ok: false, reason: "bad-shape", detail: "mode" };
  }
  if (!Array.isArray(log)) return { ok: false, reason: "bad-shape", detail: "log" };
  if (!Object.prototype.hasOwnProperty.call(scenarios, scenarioId)) {
    return { ok: false, reason: "unknown-scenario" };
  }
  const scenario = scenarios[scenarioId];
  const entries: ConsoleLogEntry[] = [];
  for (let i = 0; i < log.length; i++) {
    const entry = decodeEntry(log[i], scenario);
    if (!entry) return { ok: false, reason: "bad-entry", detail: `entry ${i}` };
    entries.push(entry);
  }
  const run: PersistedRun = { version: 1, scenarioId, seed, mode: mode as PlayMode, log: entries };
  try {
    return { ok: true, run, state: deriveState(scenario, entries) };
  } catch {
    return { ok: false, reason: "bad-entry", detail: "replay failed" };
  }
}

/** Read and restore the stored run. A throwing `Storage` is a discard. */
export function load(storage: Pick<Storage, "getItem">): RestoreResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: "storage-error" };
  }
  return restore(raw);
}
