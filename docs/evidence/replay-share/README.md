# Replay share link, Dead Air (seance-replay 4.5)

Run on 2026-11-24 against `pnpm build` output served with `python3 -m http.server` on 127.0.0.1 (ports 5611 and 5612, both stopped afterwards), driven by the Playwright MCP tools in Chromium. Each port is its own origin, so storage and service workers were separate. Nothing was cleared.

## Files

| File | What it is |
| --- | --- |
| `tmp-step3.json` | Partial browser capture left by an earlier interrupted run. Kept as it was found. It shows a Solo run's replay with prompts and timeline entries, `"ta": null` (no fallback link field found), and the saved run still in storage. Not produced by the run described below. |
| `step-a-solo-link.json` | Step (a): the share URL, storage keys, and replay list items read from the page. |
| `step-b-open-link.json` | Step (b): the same link opened on a second port with empty storage. |
| `step-d-after-link.json` | Step (d): saved run length and SHA-256 after opening a link. |
| `step-e-offline.json` | Step (e): the link opened with the server stopped. |

## Steps

**(a) UI.** On port 5611: Solo, role Dispatch, typed "Hold the set" and pressed Enter (a send), chose "Suggest holding the acoustic set" (a decision), pressed "See the replay". `navigator.clipboard.writeText` was stubbed with `browser_evaluate` to capture the text, then "Copy link" was pressed. The URL is `http://127.0.0.1:5611/dead-air/#s=<token>`, which is origin + `/dead-air/` + `#s=` + token. The run was ended early, so the replay heading was "The drill was ended early". Summary: 2 participants, 1 message arrived intact, 1 decision.

**(b) UI, link from (a).** Port 5612, empty storage (`storageKeys: []` before and after). Opening the same token (origin differs, token is the same) showed the heading "A shared replay". The 11 list items (3 prompts, 7 timeline lines, 1 decision line) and the summary sentence are identical to those in step (a). Buttons: Mute, Clear line, Copy summary, Start a drill. There was no composer, no role choice, no Solo/Two tabs entry and no microphone prompt. Resources loaded were the bundle, CSS, fonts and favicon only; storage stayed empty.

**(c) UI, hand-built URLs.** On port 5612, each with a query string to force a fresh load:
- `#s=!!not-a-token!!` showed "This replay link could not be opened, so this is the start of a new drill." and the entry screen (Solo, Two tabs, Two devices by sound).
- A token copied from (a) with its scenario id changed to `no-such-drill` showed "This replay link is for a drill this version does not have, so this is the start of a new drill." and the entry screen.
Neither showed "A shared replay"; storage stayed empty.

**(d) Real saved run, not seeded.** The run left on port 5611 by step (a) was the saved run. Without a link, the app resumed it (heading "What you know", Booth, decision prompt). With `#s=<token>` the page showed "A shared replay". The stored `dead-air:run` string (422 characters, SHA-256 `e4489e21…f0a7`) and `dead-air:run:role` (`dispatch`) were the same before and after. The browser journey cannot see `removeItem` calls; those are covered by the jsdom test with a spy.

**(e) Offline, UI.** The service worker was active on port 5611. The 5611 server was stopped, then the link was opened at `http://127.0.0.1:5611/dead-air/#s=<token>`. The page loaded from the service worker's cache, showed "A shared replay" with 11 list items, and the page was controlled by the service worker. The server was stopped (not the cache cleared) to simulate offline.

**(f) Console errors.** Only `favicon.ico` 404s (two on 5611, one on 5612), from the static server having no favicon. No application errors or warnings were reported. After the offline step the console was not re-read through the MCP tool, so offline console output was not collected.

## Not checked in a browser

- Spies for fetch, microphone and transport, and the "arrivals-only notice once" check for a Two tabs link: covered in `apps/dead-air/src/ui/shell/share.test.tsx`, not in the browser.
- The too-large record: covered in the same test file only.
