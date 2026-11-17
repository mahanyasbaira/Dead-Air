# Hindsight — plan

Kiroween 2026, category Skeleton Crew. Built by one student between Nov 15 and Dec 4, 2026.

## What it is

A small kit for building drills where information arrives late, damaged, or never, and a replay afterwards shows what each person knew at the moment they decided. Two applications are built on it.

| | Folder | What it is | Who it is for |
|---|---|---|---|
| Kit | `packages/hindsight` | Event log, seeded lossy channel, knowledge ledger, replay view | Anyone building a drill |
| App 1 | `apps/night-desk` | A solo rehearsal of a resident assistant's duty night. Things arrive while you are busy; every action costs minutes | New RAs before their first duty night |
| App 2 | `apps/dead-air` | Two devices whose only link is sound: an acoustic FSK modem, speaker to microphone, no network | Teams that coordinate over a bad line |

The apps differ on purpose. Night Desk has one player and the lossy channel is their own attention. Dead Air has two players and the lossy channel is the air between two devices. Both end in the same replay, from the same kit, without copying code.

## Why a kit

The first prototype was a single two-player drill. Building it produced three pieces that had nothing to do with that one drill: a deterministic event log, a channel that loses things reproducibly, and a way to ask what someone knew at a given moment. Those are the kit. The second app exists to prove the kit is not secretly shaped around the first.

Adding content is a short brief in Markdown. A Kiro hook turns a brief into a validated scenario file and its property test.

## Scope

**Must**
1. The kit, extracted, documented, with the two apps in separate folders.
2. Night Desk: guided first night, three more nights, replay, habits.
3. Dead Air: playable alone (hear your own message decode; scripted partner) and in two tabs.
4. The replay, shared by both.
5. One static site: landing page, both apps.

**Should**
6. Dead Air between two real devices by sound, including pairing.
7. Voice clips for Night Desk, with transcripts.
8. Shareable replay link.
9. Listen-only mode in Dead Air.
10. `hindsight-lab` MCP server: run a scenario headless, or measure modem recovery at a given noise level, so the coding agent can test without audio hardware.

**Not doing:** accounts, servers, a language model at runtime, scores or rankings, real procedures, sensitive scenario topics (listed in `.kiro/steering/product.md`).

## Architecture

```
apps/night-desk ─┐
                 ├─→ packages/hindsight:  engine (append-only log → pure reducer)
apps/dead-air ───┘                        channel (seeded delay / drop / damage / collision)
   └ modem, transports                    ledger (who knew what at time t)
                                          replay (pure layout → SVG)
```

Everything runs in the browser. The log is the only state; the kit is pure and seeded, which is why most of its rules are property tests.

## Schedule

| Dates | Goal |
|---|---|
| Nov 15–16 | Engine, channel, framing, transports, FSK on a clean signal |
| Nov 17–18 | Workspace move: kit and two app folders, all tests still passing |
| Nov 18–20 | Night Desk playable end to end in plain form, deployed; modem on realistic signals; first real recording decoded |
| Nov 21 | Decision: own modem or the `ggwave` library behind the same interface |
| Nov 21–24 | Design system; Night Desk finished |
| Nov 25–27 | Dead Air interface on the same system |
| Nov 28–29 | Replay, landing page, scenario generation |
| Nov 29–30 | Sessions with real RAs; fix what they trip on |
| Dec 1–3 | Video, write-up, submit |

## Submission checklist

- [ ] App URLs work, are free to use, and stay up until Jan 29 2027
- [ ] Repository is public with an open-source licence shown in the About section
- [ ] `/.kiro` is at the repository root and not in `.gitignore`
- [ ] Two separate application folders exist in the repository
- [ ] README has install and run steps
- [ ] Fonts and voice clips carry their licences in the repository
- [ ] Video is under 3 minutes, public on YouTube, shows both apps working, and contains no third-party trademarks or copyrighted music
- [ ] Text description of features
- [ ] Write-up of how Kiro was used
- [ ] All code was written after Oct 30 2026
- [ ] No secrets and no real personal or institutional data in the repository
