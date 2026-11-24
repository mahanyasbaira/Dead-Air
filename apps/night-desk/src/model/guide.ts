import type { DeskScript, GuideStep, NightState } from "./types";

function satisfied(script: DeskScript, state: NightState, step: GuideStep): boolean {
  return state.entries.some((entry) => {
    const { actionId, kind } = step.done;
    if (actionId !== undefined && entry.actionId !== actionId) return false;
    if (kind !== undefined) {
      const action = script.actions.find((a) => a.id === entry.actionId);
      if (action?.kind !== kind) return false;
    }
    return true;
  });
}

/**
 * The first guide step no entry satisfies, or null when the script is not guided
 * or every step is done. A step with an empty `done` is satisfied by any entry.
 */
export function currentStep(script: DeskScript, state: NightState): GuideStep | null {
  if (script.guided !== true || script.guide === undefined) return null;
  return script.guide.find((step) => !satisfied(script, state, step)) ?? null;
}
