// Participants for the layout: defaults, line styles and the generic limit wording.
// Pure. No wording here may name an app or one of its modes.
import type { Scenario } from "../engine/types";
import type { Ledger } from "../ledger/ledger";
import type { HistoryKnowledge, ParticipantStyle, ReplayParticipant } from "./types";

/** Role styles by index among the roles. Weight and dash only; one colour. */
export const ROLE_STYLES: readonly ParticipantStyle[] = [
  { strokeWidth: 1.5, labelWeight: 400, dash: "", colour: "ink" },
  { strokeWidth: 2.5, labelWeight: 500, dash: "6 4", colour: "ink" },
  { strokeWidth: 1.5, labelWeight: 400, dash: "2 3", colour: "ink" },
  { strokeWidth: 2.5, labelWeight: 500, dash: "", colour: "ink" },
];

/** A source is a hairline in the first grey. */
export const SOURCE_STYLE: ParticipantStyle = { strokeWidth: 1, labelWeight: 400, dash: "", colour: "grey-1" };

export function styleFor(kind: "role" | "source", roleIndex: number): ParticipantStyle {
  if (kind === "source") return SOURCE_STYLE;
  return ROLE_STYLES[roleIndex % ROLE_STYLES.length] as ParticipantStyle;
}

/** "A", "A and B", "A, B and C". */
function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1] as string}`;
}

/** The two generic sentences. Empty when there is nobody to name. */
export function formatLimit(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  const who = joinLabels(labels);
  return (
    `Send times from ${who} are not in this log, so their arrivals are marks, not lines. ` +
    `Messages lost on the way from ${who} cannot appear.`
  );
}

/** Said while the clear line is on: what the toggle cannot change. */
export function formatClearLineLimit(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  return `A clear line changes nothing for ${joinLabels(labels)}: only what arrived is in this log.`;
}

export interface ResolvedParticipant {
  id: string;
  label: string;
  kind: "role" | "source";
  history: HistoryKnowledge;
  limitNote?: string;
}

/**
 * The listed participants (first entry wins on a repeated id), then any scenario role
 * not listed (a complete role), then every other id seen in the ledger or in a decision,
 * in first-seen order. An unlisted id is complete if the ledger has a send from it,
 * otherwise arrivals-only.
 */
export function resolveParticipants(
  ledger: Ledger,
  scenario: Scenario,
  given: readonly ReplayParticipant[] | undefined,
): ResolvedParticipant[] {
  const out: ResolvedParticipant[] = [];
  const seen = new Set<string>();
  const push = (p: ResolvedParticipant): void => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    out.push(p);
  };
  for (const p of given ?? []) {
    push({
      id: p.id,
      label: p.label,
      kind: p.kind ?? "role",
      history: p.history ?? "complete",
      ...(p.limitNote === undefined ? {} : { limitNote: p.limitNote }),
    });
  }
  for (const r of scenario.roles) push({ id: r.id, label: r.name, kind: "role", history: "complete" });
  const hasSend = new Set<string>();
  const order: string[] = [];
  for (const e of ledger.events) {
    if (e.kind === "sent") hasSend.add(e.sender);
    if (e.kind === "sent" || e.kind === "arrival") order.push(e.sender, e.recipient);
    else if (e.kind === "learned" || e.kind === "readback") order.push(e.participant);
  }
  for (const e of scenario.events) if (e.type === "decision" && e.actor !== undefined) order.push(e.actor);
  for (const id of order) {
    push({ id, label: id, kind: "role", history: hasSend.has(id) ? "complete" : "arrivals-only" });
  }
  return out;
}
