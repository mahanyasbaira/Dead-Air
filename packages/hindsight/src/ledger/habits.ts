// Channel habits: plain counts per participant, read from the log.
// Imports only from the ledger and the engine's types. Pure: no clock, no randomness, no DOM.
// A figure is `null` when the log cannot know it. There is no sort, no total and no rate.

import type { ParticipantId } from "../engine/types";
import { buildLedger, closedFates, contradictsSend, sentTimes } from "./ledger";
import type { Ledger } from "./ledger";

/** The two fields of a replay participant that habits need. Kept local so `ledger` never imports `replay`. */
export interface HabitParticipant {
  id: ParticipantId;
  history: "complete" | "arrivals-only";
}

export interface HabitOptions {
  /** True only when the caller records read-back. Without it the figure is not known. */
  readBackRecorded?: boolean;
}

export interface Habits {
  participant: ParticipantId;
  /** Sent events by this participant. */
  transmissions: number | null;
  /** Mean over this participant's sends that carry a size. */
  meanBytes: number | null;
  /** Mean over this participant's sends that carry an airtime, in sim-time units. */
  meanAirtime: number | null;
  /** This participant's messages that ended in a collision. */
  collisionsInvolved: number | null;
  /** Collided messages of this participant that began at or after an overlapping collided message of another participant. */
  collisionsCaused: number | null;
  /** Messages received intact that were read back before the participant's next decision. */
  readBack: { read: number; received: number } | null;
}

/** One fixed, generic line per column saying why the figure is worth a look. */
export const HABIT_WHY = {
  transmissions: "How often this participant put something on the line.",
  meanBytes: "Longer messages stay on the line longer and are easier to damage.",
  meanAirtime: "Time on the line is time nobody else can use it.",
  collisionsInvolved: "Messages that ended in a collision with another message.",
  collisionsCaused: "Collisions where this participant began sending second.",
  readBack: "Messages repeated back after they arrived, before the next decision.",
} as const;

export type HabitColumn = keyof typeof HABIT_WHY;

const EMPTY: Omit<Habits, "participant"> = {
  transmissions: null,
  meanBytes: null,
  meanAirtime: null,
  collisionsInvolved: null,
  collisionsCaused: null,
  readBack: null,
};

function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

interface CollidedSend {
  messageId: string;
  sender: ParticipantId;
  start: number;
  airtime: number | undefined;
}

export function computeHabits(
  l: Ledger,
  decisions: readonly { actor: ParticipantId; simTime: number }[],
  participants: readonly HabitParticipant[],
  options: HabitOptions = {},
): readonly Habits[] {
  const ledger = buildLedger(l.events);
  const fates = closedFates(ledger);
  const complete = new Set(participants.filter((p) => p.history === "complete").map((p) => p.id));

  // Sends from an arrivals-only participant are not part of a complete history; they are never counted.
  const sends = ledger.events.flatMap((e) => (e.kind === "sent" && complete.has(e.sender) ? [e] : []));
  const collided: CollidedSend[] = sends
    .filter((e) => fates.get(e.messageId) === "collision")
    .map((e) => ({ messageId: e.messageId, sender: e.sender, start: e.simTime, airtime: e.airtime }));

  // First receipt time per message and recipient (the recipient of a send is the last `sent` event's).
  const recipientOf = new Map<string, ParticipantId>();
  for (const e of ledger.events) if (e.kind === "sent") recipientOf.set(e.messageId, e.recipient);
  const receivedAt = new Map<ParticipantId, Map<string, number>>();
  const noteReceived = (p: ParticipantId, id: string, t: number) => {
    const m = receivedAt.get(p) ?? new Map<string, number>();
    const prior = m.get(id);
    if (prior === undefined || t < prior) m.set(id, t);
    receivedAt.set(p, m);
  };
  const firstSend = sentTimes(ledger);
  for (const e of ledger.events) {
    // An outcome or arrival earlier than its message's first send is contradictory and ignored.
    if (contradictsSend(e, "messageId" in e ? firstSend.get(e.messageId) : undefined)) continue;
    if (e.kind === "outcome" && e.outcome === "received") {
      const to = recipientOf.get(e.messageId);
      if (to !== undefined) noteReceived(to, e.messageId, e.simTime);
    } else if (e.kind === "arrival" && e.outcome === "received") {
      noteReceived(e.recipient, e.messageId, e.simTime);
    }
  }

  return participants.map((p): Habits => {
    if (p.history !== "complete") return { participant: p.id, ...EMPTY };

    const own = sends.filter((e) => e.sender === p.id);
    const bytes = own.flatMap((e) => (e.bytes === undefined ? [] : [e.bytes]));
    const airtimes = own.flatMap((e) => (e.airtime === undefined ? [] : [e.airtime]));

    const ownCollided = collided.filter((c) => c.sender === p.id);
    const involved = new Set(ownCollided.map((c) => c.messageId)).size;

    let caused: number | null = 0;
    if (ownCollided.length > 0) {
      const others = collided.filter((c) => c.sender !== p.id);
      const unknown = ownCollided.some((c) => c.airtime === undefined) || others.some((c) => c.airtime === undefined);
      if (unknown) caused = null;
      else {
        const second = new Set<string>();
        for (const m of ownCollided) {
          const mEnd = m.start + (m.airtime as number);
          for (const n of others) {
            const nEnd = n.start + (n.airtime as number);
            if (m.start < nEnd && n.start < mEnd && m.start >= n.start) second.add(m.messageId);
          }
        }
        caused = second.size;
      }
    }

    let readBack: Habits["readBack"] = null;
    if (options.readBackRecorded === true) {
      const received = receivedAt.get(p.id) ?? new Map<string, number>();
      const own = decisions.filter((d) => d.actor === p.id).map((d) => d.simTime);
      let read = 0;
      for (const [id, r] of received) {
        const later = own.filter((t) => t >= r);
        const limit = later.length === 0 ? Infinity : Math.min(...later);
        if (ledger.events.some((e) => e.kind === "readback" && e.participant === p.id && e.messageId === id && e.simTime >= r && e.simTime <= limit))
          read++;
      }
      readBack = { read, received: received.size };
    }

    return {
      participant: p.id,
      transmissions: own.length,
      meanBytes: mean(bytes),
      meanAirtime: mean(airtimes),
      collisionsInvolved: involved,
      collisionsCaused: caused,
      readBack,
    };
  });
}
