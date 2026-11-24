import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  CarrierState,
  ConsoleLogEntry,
  PersistedRun,
  PlayMode,
  RecordedDecision,
  RoleId,
  Scenario,
  SimEvent,
  SimState,
  Transport,
  TransportEvent,
  TransportFrame,
  TransportMode,
} from "./types";
import type {
  RecordedDecision as KitRecordedDecision,
  RoleId as KitRoleId,
  Scenario as KitScenario,
  SimEvent as KitSimEvent,
  SimState as KitSimState,
} from "hindsight";
import type * as T from "../../transport/types";

describe("ui shell types", () => {
  it("re-exports engine types from the kit unchanged", () => {
    expectTypeOf<Scenario>().toEqualTypeOf<KitScenario>();
    expectTypeOf<SimEvent>().toEqualTypeOf<KitSimEvent>();
    expectTypeOf<SimState>().toEqualTypeOf<KitSimState>();
    expectTypeOf<RecordedDecision>().toEqualTypeOf<KitRecordedDecision>();
    expectTypeOf<RoleId>().toEqualTypeOf<KitRoleId>();
  });

  it("re-exports transport types unchanged", () => {
    expectTypeOf<Transport>().toEqualTypeOf<T.Transport>();
    expectTypeOf<TransportEvent>().toEqualTypeOf<T.TransportEvent>();
    expectTypeOf<TransportFrame>().toEqualTypeOf<T.TransportFrame>();
    expectTypeOf<TransportMode>().toEqualTypeOf<T.TransportMode>();
  });

  it("PlayMode is exactly solo, loopback and acoustic", () => {
    expectTypeOf<PlayMode>().toEqualTypeOf<"solo" | "loopback" | "acoustic">();
    const modes: Record<PlayMode, true> = { solo: true, loopback: true, acoustic: true };
    expect(Object.keys(modes).sort()).toEqual(["acoustic", "loopback", "solo"]);
  });

  it("CarrierState has the four lamp labels", () => {
    expectTypeOf<CarrierState>().toEqualTypeOf<"IDLE" | "SENDING" | "RECEIVING" | "COLLISION">();
  });

  it("a persisted run holds wire and decision entries", () => {
    expectTypeOf<PersistedRun["log"]>().toEqualTypeOf<ConsoleLogEntry[]>();
    expectTypeOf<PersistedRun["version"]>().toEqualTypeOf<1>();
  });
});
