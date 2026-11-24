// Picker filtering. Pure: no React, no DOM.

/** The least a night needs to be filtered: a title and tags. */
export interface Searchable {
  scenario: { title: string };
  script: { tags: readonly string[] };
}

/** The picker shows search only when there are more nights than this. */
export const SEARCH_THRESHOLD = 7;

/**
 * Nights whose title or any tag contains the query, case-insensitive and trimmed.
 * Order is preserved; an empty (or blank) query returns every night.
 */
export function filterNights<T extends Searchable>(nights: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...nights];
  return nights.filter(
    (n) => n.scenario.title.toLowerCase().includes(q) || n.script.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** Every distinct tag, in order of first appearance. */
export function tagsOf(nights: readonly Searchable[]): string[] {
  const seen = new Set<string>();
  for (const n of nights) for (const t of n.script.tags) seen.add(t);
  return [...seen];
}
