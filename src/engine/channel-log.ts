// Engine-side adapter for channel/transport outcomes (requirement 5).
//
// The engine integration is satisfied by transports emitting plain event
// objects the engine understands — the engine never reaches outward into
// transport/channel (design "Scope and boundaries"; import direction
// stays one-way `transport -> channel -> engine`). To keep that boundary,
// this module imports NOTHING from those folders. It declares its own local
// structural type, `ChannelOutcome`, that matches the channel event shape
// `{ kind, simTime, sender, recipient, payload? }` by structure. Any
// `ChannelEvent` / `TransportEvent` value already satisfies it, so a transport
// listener can hand its event straight here with no reshaping.
//
// Pure and append-only: `appendChannelEvent` produces exactly one new log entry
// per outcome (requirement 5.1) and `replayChannelLog` folds a whole log through
// the same step function to a final state (requirement 5.2, property P6). No DOM,
// no audio, no randomness — replay touches no transport.

/** The three outcome kinds a transport reports. */
export type ChannelOutcomeKind = "received" | "garbled" | "collision";

/**
 * A transport/channel outcome, described structurally so this engine module
 * depends on no transport/channel import. The channel's `ChannelEvent` and the
 * transport's `TransportEvent` are assignable to this shape.
 */
export interface ChannelOutcome {
  kind: ChannelOutcomeKind;
  /** Sim-time the outcome is observed by the recipient (engine's integer unit). */
  simTime: number;
  sender: string;
  recipient: string;
  /** Present only on a `received` outcome: the recovered payload bytes. */
  payload?: Uint8Array;
}

/**
 * One appended entry in the engine's channel log. Exactly the four fields
 * requirement 5.1 names — sim-time, sender, recipient, outcome — plus the
 * recovered payload when (and only when) the outcome is `received`.
 *
 * The payload is copied on append so the stored entry is independent of the
 * caller's buffer: replaying the same outcomes always yields equal entries.
 */
export interface ChannelLogEntry {
  readonly outcome: ChannelOutcomeKind;
  readonly simTime: number;
  readonly sender: string;
  readonly recipient: string;
  readonly payload?: Uint8Array;
}

/** The append-only channel log: entries in the order they were appended. */
export type ChannelLog = readonly ChannelLogEntry[];

/** The empty log a run starts from. */
export const emptyChannelLog: ChannelLog = [];

/**
 * Map one transport/channel outcome to exactly one log entry (requirement 5.1).
 *
 * Deterministic and total: every `received | garbled | collision` outcome
 * produces one well-formed entry carrying sim-time, sender, recipient and the
 * outcome kind. A `received` outcome additionally carries a defensive copy of
 * the recovered payload; the other kinds never carry a payload.
 */
export function toChannelLogEntry(event: ChannelOutcome): ChannelLogEntry {
  const base = {
    outcome: event.kind,
    simTime: event.simTime,
    sender: event.sender,
    recipient: event.recipient,
  };
  if (event.kind === "received" && event.payload !== undefined) {
    return { ...base, payload: event.payload.slice() };
  }
  return base;
}

/**
 * Append exactly one entry per outcome to the log (requirement 5.1). Pure: it
 * returns a new array and never mutates the input, so the same `(log, event)`
 * always yields an equal result.
 */
export function appendChannelEvent(
  log: ChannelLog,
  event: ChannelOutcome,
): ChannelLog {
  return [...log, toChannelLogEntry(event)];
}

/**
 * Fold a sequence of outcomes into a channel log (requirement 5.2, property P6).
 *
 * This is the engine's deterministic replay for channel events: appending every
 * outcome in order. Given the same outcomes in the same order it always reaches
 * the same log, and it calls no transport — it reads only the plain outcome
 * objects it is handed. Extends the engine's existing deterministic replay to
 * the new channel event kinds rather than replacing it.
 */
export function replayChannelLog(events: readonly ChannelOutcome[]): ChannelLog {
  return events.reduce<ChannelLog>(appendChannelEvent, emptyChannelLog);
}
