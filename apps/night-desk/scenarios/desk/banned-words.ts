// Content lint word lists for Night Desk briefs and scenario text.
//
// THIS IS A HEURISTIC. A word list cannot judge meaning: it misses paraphrase and can flag
// innocent use. It catches obvious slips only. A human read of every night is still required
// (Req 5.2). Matching is on whole words or phrases, case-insensitively, so "skill" does not
// hit "kill" and "begun" does not hit "gun". A single optional trailing "s" is allowed.
// A space in a phrase matches any run of spaces or hyphens.

/** Out-of-scope topics from product.md: self-harm, sexual misconduct, medical emergency, weapons. */
export const outOfScopeWords: Record<string, string[]> = {
  "self-harm": ["self harm", "suicide", "suicidal", "kill myself", "hurt myself", "cutting myself", "end my life"],
  "sexual misconduct": ["rape", "raped", "sexual assault", "sexual harassment", "molest", "molested", "groped"],
  "medical emergency": [
    "medical emergency",
    "ambulance",
    "paramedic",
    "overdose",
    "unconscious",
    "not breathing",
    "cardiac arrest",
    "heart attack",
    "seizure",
    "bleeding",
    "anaphylaxis",
  ],
  weapons: ["weapon", "gun", "firearm", "pistol", "rifle", "knife", "knives", "bomb", "explosive", "stabbed"],
};

/** Markers of a real institution or place. Kept short on purpose. */
export const realInstitutionPhrases: string[] = ["university of", "college of", "state university"];

/** Real cities and countries. Short list; none is a plausible invented hall name. */
export const realPlaces: string[] = [
  "london",
  "paris",
  "new york",
  "tokyo",
  "toronto",
  "sydney",
  "chicago",
  "boston",
  "berlin",
  "madrid",
  "canada",
  "england",
  "france",
  "germany",
  "australia",
  "india",
  "china",
  "japan",
  "united states",
  "united kingdom",
];

export type LintHit = { category: string; term: string };

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function phraseRegex(phrase: string): RegExp {
  const body = phrase.split(/[\s-]+/).map(escape).join("[\\s-]+");
  return new RegExp(`(?<![A-Za-z0-9])${body}s?(?![A-Za-z0-9])`, "i");
}

const compiled: { category: string; term: string; re: RegExp }[] = [
  ...Object.entries(outOfScopeWords).flatMap(([category, terms]) =>
    terms.map((term) => ({ category, term, re: phraseRegex(term) })),
  ),
  ...realInstitutionPhrases.map((term) => ({ category: "real institution", term, re: phraseRegex(term) })),
  ...realPlaces.map((term) => ({ category: "real place", term, re: phraseRegex(term) })),
  // A web-style ".edu" domain or address.
  { category: "real institution", term: ".edu", re: /\.edu(?![A-Za-z0-9])/i },
];

/** Every list entry that appears in `text`. Empty when the text is clean. */
export function lintText(text: string): LintHit[] {
  return compiled.filter((c) => c.re.test(text)).map(({ category, term }) => ({ category, term }));
}
