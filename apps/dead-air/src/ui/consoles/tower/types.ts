/** Tower-only models. The transport and print-line types are reused, not redefined. */
import type { PrintLine } from "../../shell/types";

/** One thing that reached the pager, in arrival order. `id` is its index in the event list. */
export interface Outcome {
  readonly id: number;
  readonly kind: "received" | "garbled" | "collision";
  readonly sender: string;
  /** Only on `received`. */
  readonly payload?: Uint8Array;
}

/** One message in the pager history. Collisions never become history items: nothing arrived. */
export interface HistoryItem {
  readonly id: number;
  readonly sender: string;
  /** `null` when nothing could be read at all (a garbled arrival carries no bytes). */
  readonly line: PrintLine | null;
}

/** A canned code: `label` is what the list shows, `text` is what is sent. */
export interface CannedCode {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

/** Lamp states. Shown as words, with weight and line style; accent only for loss. */
export type LampState = "idle" | "new" | "lost";
