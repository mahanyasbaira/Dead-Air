import type { Scenario } from "hindsight";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";

// The scenario data lives in apps/dead-air/scenarios/ so the scenario test and the
// brief hook find it beside its brief. This path stays for the UI and engine.test.ts.
export { staticOnChannel9 };

export const scenarios: Record<string, Scenario> = {
  [staticOnChannel9.id]: staticOnChannel9,
};
