/**
 * Composer: free text up to 64 bytes (UTF-8). Shows live remaining bytes and
 * estimated airtime. Over the limit, send is disabled and a visible reason says
 * why; Enter does not send either.
 */
import { useState, type FormEvent } from "react";
import { buildPayload, composerBudget } from "./composer";

export const EMPTY_REASON = "Type a message to send.";

export interface ComposerProps {
  /** Called with at most 64 payload bytes. */
  onSend: (payload: Uint8Array) => void;
}

export function Composer({ onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const budget = composerBudget(text);
  const empty = text.length === 0;
  const blocked = budget.overLimit || empty;
  const over = Math.max(0, budget.usedBytes - 64);
  const reason = budget.overLimit
    ? `Over the limit by ${over} ${over === 1 ? "byte" : "bytes"}. Shorten the message to send it.`
    : empty
      ? EMPTY_REASON
      : "";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (blocked) return;
    onSend(buildPayload(text));
    setText("");
  }

  return (
    <form className="booth-composer" onSubmit={submit} aria-label="Composer">
      <label className="booth-label" htmlFor="booth-message">
        Message
      </label>
      <input
        id="booth-message"
        className="booth-input"
        type="text"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby="booth-budget booth-reason"
        aria-invalid={budget.overLimit}
      />
      <p id="booth-budget" className="booth-meta booth-num">
        {budget.remainingBytes} {budget.remainingBytes === 1 ? "byte" : "bytes"} left. About{" "}
        {budget.estimatedAirtime.toFixed(2)} s on air.
      </p>
      <p id="booth-reason" className={"booth-meta" + (budget.overLimit ? " booth-loss" : "")}>
        {reason}
      </p>
      <button className="booth-send" type="submit" disabled={blocked}>
        Send
      </button>
      <p className="booth-meta">Enter sends.</p>
    </form>
  );
}
