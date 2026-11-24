import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Night } from "../nights";
import { filterNights, SEARCH_THRESHOLD, tagsOf } from "../model/picker";

export interface PickerProps {
  nights: readonly Night[];
  onChoose: (night: Night) => void;
  notice?: ReactNode;
}

/** A dense list of nights. Each row is one button: title, tags, simulated length. */
export function Picker({ nights, onChoose, notice }: PickerProps): ReactElement {
  const [query, setQuery] = useState("");
  const searchable = nights.length > SEARCH_THRESHOLD;
  const shown = searchable ? filterNights(nights, query) : nights;
  const active = query.trim().toLowerCase();
  return (
    <main className="picker">
      <h1>Choose a night</h1>
      {notice}
      {searchable ? (
        <div className="night-search">
          <label>
            Search nights
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div role="group" aria-label="Filter by tag" className="night-filters">
            {tagsOf(nights).map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={active === tag.toLowerCase()}
                onClick={() => setQuery(active === tag.toLowerCase() ? "" : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <p role="status">{shown.length === 1 ? "1 night" : `${shown.length} nights`}</p>
        </div>
      ) : null}
      <ul className="night-list" aria-label="Nights">
        {shown.map((n, i) => (
          <li key={n.id}>
            <button type="button" autoFocus={!searchable && i === 0} onClick={() => onChoose(n)}>
              <span className="night-title">{n.scenario.title}</span>
              <span className="night-tags">{n.script.tags.join(", ")}</span>
              <span className="night-length">{n.script.endsAt} min</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
