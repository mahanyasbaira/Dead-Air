# Replay habits browser check, seance-replay task 5.4

Run on 2026-11-24 (local time) against the assembled `dist/` from `pnpm build` run after the 5.4 change.

- Server: `python3 -m http.server 60312 --bind 127.0.0.1` from `dist/`, PID 32944. Stopped afterwards; `lsof -ti tcp:60312` and `ps -p 32944` found nothing.
- Browser: Playwright MCP, Chromium. Port 60312 is a fresh origin. No caches or service workers were cleared.
- Screenshots: the MCP screenshot call timed out three times on the replay page ("waiting for fonts to load", then "element to be stable"), so there are no PNGs for this task. The evidence is the JSON read from the live DOM.

| Step | Reached by | File | What it showed |
|---|---|---|---|
| a. Dead Air Solo | UI only: Solo, Dispatch, sent "wind rising" and "hold the set", chose "Suggest holding the acoustic set", See the replay | `a-dead-air-solo-habits.json` | Dispatch: 2 transmissions, mean bytes 11.5, mean time on the line 4, collisions 0 and 0, read back "Not recorded". Field Lead: 0 transmissions (this scenario gives Field Lead no scripted sends), mean bytes and mean time "Not recorded" (no send to average), collisions 0 and 0, read back "Not recorded". No total row. The two saved sends carry `airtime: 4`. |
| b. Two tabs partner | Seeded: `dead-air:run` (mode `loopback`) and `dead-air:run:role` written to localStorage, page reloaded, resumed by the app, See the replay | `b-dead-air-two-tabs-seeded-habits.json` | Dispatch: 1 transmission, 11 bytes, 4 time on the line, read back "Not recorded". Field Lead: "Not known here" in all six columns. The limit sentence appears once. |
| c. Night Desk | UI only: Start, key 1, key w until "The night is over" | `c-night-desk-document.json` | Replay present, 0 tables, 0 `.hs-habits`, none of the habit wording on the page. |

## Notes

- In `a-dead-air-solo-habits.json` the `decision` entry of `savedLog` shows `{}`. That is my evidence script reading `e.event` on a decision entry; the decision was in the log (it was `d-hold` at sim-minute 7, and the seeded step b copied it).
- The seed in step b is a valid save but not one a player would make by hand (a partner message at 4 and a damaged one at 5 with no send).
- Not run: two real tabs, two devices, an old save with no `airtime` in the browser (covered by a RunEnd unit test), print, dark appearance.
