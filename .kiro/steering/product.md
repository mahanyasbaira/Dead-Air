---
inclusion: always
---
# Product

**Hindsight** is a small kit for building drills where information arrives late, damaged, or never, and a replay afterwards shows what each person knew at the moment they decided. Two applications are built on it.

Kiroween 2026, category **Skeleton Crew**. Deadline Dec 4 2026, 2:00 pm PT. Plan and submission checklist: `docs/PLAN.md`.

## The three things
1. **The kit, `packages/hindsight`.** Append-only event log, pure reducer, seeded lossy channel (delay, drop, damage, collision), a knowledge ledger (who knew what at time t), and the replay view. No audio, no scenario content, no app-specific words. Small enough to read in one sitting.
2. **Night Desk, `apps/night-desk`.** A solo rehearsal of a resident assistant's duty night, for one person on one laptop. Calls, knocks and messages arrive while you are busy with something else; you choose what to do, and doing anything costs minutes. The replay shows what had reached you at each decision. For new RAs before their first duty night. Scripted, not generated: no server, no model at runtime.
3. **Dead Air, `apps/dead-air`.** A two-person drill where the only link is sound: one device plays the message through its speaker as FSK tones, the other hears it by microphone. No network. Talking at the same time destroys both messages. For teams that coordinate over a bad line. Falls back to two browser tabs on the simulated channel.

The two apps must stay clearly different (one player vs two, attention as the channel vs sound as the channel) and must share the kit without copying code from it.

## Rules that always hold
- **Fiction.** Every scenario is invented: no real institutions, people, policies or procedures. Each app says once, plainly, that it is practice and not a substitute for an organisation's own training.
- **Out of scope for Night Desk scenarios:** self-harm, sexual misconduct, medical emergencies, weapons. Scenarios cover noise, lockouts, roommate conflict, guest rules, a leak, an ambiguous alarm. Where a situation would need a professional, the option to call one is always present.
- **No scores, no ranking, no "correct answer".** The replay states facts: what was known, what was still in transit, how long things took.
- **Deterministic.** Same scenario, same choices, same seed gives the same log and the same replay.
- **One person, one laptop, under a minute.** A first-time visitor to either app makes a first meaningful choice within 60 seconds, with no sign-up. Dead Air must offer something to a person alone.
- **Static.** No accounts, no backend, no secrets, no paid APIs. Works offline after first load.
- **Accessible.** Keyboard-complete, text for every sound, mute always visible, reduced motion respected, WCAG AA.
- Never claim an unrun test, user session, or workflow succeeded. Record evidence in `docs/KIRO-USAGE.md`.
