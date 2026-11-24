// Hindsight kit, core entry. Headless: no React, DOM or audio.
export type {
  ParticipantId,
  RoleId,
  Audience,
  Role,
  EventType,
  SimEvent,
  DecisionOption,
  Scenario,
  RecordedDecision,
  PlayLog,
  SimState,
} from "./engine/types";
export {
  emptyChannelLog,
  toChannelLogEntry,
  appendChannelEvent,
  replayChannelLog,
} from "./engine/channel-log";
export type {
  ChannelLog,
  ChannelLogEntry,
  ChannelOutcome,
  ChannelOutcomeKind,
} from "./engine/channel-log";
export {
  reduce,
  initialState,
  nextSimTime,
  timelineSteps,
  messageTimings,
  buildDebrief,
  replay,
} from "./engine/reducer";
export type { Action, Debrief, DebriefRow, MessageTiming } from "./engine/reducer";
export { visibleToRole, eventsForRole, allEvents, orderEvents } from "./engine/audience";
export { validateScenario } from "./engine/scenario-schema";
export type { ValidationError, ValidationResult } from "./engine/scenario-schema";
export { checkScenario } from "./engine/scenario-check";
export type { CheckName, CheckResult } from "./engine/scenario-check";
export { parseBrief, printBrief } from "./engine/brief";
export type { Brief, BriefError, BriefResult } from "./engine/brief";
export { Prng, createPrng } from "./channel/prng";
export { createClock } from "./channel/clock";
export type { SimClock } from "./channel/clock";
export { runChannel, profileLoss, DEFAULT_AIRTIME } from "./channel/channel";
export type {
  ChannelProfile,
  ChannelSend,
  ChannelEvent,
  LossSource,
  Impairment,
} from "./channel/channel";
export { buildLedger, knownAt, inTransitAt, lostAt, closedFates, orphanOutcomes } from "./ledger/ledger";
export type { LedgerEvent, Ledger, ClosedFate } from "./ledger/ledger";
export { ledgerFromChannel } from "./ledger/from-channel";
export { clearLine, gainAt } from "./ledger/clear-line";
export { computeHabits, HABIT_WHY } from "./ledger/habits";
export type { Habits, HabitOptions, HabitParticipant, HabitColumn } from "./ledger/habits";
