# Offline service worker evidence (consoles 13.2, Req 6.2)

Date: 2026-11-23. Browser: the Playwright MCP Chromium. Origin: `http://localhost:4810` (localhost counts as a secure context). No real HTTPS host, no other browser.

Setup: `pnpm build` (build plus `assemble`), then a throwaway static server (a short script in a `mktemp -d` directory, outside the repo) served the assembled `dist/`. "Offline" below means both `context.setOffline(true)` and the static server stopped, so a request to the origin could only be answered by a service worker. The server was stopped at the end.

| Step | What was done | What was seen |
|---|---|---|
| 1 | First online load of `/dead-air/` | Registration scope `http://localhost:4810/dead-air/`, script `/dead-air/sw.js`, state `activated`. Cache `dead-air-5f179447ca` held 11 entries: `index.html`, 2 CSS, 3 JS under `assets/` (main, `acoustic`, and both `acoustic-worklet` files), 3 fonts and `OFL.txt`. localStorage was empty. |
| 2 | Offline, reload `/dead-air/`, then load `/dead-air/?prototype` | The shell loaded (title "Dead Air", "Two tabs" button visible, page controlled by the worker). `?prototype` loaded the prototype ("Start the exercise" visible). `2-dead-air-offline-shell.png`. |
| 3a | Online: Solo, Dispatch, one send ("Hold the acoustic set"), one decision ("Ask Field Lead for a status check"); then offline reload | localStorage held `dead-air:run` (308 chars) and `dead-air:run:role`. After the offline reload the page showed "Resumed your saved run." with the same log lines and "You chose: Ask Field Lead for a status check". localStorage was byte-identical before and after. `3-dead-air-online-run.png`, `3-dead-air-offline-resumed.png`. |
| 3b | Offline: set `dead-air:run` to `{corrupt-not-json`, reload | "Your saved run could not be opened (it is not readable data), so this is a new run. The saved run has been kept." The stored value was still `{corrupt-not-json` afterwards. I then restored the good value. `3-dead-air-offline-corrupt.png`. |
| 4 | Online `/night-desk/`, Start, one choice ("Wait a couple of minutes", clock 11:10 pm to 11:12 pm); offline reload | Registration scope `/night-desk/`, `activated`; cache `night-desk-329387beda` with 3 entries (`index.html`, one CSS, one JS). Night Desk has no `public/` folder, so no fonts and no voice clips. Offline reload loaded the app (controlled by the worker) on the **start screen** ("Start"), not at 11:12 pm. This is expected: Night Desk task 4.1 (reload restore) is not built. `4-night-desk-*.png`. |
| 5a | `getRegistrations()` | Two registrations: `/dead-air/` with `/dead-air/sw.js`, and `/night-desk/` with `/night-desk/sw.js`. Both `activated`. |
| 5b | Offline, load `/` | `net::ERR_INTERNET_DISCONNECTED`, browser error page. Expected: the landing page has no worker. `5-landing-offline-fails.png`. |
| 5c | Cache contents | `dead-air-*` holds only `/dead-air/...` URLs; `night-desk-*` holds only `/night-desk/...` URLs. (Cache Storage is per origin, so this is checked from the file lists, not from separate storage.) |
| 5d | Online, added cache `unrelated-cache` (one entry) and localStorage key `unrelated:key` | Both survived the update in step 6 (see below). |
| 6a | Built a second version in a temp copy of the repo's app builds: the same files plus one extra `fonts/update-probe.txt` in Dead Air's `dist`, run through the real `assemble`. No source file in the repo was changed. Dead Air version went `5f179447ca` to `ecc98ceac9`; Night Desk stayed `329387beda`. Served it on the same port and reloaded `/dead-air/` online | Registration: `active: activated`, `waiting: installed`, no installing. Caches: `dead-air-5f179447ca` (11), `dead-air-ecc98ceac9` (12), `night-desk-329387beda` (3), `unrelated-cache` (1). The page kept working and showed "Resumed your saved run." `6-update-waiting.png`. |
| 6b | Opened a second tab on `about:blank`, closed the Dead Air tab, waited 3 s, opened `/dead-air/` | `active: activated` is the new worker (cache `dead-air-ecc98ceac9` only), `waiting: null`, page controlled. `dead-air-5f179447ca` was gone. `night-desk-329387beda` and `unrelated-cache` (body "keep me") remained. localStorage still had `dead-air:run`, `dead-air:run:role` and `unrelated:key`. The run resumed ("Resumed your saved run.", same content). `6-update-active-after-reopen.png`. |
| 6c | Stopped the server, offline reload | The new version served `/dead-air/fonts/update-probe.txt` (`200 update probe`) and the run resumed. |
| 7 | Console | The Playwright console log for the first tab showed only `404 /favicon.ico` (twice). The app has no favicon; not related to the worker. The later tabs (opened by script) are not covered by the MCP console log, so errors there are not recorded. |

Some screenshots look identical on purpose (`3-dead-air-online-run`, `3-dead-air-offline-resumed` and `6-update-waiting` show the same screen; `4-night-desk-online` and `4-night-desk-offline-reload` show the same start screen). The "Resumed your saved run." line sits at the bottom of the page and may be below the fold.

## Not verified

- Real HTTPS hosting; only localhost.
- Browsers other than Chromium (Firefox and Safari service worker and storage behaviour).
- The 3.5 s navigation timeout against a slow real network (covered only by a fake-timer unit test).
- A new version arriving while two tabs of the app are open.

## Stale-worker check (2026-11-24): an old worker must not take a newer index.html

Reason: the first worker refreshed the cached `index.html` from every online navigation. After a deploy, an old worker could store a newer page that names chunks its cache does not hold. The worker now never writes navigation responses to the cache, and it stores a runtime response only for a url in its own precache list or under `voice/`. See `scripts/site/service-worker.mjs` and the new cases in `service-worker.test.mjs`.

Setup: the rebuilt `dist/` copied twice into a `mktemp -d` directory (`/var/folders/d4/wk3vsf4j7j54tx2ytyts21jh0000gn/T/tmp.X8oMWgxvyC`, kept). In the copy `v2`, `assets/index-CuYkmaBH.js` was renamed to `assets/index-V2NEWHASH.js` with a marker appended, `index.html` was edited to reference it, and `sw.js` was regenerated with the real `buildServiceWorker` (v1 `5f179447ca`, v2 `93020d3d88`). A small static server served v1, then (stopped and restarted on the same port) v2, at `http://localhost:4811`. No repo source file was changed for this check.

| Step | What was done | What was seen |
|---|---|---|
| S1 | Served v1, loaded `/dead-air/` | Worker `activated`; cache `dead-air-5f179447ca` with 11 entries. |
| S2 | Solo, Dispatch, chose "Ask Field Lead for a status check" | `dead-air:run` held one decision (`d-ask`). |
| S3 | Stopped v1, served v2, reloaded `/dead-air/` online with the v1 worker in control | The page ran the v2 `index.html` (script `index-V2NEWHASH.js`). The v1 cache still held the v1 `index.html` (names `index-CuYkmaBH.js`, not `V2NEWHASH`), and held no `index-V2NEWHASH.js`. After 2 s the v2 worker was `waiting` with its own cache `dead-air-93020d3d88`. `stale-1-online-v2-with-v1-worker.png`. |
| S4 | Stopped the server, `setOffline(true)`, reloaded | The page was controlled by the v1 worker and loaded `index-CuYkmaBH.js` and `index-BGGipvsN.css` from the v1 precache; the app mounted. "Resumed your saved run." and "You chose: Ask Field Lead for a status check at sim-minute 0." were shown. localStorage unchanged. `stale-2-offline-v1-precache-resumed.png`. |

Not run against the old worker: I did not reproduce the failure with the previous worker code, so this shows the fixed behaviour, not the bug. The unit test covers the cache-write rule. The server was stopped at the end; the temp directory was kept.
