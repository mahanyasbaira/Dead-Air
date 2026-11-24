# Replay final browser check, seance-replay task 6.3

Run on 2026-11-24 (local time) with Playwright MCP (Chromium) against the assembled `dist/` from `pnpm build`.

- First server: `python3 -m http.server 47613 --bind 127.0.0.1` from `dist/`, PID 48085. Stopped; `ps -p 48085` found nothing.
- Second server, after the label fix and a rebuild: port 47821, PID 52594. Stopped; `pgrep -fl http.server` found nothing.
- Fresh ports, so fresh origins. No cache or service worker was cleared.
- Console: the only errors on these ports were `favicon.ico` 404s (the server root has none).
- Everything below is the agent's inspection and emulation. Emulated print and dark mode are not a person printing or judging them.

## Files

| File | State | How it was reached |
|---|---|---|
| `dead-air-replay-1280x720.png` | Dead Air replay, closed record, three dotted loss lines, labels in full, 1280x720 | **Seeded**: a saved Solo run written to `localStorage`, reloaded, resumed by the app, then "See the replay" through the UI. After the label fix. |
| `dead-air-replay-print-emulated.png` | Same replay under emulated print media | Seeded, as above. Emulated, not printed. |
| `dead-air-replay-dark-emulated.png` | Same replay under emulated dark colour scheme | Seeded, as above. Emulated. |
| `night-desk-document-dark-emulated.png` | Night Desk guided-night document under emulated dark | **UI only**: Start, key 1, key w until "The night is over". It stays light: Night Desk has no dark appearance. Taken before the label fix; the labels there are the short "11:10 pm" form and were not clipped. |
| `before-label-fix/` | The three Dead Air screenshots as first taken | The 1280x720 still is from the UI-played run (cursor at minute 2); the print and dark ones are from the seeded run. All show "inute N" labels clipped at the left. Kept as the record of the defect. |

## What each state showed

- **Dead Air Solo, played through the UI** (Solo, Dispatch, sent "wind rising" and "hold the set", chose "Suggest holding the acoustic set", See the replay). Reached through the UI: signals as diagonals; decision selected by keyboard (`aria-pressed` true, Field Lead's fact circles faded, sentences "Dispatch had 3 things..." and "Known elsewhere: Field sees a gust."); scrubber moved with Home and arrow keys to minute 2 (first line cut at y=193.1, second faded, "Not yet arrived: Message from Dispatch (fictional) at sim-minute 0."); Clear line on (spans zero, "Nothing more would have arrived.") and off (diagonals back); summary; three discussion prompts; habits table (Dispatch 2 / 11.5 / 4 / 0 / 0 / Not recorded; Field Lead 0 / Not recorded / Not recorded / 0 / 0 / Not recorded; no total row); Copy link and Copy summary with a stubbed `navigator.clipboard` (link `.../dead-air/#s=` plus 772 characters; summary 215 characters).
- **Seeded lossy run** (collision, garbled message to Dispatch, a send with no outcome, decision at minute 7). Seeded, not played: the closed record shows three dotted loss lines; with the decision selected and Clear line on, the sentence reads "With a clear line, Dispatch (fictional) would also have had: Message from Field Lead (fictional) at sim-minute 1." The UI-played run lost nothing, so this variant of the gains sentence was only seen on the seeded run.
- **Print media (seeded run).** Loss lines `rgb(26, 25, 22)` dotted `2px, 3px`; Copy summary and Copy link hidden (`display: none`); figure `break-inside: avoid`, 707 px wide, SVG 471 px high. With a decision selected (earlier, same seeded run) faded circles were `rgb(169, 165, 155)`. The screenshot still shows the paper colour behind the figure. Fit on a real page is not shown.
- **Dark (Dead Air).** `--paper #141311`, `--ink #f5f2ea`, `--loss #d9806a`; faded line `rgb(52, 50, 45)`.
- **Dark (Night Desk).** `--paper` stayed `#f5f2ea`; `--loss` is not defined there, so the replay uses the view's fallback.
- **Reduced motion.** `getAnimations().length` was 0 under reduce, and 0 without it too; the computed transition was `0s` under reduce and `0.12s` without. The duration is the useful number.
- **Night Desk guided night, played to the document through the UI.** Five lines (Jo Marlowe, Duty phone, Floor chat, The door, Ms Alder), three diagonal signals, no table, no summary, no Copy link or Copy summary, no habits section. The "Clear line" button is there.

## Defect found

The time labels at the left of the Dead Air figure were clipped ("inute 7" for "sim-minute 7"). Fixed with `overflow: visible` on the figure's SVG; test added in `ReplayView.style.test.tsx`. After the fix the labels start at x=69 on a 1280-wide page and read in full. Not looked at on a narrow screen or on paper.

## Not run

Black-and-white print on one page, a person reading the still at 1280x720, a screen-reader pass of the text timeline, reduced motion in a person's browser, both appearances judged by a person, two real tabs, two devices.
