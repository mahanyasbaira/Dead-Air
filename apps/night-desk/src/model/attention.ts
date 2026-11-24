// The player's attention as a kit LossSource. Pure: every choice depends on the
// intervals handed in and on the seeded PRNG the channel passes to `assess`.
import { runChannel } from "hindsight";
import type { ChannelEvent, ChannelSend, LossSource } from "hindsight";
import type { Attention, DeskScript, ItemDef, MissReason, NightLog } from "./types";

/** An action's busy time as an OPEN interval: a send exactly at `start` or `end` is not covered. */
export interface Interval {
  start: number;
  end: number;
  attention: Attention;
}

/** One interval per log entry whose action the script knows. Unknown actions are skipped. */
export function intervalsFromLog(script: DeskScript, log: { entries: readonly NightLog["entries"][number][] }): Interval[] {
  const out: Interval[] = [];
  for (const entry of log.entries) {
    const action = script.actions.find((a) => a.id === entry.actionId);
    if (action === undefined) continue;
    out.push({ start: entry.at, end: entry.at + action.cost, attention: action.attention });
  }
  return out;
}

export interface AttentionLoss {
  source: LossSource;
  /** Why each dropped item was dropped. Filled while the channel runs. */
  reasons: Map<string, MissReason>;
}

/**
 * The attention loss source plus the reason for every drop, recorded by the same
 * rules that decide it (no second state). One `prng.nextFloat()` is drawn per send
 * before any branch, so the stream position depends only on the number of sends.
 */
export function attentionLossWithReasons(
  script: DeskScript,
  intervals: readonly Interval[],
): AttentionLoss {
  const reasons = new Map<string, MissReason>();
  const items = new Map<string, ItemDef>(script.items.map((i) => [i.id, i]));
  const source: LossSource = {
    assess(send, prng) {
      const draw = prng.nextFloat();
      const t = send.sendTime;
      const item = send.id !== undefined ? items.get(send.id) : undefined;
      const keep = { payload: send.payload, corrupted: false };
      const drop = (reason: MissReason) => {
        if (send.id !== undefined) reasons.set(send.id, reason);
        return { dropped: true, delay: 0, ...keep };
      };
      const cover = intervals.find((iv) => iv.start < t && t < iv.end);
      if (cover === undefined || cover.attention === "desk") {
        return { dropped: false, delay: 0, ...keep };
      }
      if (cover.attention === "away" && item !== undefined && (item.source === "phone" || item.source === "door")) {
        return drop("away");
      }
      if (
        cover.attention === "busy" &&
        item !== undefined &&
        item.source === "phone" &&
        item.lapse !== undefined &&
        draw < item.lapse
      ) {
        return drop("lapse");
      }
      const delay = cover.end - t;
      if (item !== undefined && item.expiresAfter !== undefined && delay > item.expiresAfter) {
        return drop("expired");
      }
      return { dropped: false, delay, ...keep };
    },
  };
  return { source, reasons };
}

/** The attention model as a kit `LossSource`. */
export function attentionLoss(script: DeskScript, intervals: readonly Interval[]): LossSource {
  return attentionLossWithReasons(script, intervals).source;
}

export interface ItemRun {
  events: ChannelEvent[];
  reasons: Map<string, MissReason>;
}

/**
 * Run the given items through the kit channel under the attention model.
 * A `collision` outcome means two items share an arrival minute: a bug in the
 * script, so it throws a message naming the item.
 */
export function runItems(
  script: DeskScript,
  items: readonly ItemDef[],
  intervals: readonly Interval[],
): ItemRun {
  const sends: ChannelSend[] = items.map((item) => ({
    id: item.id,
    sender: item.source,
    recipient: "ra",
    sendTime: item.at,
    payload: new Uint8Array([0]),
  }));
  const { source, reasons } = attentionLossWithReasons(script, intervals);
  const events = runChannel(script.seed, source, sends);
  const clash = events.find((e) => e.kind === "collision");
  if (clash !== undefined) {
    throw new Error(
      `Night Desk script "${script.id}": item "${clash.id ?? "(no id)"}" collides with another item at minute ${clash.simTime}; arrival minutes must be distinct`,
    );
  }
  return { events, reasons };
}
