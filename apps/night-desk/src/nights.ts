/// <reference types="vite/client" />
// Registry of nights: each scenario file joined to its desk file by id, sorted by `order`.
import type { Scenario } from "hindsight";
import type { DeskScript } from "./model/types";

export interface Night {
  id: string;
  scenario: Scenario;
  script: DeskScript;
}

const scenarioFiles = import.meta.glob(["../scenarios/*.ts", "!../scenarios/*.test.ts"], {
  eager: true,
}) as Record<string, Record<string, unknown>>;
const deskFiles = import.meta.glob(["../scenarios/desk/*.ts", "!../scenarios/desk/*.test.ts"], {
  eager: true,
}) as Record<string, { default?: DeskScript }>;

function build(): Night[] {
  const scripts = new Map<string, DeskScript>();
  for (const mod of Object.values(deskFiles)) {
    if (mod.default !== undefined) scripts.set(mod.default.id, mod.default);
  }
  const out: Night[] = [];
  for (const mod of Object.values(scenarioFiles)) {
    for (const value of Object.values(mod)) {
      const scenario = value as Scenario;
      const script = scripts.get(scenario.id);
      if (script !== undefined) out.push({ id: scenario.id, scenario, script });
    }
  }
  return out.sort((a, b) => a.script.order - b.script.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const nights: readonly Night[] = build();

export function findNight(id: string): Night | undefined {
  return nights.find((n) => n.id === id);
}
