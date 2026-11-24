import type { ReactElement, ReactNode } from "react";

export function Start({ onStart, notice }: { onStart: () => void; notice?: ReactNode }): ReactElement {
  return (
    <main className="start">
      <h1>Night Desk</h1>
      <p className="lead">A rehearsal of a duty night, for new resident assistants before their first one.</p>
      <p className="note">This is practice with invented scenarios. It does not replace your own organisation&rsquo;s training.</p>
      {notice}
      <div className="actions">
        <button type="button" autoFocus onClick={onStart}>
          Start
        </button>
      </div>
    </main>
  );
}
