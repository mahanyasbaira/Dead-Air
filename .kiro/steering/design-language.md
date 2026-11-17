---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**/*", "apps/**/src/**/*", "index.html", "**/*.css"]
---
# Design language

Quiet, typographic, exact. The interface should look like it was made by a small studio that removes things for a living. Nothing retro, nothing themed, nothing that looks generated.

## The test for every screen
1. Could one more element be removed without losing meaning? Remove it.
2. Does the screen still work in black text on off-white with no colour at all? If not, the hierarchy is wrong.
3. Would this look at home printed on paper? If it needs glow, blur or gradient to look finished, it is not finished.

## Never (these read as generated)
- Gradients of any kind, glass or blur panels, glows, neon, drop shadows deeper than one hairline of elevation.
- Purple or blue-violet accents. Emoji. Sparkles. Decorative icons. An icon is allowed only when it replaces a word the user already knows (close, play, mute).
- A centred hero with a gradient headline, a three-column grid of icon cards, pill badges saying "New", testimonial carousels.
- Everything rounded. Radius is 2 px on controls, 0 on surfaces.
- CRT scanlines, terminals, pixel fonts, pumpkins, blood, horror type. The only haunting thing in the product is absence: a message that never arrived stays on the page as a faint line.
- Placeholder or filler copy. Every sentence is written, short, and true.

## Colour
- Paper `#F5F2EA`, ink `#1A1916`, and three warm greys between them (`#6B6861`, `#A9A59B`, `#DDD9CF`). Hairlines are 1 px in the lightest grey.
- One accent, an iron-oxide red `#9A3B26`, used only for loss: an undelivered message, a collision, a destructive action. If nothing was lost, the screen has no colour.
- The second role is distinguished by weight and line style (solid vs dashed, regular vs medium), never by a second hue.
- Dark appearance is warm near-black `#141311` with paper-coloured text, not pure black and white. Both appearances pass WCAG AA.

## Type
- One family, self-hosted, open licence: IBM Plex Sans for text and interface, IBM Plex Mono for time, bytes and anything measured. No third face.
- Type does the art direction. Large, confident, left-aligned headings with tight tracking; long measure avoided (max 62 characters); numerals tabular.
- Scale: 13, 15, 18, 24, 40, 72. Interface text is 13–15. Nothing in between; nothing bold except one level of emphasis (medium).
- Sentence case everywhere. No all-caps except two-letter units. No exclamation marks.

## Layout
- A 12-column grid with an 8 px baseline. Everything aligns to it; nothing is centred unless it is alone on the screen.
- Generous outer margins, tight inner spacing. Dense, calm lists with hairline dividers instead of cards.
- One primary action per screen, bottom right or directly under the content it acts on.

## Onboarding
- No sign-up, no tour, no modal. The first screen is one sentence about who this is for and one button.
- The first run is the tutorial: one instruction at a time, the user acts, the product responds at once. Progress is a thin line at the top.
- The first meaningful result is reached in under 60 seconds.

## Interface behaviour
- Keyboard first. Every action has a key; `⌘K` opens a command list; focus is always visible as a 2 px ink outline.
- State changes are instant (under 120 ms). The interface never makes the user wait for an animation.
- Results and replays are documents, not dashboards: headings, sentences, inline tables and collapsible sections. No chart is drawn unless it shows something a sentence cannot.
- Lists that can grow past seven items get one search field and plain text filters that apply as you type.

## Motion
- Physical and interruptible: springs with no bounce for position, 180–260 ms; opacity 120 ms. An element that appears on the next screen travels there instead of fading out and in.
- Press feedback is a 1 px shift and a tone change, not a scale pulse.
- Nothing loops. Nothing moves to attract attention.
- `prefers-reduced-motion`: positions change instantly; only opacity animates.

## Sound
- Sound is content, never decoration. No interface clicks or chimes.
- Nothing plays before a user gesture. One mute control, always visible. Every sound has a text equivalent on screen.

## The landing section
- One headline, one sentence, and the real product running beside it, not a screenshot or video.
- Below: three short sections, each one claim with the live component that proves it. Then how it was built, then the licence. No footer links farm.

## The replay (the hero image)
- Full width, paper background, time flowing down. One vertical ink line per role, labelled at the top in the role's weight.
- A message is a thin diagonal from sender to receiver; its vertical span is its delay. A message that never arrived is a red line that stops short, ending in nothing.
- Selecting a decision fades everything the role did not yet know to the lightest grey. The sentence beside it says what was missing.
- It must read correctly as a still image at 1280×720.
