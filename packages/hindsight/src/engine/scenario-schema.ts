import type { Scenario } from "./types";

/** One problem found in an input, located by a path such as `events[2].audience`. */
export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: ValidationError[] };

const EVENT_TYPES: ReadonlySet<string> = new Set([
  "info",
  "message_created",
  "message_delivered",
  "decision",
  "debrief",
]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Reads an own property only, so "__proto__" and inherited names are never resolved. */
function own(o: Record<string, unknown>, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

const key = (k: string): string => `[${JSON.stringify(k)}]`;

function collect(input: unknown, errors: ValidationError[]): void {
  const err = (path: string, message: string) => errors.push({ path, message });
  const needString = (o: Record<string, unknown>, field: string, path: string) => {
    const v = own(o, field);
    if (v === undefined) err(path, "is required");
    else if (typeof v !== "string") err(path, "must be a string");
  };

  if (!isRecord(input)) {
    err("", "must be an object");
    return;
  }
  for (const f of ["id", "title", "simulationNotice", "summary"]) needString(input, f, f);

  // Participants.
  const declared = new Set<string>();
  const roles = own(input, "roles");
  if (roles === undefined) err("roles", "is required");
  else if (!Array.isArray(roles)) err("roles", "must be an array");
  else {
    for (let i = 0; i < roles.length; i++) {
      const p = `roles[${i}]`;
      const r: unknown = roles[i];
      if (!isRecord(r)) {
        err(p, "must be an object");
        continue;
      }
      needString(r, "name", `${p}.name`);
      needString(r, "blurb", `${p}.blurb`);
      const id = own(r, "id");
      if (typeof id !== "string") {
        err(`${p}.id`, id === undefined ? "is required" : "must be a string");
      } else if (id === "all") {
        err(`${p}.id`, 'must not be "all"; it is reserved for the shared audience');
      } else if (declared.has(id)) {
        err(`${p}.id`, `duplicate participant id ${JSON.stringify(id)}`);
      } else declared.add(id);
    }
  }

  // Events.
  const events = own(input, "events");
  if (events === undefined) err("events", "is required");
  else if (!Array.isArray(events)) err("events", "must be an array");
  else {
    const byId = new Map<string, { index: number; simTime: unknown }>();
    for (let i = 0; i < events.length; i++) {
      const e: unknown = events[i];
      if (!isRecord(e)) continue;
      const id = own(e, "id");
      if (typeof id !== "string") continue;
      if (byId.has(id)) err(`events[${i}].id`, `duplicate event id ${JSON.stringify(id)}`);
      else byId.set(id, { index: i, simTime: own(e, "simTime") });
    }
    for (let i = 0; i < events.length; i++) {
      const p = `events[${i}]`;
      const e: unknown = events[i];
      if (!isRecord(e)) {
        err(p, "must be an object");
        continue;
      }
      const id = own(e, "id");
      if (id === undefined) err(`${p}.id`, "is required");
      else if (typeof id !== "string") err(`${p}.id`, "must be a string");
      needString(e, "title", `${p}.title`);
      needString(e, "body", `${p}.body`);

      const type = own(e, "type");
      if (typeof type !== "string" || !EVENT_TYPES.has(type)) {
        err(`${p}.type`, "must be one of info, message_created, message_delivered, decision, debrief");
      }
      const t = own(e, "simTime");
      if (typeof t !== "number" || !Number.isInteger(t) || t < 0) {
        err(`${p}.simTime`, "must be a non-negative integer");
      }
      const aud = own(e, "audience");
      if (typeof aud !== "string") err(`${p}.audience`, aud === undefined ? "is required" : "must be a string");
      else if (aud !== "all" && !declared.has(aud)) {
        err(`${p}.audience`, `names no declared participant: ${JSON.stringify(aud)}`);
      }
      const actor = own(e, "actor");
      if (actor !== undefined) {
        if (typeof actor !== "string") err(`${p}.actor`, "must be a string");
        else if (!declared.has(actor)) err(`${p}.actor`, `names no declared participant: ${JSON.stringify(actor)}`);
      }
      const link = own(e, "linkedTo");
      if (link !== undefined) {
        if (typeof link !== "string") err(`${p}.linkedTo`, "must be a string");
        else {
          const target = byId.get(link);
          if (!target) err(`${p}.linkedTo`, `names no event: ${JSON.stringify(link)}`);
          else if (type === "message_delivered") {
            const earlier =
              target.index < i && typeof target.simTime === "number" && typeof t === "number" && target.simTime <= t;
            if (!earlier) err(`${p}.linkedTo`, `must name an earlier event: ${JSON.stringify(link)}`);
          }
        }
      }
    }
  }

  // Decision prompts.
  const prompts = own(input, "decisionPrompts");
  if (prompts === undefined) err("decisionPrompts", "is required");
  else if (!isRecord(prompts)) err("decisionPrompts", "must be an object");
  else {
    for (const k of Object.keys(prompts)) {
      const p = `decisionPrompts${key(k)}`;
      if (!declared.has(k)) err(p, `names no declared participant: ${JSON.stringify(k)}`);
      const v = own(prompts, k);
      if (!isRecord(v)) {
        err(p, "must be an object");
        continue;
      }
      needString(v, "prompt", `${p}.prompt`);
      const opts = own(v, "options");
      if (opts === undefined) err(`${p}.options`, "is required");
      else if (!Array.isArray(opts)) err(`${p}.options`, "must be an array");
      else {
        for (let j = 0; j < opts.length; j++) {
          const o: unknown = opts[j];
          if (!isRecord(o)) {
            err(`${p}.options[${j}]`, "must be an object");
            continue;
          }
          needString(o, "id", `${p}.options[${j}].id`);
          needString(o, "label", `${p}.options[${j}].label`);
        }
      }
    }
  }

  // Discussion prompts.
  const disc = own(input, "discussionPrompts");
  if (disc === undefined) err("discussionPrompts", "is required");
  else if (!Array.isArray(disc)) err("discussionPrompts", "must be an array");
  else {
    for (let i = 0; i < disc.length; i++) {
      if (typeof disc[i] !== "string") err(`discussionPrompts[${i}]`, "must be a string");
    }
  }
}

/**
 * Validates an unknown value against the `Scenario` shape. Never throws; returns every
 * problem found, each with a path. Whether options, debrief and timing make a playable
 * run is left to `checkScenario`.
 */
export function validateScenario(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  try {
    collect(input, errors);
  } catch {
    errors.push({ path: "", message: "input could not be read" });
  }
  return errors.length === 0 ? { ok: true, scenario: input as Scenario } : { ok: false, errors };
}
