// Night Desk model types. Plain data only: no React, no DOM, no clock, no randomness.

export type SourceId = "phone" | "door" | "chat" | "note" | "staff";
export type Attention = "desk" | "busy" | "away";
export type ActionKind = "respond" | "go" | "callStaff" | "log" | "wait";

export interface ItemDef {
  /** Equals the id of a message_created event in the Scenario. */
  id: string;
  /** Sender in the channel; the recipient is always "ra". */
  source: SourceId;
  /** Arrival minute; distinct across the script. */
  at: number;
  kind: "call" | "knock" | "message" | "note";
  /** Drop if it would wait longer than this many minutes. */
  expiresAfter?: number;
  /** 0..1, chance a busy player misses a phone item. */
  lapse?: number;
  /** A moment the scenario marks as needing a professional. */
  needsProfessional?: true;
  /** Optional clip under public/voice/. */
  voice?: { file: string };
}

export interface ActionDef {
  id: string;
  label: string;
  /** Single character, unique per script. */
  key: string;
  kind: ActionKind;
  /** Integer minutes >= 1. */
  cost: number;
  /** desk: items arrive at once; busy: they queue; away: phone and door are lost. */
  attention: Attention;
  /** Item id that must have reached the player. */
  requires?: string;
  once?: true;
}

export interface GuideStep {
  id: string;
  /** One instruction. */
  text: string;
  done: { actionId?: string; kind?: ActionKind };
}

export interface DeskScript {
  /** Equals Scenario.id. */
  id: string;
  /** Bumped when the script changes; carried by logs and links. */
  rev: number;
  /** uint32. */
  seed: number;
  /** Position in the picker. */
  order: number;
  /** Minutes after midnight, for display only. */
  startClock: number;
  /** The night ends when the clock reaches this minute. */
  endsAt: number;
  guided?: true;
  items: ItemDef[];
  actions: ActionDef[];
  guide?: GuideStep[];
  /** For the picker filters. */
  tags: string[];
}

export interface LogEntry {
  /** Start minute of the action; must equal the running clock. */
  at: number;
  actionId: string;
  itemId?: string;
  facts?: string[];
}

export interface NightLog {
  v: 1;
  scenarioId: string;
  rev: number;
  seed: number;
  entries: LogEntry[];
}

export interface DeliveredItem {
  id: string;
  source: SourceId;
  sentAt: number;
  deliveredAt: number;
}

export type MissReason = "away" | "lapse" | "expired";

export interface MissedItem {
  id: string;
  source: SourceId;
  sentAt: number;
  reason: MissReason;
  /** A neutral label ("Missed call"); never the item's body text. */
  label: string;
}

export interface NightState {
  now: number;
  ended: boolean;
  /** Ordered by deliveredAt, then id. */
  delivered: DeliveredItem[];
  /** Ordered by sentAt, then id. Label and time only. */
  missed: MissedItem[];
  entries: LogEntry[];
  staffCalledAt: number | null;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type LogErrorKind =
  | "wrong-script"
  | "unknown-action"
  | "clock-mismatch"
  | "night-ended"
  | "unmet-requires"
  | "repeated-once"
  | "unknown-fact"
  | "unknown-item";

export interface LogError {
  kind: LogErrorKind;
  /** Index of the offending entry (for applyAction, the index it would have had). */
  index: number;
  message: string;
}
