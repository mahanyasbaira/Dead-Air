// Adapter: channel sends and the engine's channel log become ledger events.
// Reads only `ChannelLog` from the engine, so `ledger` stays below `channel`.

import type { ChannelLog } from "../engine/channel-log";
import type { LedgerEvent } from "./ledger";

/**
 * An outcome whose id matches a send becomes an `outcome`. An outcome whose id has
 * no send becomes an `arrival` (the send time is not known). Entries with no id are skipped.
 */
export function ledgerFromChannel(
  sends: readonly {
    id: string;
    sender: string;
    recipient: string;
    sendTime: number;
    bytes?: number;
    airtime?: number;
  }[],
  log: ChannelLog,
): LedgerEvent[] {
  const events: LedgerEvent[] = sends.map((s) => {
    const e: LedgerEvent = {
      kind: "sent",
      messageId: s.id,
      sender: s.sender,
      recipient: s.recipient,
      simTime: s.sendTime,
    };
    if (s.bytes !== undefined) e.bytes = s.bytes;
    if (s.airtime !== undefined) e.airtime = s.airtime;
    return e;
  });
  const sentIds = new Set(sends.map((s) => s.id));
  for (const entry of log) {
    if (entry.id === undefined) continue;
    if (sentIds.has(entry.id)) {
      events.push({
        kind: "outcome",
        messageId: entry.id,
        outcome: entry.outcome,
        simTime: entry.simTime,
      });
    } else {
      events.push({
        kind: "arrival",
        messageId: entry.id,
        sender: entry.sender,
        recipient: entry.recipient,
        outcome: entry.outcome,
        simTime: entry.simTime,
      });
    }
  }
  return events;
}
