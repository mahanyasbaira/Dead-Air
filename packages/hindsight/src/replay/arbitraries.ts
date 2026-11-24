// Test-only generators for the replay layout. Not exported from the kit entries.
import fc from "fast-check";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { ledgerArb } from "../ledger/arbitraries";
import type { LayoutOptions, ReplayParticipant, WorldlineInput } from "./types";

const IDS = ["p1", "p2", "p3"] as const;

/** Participants over the ledger id pool, mixing complete and arrivals-only histories. */
export const participantsArb: fc.Arbitrary<ReplayParticipant[]> = fc
  .tuple(...IDS.map(() => fc.constantFrom("complete" as const, "arrivals-only" as const)))
  .map((histories) =>
    IDS.map((id, i) => ({ id, label: `Participant ${i + 1}`, history: histories[i] as "complete" | "arrivals-only" })),
  );

/** A cursor: the closed record (null), or any time from before the start to past the end. */
export const cursorArb: fc.Arbitrary<number | null> = fc.option(fc.integer({ min: -5, max: 45 }), { nil: null });

export const focusArb: fc.Arbitrary<string | null> = fc.option(fc.constantFrom(...IDS), { nil: null });

export const layoutOptionsArb: fc.Arbitrary<LayoutOptions> = fc.record({ at: cursorArb, focus: focusArb });

/** A scenario over p1..p3 with up to four decisions. */
export const scenarioArb: fc.Arbitrary<Scenario> = fc
  .array(
    fc.record({ actor: fc.constantFrom(...IDS), at: fc.integer({ min: 0, max: 40 }) }),
    { maxLength: 4 },
  )
  .map((ds) => {
    const base = buildParticipantsFixture([...IDS]);
    return {
      ...base,
      events: ds.map((d, i) => ({
        id: `d${i}`,
        type: "decision" as const,
        simTime: d.at,
        audience: d.actor,
        title: `Decision ${i}`,
        body: "",
        actor: d.actor,
      })),
    };
  });

export const worldlineInputArb: fc.Arbitrary<WorldlineInput> = fc
  .tuple(ledgerArb, scenarioArb, participantsArb)
  .map(([ledger, scenario, participants]) => ({ ledger, scenario, participants }));
