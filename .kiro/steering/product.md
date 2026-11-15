---
inclusion: always
---
# Dead Air — product

**One line:** a haunted two-player comms drill. Two people share one unfolding fictional incident, can only talk over a resurrected dead-tech link (an acoustic FSK modem: speaker to microphone, no network), and afterwards watch a replay that proves who knew what, when.

**Category:** Kiroween 2026 *Resurrection* (dead tech: acoustic modems, teletype, pagers, numbers stations). Deadline Dec 4 2026, 2:00 pm PT. Full plan: `docs/END-GOAL.md`.

**Who it is for:** any small team that runs tabletop drills and finds them boring or blame-heavy: on-call engineers, event staff, resident assistants, student orgs. The lesson is that bad calls usually come from late or garbled information, not bad people.

## The three pillars (do not dilute)
1. **The Wire** — messages travel as sound between devices and can be delayed, garbled, lost, or collide (half-duplex). A seeded simulated channel gives the same behaviour in two tabs or solo.
2. **The Consoles** — each role plays on a different dead device: Booth (phosphor teletype + live spectrum waterfall) and Tower (pager-style handheld). Polished, strange, audible.
3. **The Séance** — the debrief: a worldline diagram where roles are vertical lines, messages are diagonal signals whose slope is their delay, and selecting a decision lights up exactly what that role knew. A "what if the line was clear?" toggle replays the same log with zero delay.

## Rules that always hold
- Everything is fiction. Every scenario screen carries a visible `FICTION · DRILL` marker. No real places, people, procedures, alerts or advice. No scores for individuals.
- The engine is deterministic: same scenario + same event log + same seed gives the same state and the same Séance. No LLM at runtime.
- A judge alone with one laptop must reach the Séance in under 4 minutes (solo mode against a scripted partner).
- Works offline after first load. No accounts, no server, no paid APIs, no secrets.
- Accessible: keyboard-complete, text equivalents for every sound and colour, reduced-motion and a mute switch, readable contrast under the CRT effect.
- Never claim an unrun test, user study, or workflow succeeded. Record evidence in `docs/KIRO-USAGE.md`.
