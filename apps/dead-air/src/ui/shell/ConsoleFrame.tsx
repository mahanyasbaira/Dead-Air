/**
 * ConsoleFrame (consoles 11.3, Req 1.3 and 5.2): the page chrome around a console.
 *
 * Layout follows the design language: a 12-column grid, left-aligned, stacking to
 * one column on narrow screens (360 px). It is not a centred fixed-aspect panel,
 * and it mounts no CRT layer (task 7.1 is superseded).
 *
 * Reduced motion: there is no switch. Nothing in the frame animates, and the
 * consoles honour the user's `prefers-reduced-motion` setting (Req 5.2 speaks of
 * the user's preference, not an in-app control). A switch here would do nothing.
 *
 * Mute state is lifted: the owner (RunHost) holds it and passes it to the audio
 * bus. The one polite live region is the StatusLine; the frame adds no other.
 */
import type { ReactNode } from "react";
import { DRILL_MARKER } from "./Entry";
import { StatusLine, type StatusMessage } from "./StatusLine";
import "./frame.css";
export interface ConsoleFrameProps {
  /** The console. */
  readonly children: ReactNode;
  /** Role label, for example "Booth" or "Tower". */
  readonly title: string;
  readonly statusMessages: readonly StatusMessage[];
  readonly muted: boolean;
  readonly onToggleMute: () => void;
}
export function ConsoleFrame({ children, title, statusMessages, muted, onToggleMute }: ConsoleFrameProps) {
  return (
    <div className="frame">
      <header className="frame-bar">
        <p className="frame-marker">{DRILL_MARKER}</p>
        <button type="button" className="frame-mute" aria-pressed={muted} onClick={onToggleMute}>
          Mute
        </button>
      </header>
      <h1 className="frame-title">{title}</h1>
      <main className="frame-console">{children}</main>
      <footer className="frame-status">
        <StatusLine messages={statusMessages} />
      </footer>
    </div>
  );
}
