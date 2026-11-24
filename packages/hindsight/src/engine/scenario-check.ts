import { timelineSteps } from "./reducer";
import { validateScenario } from "./scenario-schema";
import type { Scenario } from "./types";

export type CheckName = "validates" | "beats-reachable" | "run-ends" | "decisions-have-options";

export interface CheckResult {
  name: CheckName;
  ok: boolean;
  /** One line per failure, naming the event id, participant id or path involved. */
  details: string[];
}

const SKIPPED = "skipped: the scenario does not validate";

function result(name: CheckName, details: string[]): CheckResult {
  return { name, ok: details.length === 0, details };
}

/** Runs the four named scenario checks. Never throws. */
export function checkScenario(s: Scenario): CheckResult[] {
  const v = validateScenario(s);
  const validates = result(
    "validates",
    v.ok ? [] : v.errors.map((e) => `${e.path || "(root)"}: ${e.message}`),
  );
  if (!v.ok) {
    return [
      validates,
      { name: "beats-reachable", ok: false, details: [SKIPPED] },
      { name: "run-ends", ok: false, details: [SKIPPED] },
      { name: "decisions-have-options", ok: false, details: [SKIPPED] },
    ];
  }

  const debriefs = s.events.filter((e) => e.type === "debrief");

  // beats-reachable: every beat sits in [0, endTime] and is not linked to a beat that never occurs.
  const reach: string[] = [];
  if (debriefs.length === 0) {
    reach.push("no debrief event, so no beat has an end time to reach");
  } else {
    const endTime = Math.min(...debriefs.map((e) => e.simTime));
    const unreachable = new Set<string>();
    for (const e of s.events) {
      if (e.simTime < 0 || e.simTime > endTime) {
        unreachable.add(e.id);
        reach.push(`event ${JSON.stringify(e.id)} at ${e.simTime} is outside 0..${endTime}`);
      }
    }
    for (const e of s.events) {
      if (e.type === "message_delivered" && e.linkedTo !== undefined && unreachable.has(e.linkedTo) && !unreachable.has(e.id)) {
        unreachable.add(e.id);
        reach.push(`event ${JSON.stringify(e.id)} depends on unreachable event ${JSON.stringify(e.linkedTo)}`);
      }
    }
  }

  // run-ends: exactly one debrief and nothing after it.
  const end: string[] = [];
  if (debriefs.length === 0) end.push("no debrief event");
  else if (debriefs.length > 1) end.push(`${debriefs.length} debrief events; exactly one is required`);
  else {
    const endTime = debriefs[0].simTime;
    for (const e of s.events) {
      if (e.simTime > endTime) end.push(`event ${JSON.stringify(e.id)} at ${e.simTime} is after the debrief at ${endTime}`);
    }
    const steps = timelineSteps(s);
    if (steps.length === 0 || steps[steps.length - 1] !== endTime) end.push("the timeline does not reach the debrief time");
  }

  // decisions-have-options: at least two options with unique ids.
  const opts: string[] = [];
  for (const k of Object.keys(s.decisionPrompts)) {
    const list = Object.getOwnPropertyDescriptor(s.decisionPrompts, k)?.value.options as { id: string }[];
    if (list.length < 2) opts.push(`decisionPrompts[${JSON.stringify(k)}] has ${list.length} option(s); at least 2 are required`);
    const ids = new Set(list.map((o) => o.id));
    if (ids.size !== list.length) opts.push(`decisionPrompts[${JSON.stringify(k)}] has duplicate option ids`);
  }

  return [validates, result("beats-reachable", reach), result("run-ends", end), result("decisions-have-options", opts)];
}
