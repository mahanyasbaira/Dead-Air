---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**/*", "index.html"]
---
# Design language: "the station at 3 a.m."

The interface is equipment, not a web page. No cards, no rounded dashboards, no gradients-on-white, no purple.

- **Palette:** near-black `#07090a`; phosphor green `#7dffb0` (Booth); amber `#ffb347` (Tower); bone `#e9e4d4` for neutral text; signal red `#ff4d3d` only for loss/collision. Each role owns one colour everywhere, including the Séance.
- **Type:** one monospaced face for instruments (system `ui-monospace` stack, or a single self-hosted open-licence mono), one condensed sans for labels. Sizes on a 4 px grid. Nothing below 14 px for content.
- **Texture:** scanlines, slight barrel curve, phosphor persistence, bloom. Implemented as one post-process layer that can be switched off; text underneath must pass WCAG AA without it.
- **Motion:** things behave like hardware: needles overshoot and settle, text prints character by character at the baud rate, the waterfall scrolls at a fixed rate. Nothing fades in for decoration. `prefers-reduced-motion` swaps animation for instant state plus a text status line.
- **Sound is information:** carrier tone, modem chirp, static bed, a click on every key. Every sound has a visible text twin in the status line. Global mute, and nothing plays before a user gesture.
- **The Séance** is the hero screen: full-bleed, time flows downward, two worldlines, signals as diagonals, lost signals as dashed lines that end in a small cross. It must read correctly as a still image for the video thumbnail.
- **Layout:** each console is one fixed-aspect panel centred on the viewport with real controls (dial, keys, lamp). Works from 360 px wide; on phones the Tower pager fills the screen.
- Use the installed skills when relevant: `animate`, `review-animations`, `emil-design-eng`.
