/**
 * PagerKeys: exactly three keys. Up and Down move through the canned codes;
 * Send transmits the free text, or the selected code when the text is empty.
 * Each is a real button (keyboard operable, visible focus from tower.css) with
 * a visible key hint that is not part of its name.
 */
export interface PagerKeysProps {
  readonly onUp: () => void;
  readonly onDown: () => void;
  readonly onSend: () => void;
}

export function PagerKeys({ onUp, onDown, onSend }: PagerKeysProps) {
  return (
    <div className="tower-keys" role="group" aria-label="Pager keys">
      <button type="button" className="tower-key" onClick={onUp}>
        <span>Up</span>
        <span className="tower-hint" aria-hidden="true">
          Arrow up
        </span>
      </button>
      <button type="button" className="tower-key" onClick={onDown}>
        <span>Down</span>
        <span className="tower-hint" aria-hidden="true">
          Arrow down
        </span>
      </button>
      <button type="button" className="tower-key tower-key-send" onClick={onSend}>
        <span>Send</span>
        <span className="tower-hint" aria-hidden="true">
          Enter
        </span>
      </button>
    </div>
  );
}
