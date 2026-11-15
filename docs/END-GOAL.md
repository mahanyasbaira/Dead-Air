# Dead Air — end goal

Kiroween 2026 · category **Resurrection** · solo · submit by **Thu Dec 3** (hard deadline Fri Dec 4, 2:00 pm PT / 3:00 pm MT).

## The verdict on the original idea

Keep the core, change the form.

- **Keep:** the name, the deterministic engine Kiro already built (13 passing tests), and the one good insight: *show who knew what, when*.
- **Drop:** the form. A page of radio buttons with a "SIMULATION" banner fits no category, shows no design, and gives a judge nothing to remember. It would score low on four of the five criteria.
- **Add:** a real resurrected technology, a real costume, and a debrief nobody has drawn before.

## What we are building

> Two people, one unfolding ghost story at a fictional radio station, and the only way to talk is a 1970s-style acoustic modem: your laptop **screeches the message through the air** into the other device's microphone. Wi-Fi off. Messages arrive late, garbled, or collide. Afterwards the **Séance** replays the night as a diagram that proves who knew what when each decision was made.

The opening shot of the video is two laptops in airplane mode talking to each other by sound. That is the hook.

### The three pillars

| Pillar | What the judge sees | Why it scores |
|---|---|---|
| **The Wire** | Messages travel as audible FSK tones between devices. Half-duplex: talk over each other and both messages die. A seeded simulated channel behaves identically in two tabs or solo. | Innovation (resurrected acoustic modem in a browser), Kiro depth (property tests on encode/decode, custom agent, MCP lab) |
| **The Consoles** | Booth plays on a phosphor teletype with a live spectrum waterfall of the actual link. Tower plays on a pager. Text prints at the baud rate. | Design |
| **The Séance** | Two worldlines, time flowing down. Each message is a diagonal line whose slope is its delay; lost ones end in a cross. Click a decision and everything that role did not yet know goes dark. Toggle "clear line" to see what they would have known. | Impact (the useful part), Innovation, Presentation (it is the thumbnail) |

### Who it is for (the impact pitch)

Teams that run tabletop drills: on-call engineers, event staff, resident assistants, student orgs. Drills today are a document and a blame session. Dead Air takes five minutes, needs no account or network, and ends with evidence that the late message caused the bad call. Get **three real groups** to play it before recording the video and quote what they said (with permission). Do not claim impact that was not observed.

## Scope

**Must (the submission is incomplete without these)**
1. Simulated channel + loopback transport: two tabs play a full scenario.
2. Solo mode with a scripted partner: one judge reaches the Séance in under 4 minutes.
3. Booth and Tower consoles with sound, CRT layer, keyboard access, mute, reduced motion.
4. Séance: worldlines, signals, decision highlight, scrubber, text timeline.
5. One excellent scenario ("Static on Channel 9", rewritten as the ghost story).
6. Deployed static site, public GitHub repo, MIT licence, `.kiro/` at root, 3-minute video.

**Should**
7. Acoustic modem between two real devices (the wow). Time-boxed: reliable at 1 m by **Nov 21** or switch to the `ggwave` library behind the same interface.
8. "Clear line" counterfactual and shareable replay link.
9. Two more scenarios and a documented scenario JSON format so others can write their own.
10. `dead-air-lab` MCP server: lets Kiro run a scenario headless and measure modem bit-error rate at a given noise level. This is the "MCP made something possible" story: the agent can *hear* its own modem.

**Stretch (only if Must + Should are done by Nov 29)**
11. Kiro Crew app "Night Shift": a nightly job that runs the property-test and bit-error campaigns and posts a morning report page ($1,000 bonus prize).
12. Three-role scenario.

**Not doing:** accounts, servers, LLM at runtime, scores or rankings of people, real-world procedures.

## Architecture (all client-side)

```
ui (consoles, séance, fx) → transport (acoustic | loopback | scripted)
                          → modem (FSK, framing, CRC)  +  channel (seeded delay/drop/garble/collision)
                          → engine (append-only event log → pure reducer → known-set queries → séance geometry)
```

- Event log is the only state. Reload restores from it; the share link is the log, compressed into the URL.
- Engine, channel and modem are pure and seeded, so every rule is a property test.
- Static hosting with HTTPS (the microphone requires it).

## Schedule (19 days)

| Dates | Goal | Done when |
|---|---|---|
| **Nov 15–16** | First commit, public repo, MIT licence. In Kiro: open each of the 3 specs and generate design + tasks. Install CLI. | `git log` has history; three specs have design.md with correctness properties |
| **Nov 17–19** | `signal-chain` spec: channel, framing, CRC, loopback, engine v2 events | Two tabs exchange messages; property tests green |
| **Nov 19–21** | FSK modulate/demodulate + acoustic transport. Build `dead-air-lab` MCP | Two laptops exchange a frame by sound, or the ggwave fallback is in |
| **Nov 22–25** | `consoles` spec: Booth, Tower, CRT, waterfall, audio | Solo run is playable and looks finished at 1440 and 390 px |
| **Nov 26–29** (break) | `seance-replay` spec + counterfactual + share link + scenarios | Séance reads correctly as a still image |
| **Nov 30** | Three user sessions, fix top 3 issues, `/ship-check`, deploy | Live URL works on a phone and a laptop |
| **Dec 1** | Record video, write Devpost text and Kiro write-up from `docs/KIRO-USAGE.md` | Video under 3:00 on YouTube, public |
| **Dec 2** | Blog post and social post (`#KiroweenHackathon26` must be the first word) | Both links in the form |
| **Dec 3** | Submit. Dec 4 is buffer only. | Devpost shows "submitted" |

If a week slips, cut from the bottom of *Should*, never from *Must*.

## How each judging criterion gets its points (20% each)

- **Potential impact:** named audience, three real play sessions, scenario format others can author.
- **Kiro implementation:** every feature used for a reason and logged: 4 specs, 8 steering files in 3 inclusion modes, 4 hooks, 4 custom agents, 2 workflows with a review gate and parallel branches, MCP (Playwright, Context7, our own lab server), property-based tests from spec requirements, IDE + CLI + Web compared, optional Crew app.
- **Design:** equipment, not a web page. One strong idea per screen.
- **Innovation:** data-over-sound in the browser + the worldline replay.
- **Presentation:** airplane-mode cold open, 20 seconds of play, the Séance reveal, 30 seconds on Kiro, done.

## Video outline (2:50)

1. 0:00 Two laptops, Wi-Fi off. One screeches; text prints on the other. "This is Dead Air."
2. 0:20 The problem: drills are boring and end in blame.
3. 0:35 Play: Booth and Tower, a message collides, a decision is made in the dark.
4. 1:30 The Séance: click the decision, the unknown goes dark. Toggle clear line.
5. 2:05 How Kiro built it: spec → property test catching a real modem bug → the agent hearing its own modem through MCP → the review-gated workflow.
6. 2:40 Who it is for, the link, end card.

No third-party music or logos. All sound is generated by the app.

## Submission checklist (from the official rules)

- [ ] Working app URL, free to use, live until Jan 29 2027
- [ ] Public GitHub repo with an open-source licence shown in the About section
- [ ] `/.kiro` at the repo root, not in `.gitignore`, containing specs, hooks, steering
- [ ] README with install and run steps
- [ ] Video under 3 minutes, public on YouTube, shows the app working, no third-party marks or music
- [ ] Text description of features
- [ ] Kiro usage write-up covering: surfaces, custom agents, hooks, specs vs vibe coding, steering, MCP, property-based testing, powers
- [ ] Category: Resurrection. Bonus: Best Student Project (school email, LinkedIn, year, degree), Blog, Social Blitz, Best Demo is automatic
- [ ] All code created after Oct 30 2026; any pre-existing code disclosed (there is none)
- [ ] No secrets, no real personal data in the repo

## Credits

Student plan: 1,000 per month. Hackathon grant: 4,000 requested, not yet received (allow 48 business hours; must be redeemed by Dec 4, expires Dec 31). The whole first slice cost 7 credits, so credits are not the constraint. Time is. Use specs and workflows freely; the one thing to watch is agent-action hooks, which spend credits on every trigger.

## Risks

| Risk | Answer |
|---|---|
| Acoustic modem unreliable in a noisy room | Nov 21 cut-off, ggwave fallback, and the simulated channel makes the product complete without it |
| Judge only has one device | Solo mode is a Must |
| CRT effect hurts readability | Effect is one removable layer; AA contrast is tested with it on |
| Too much scope | The Must list alone is a complete, good submission |
| Looks like AI wrote everything | Usage log records what went wrong too; the write-up says what Kiro got wrong and how it was caught |
