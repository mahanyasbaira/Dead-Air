# consoles 13.1 evidence

Built with `pnpm build`, served from `dist/` with `python3 -m http.server` on port 4173 (stopped afterwards), driven with Playwright MCP, 2026-11-23.

- 01 Entry, 02 console after Solo + role, 03 after decision + send (snapshot only), 04 after reload (resumed), 05 replay. `.snapshot.md` files are accessibility snapshots.
- 06 to 08: 360 px wide with reduced motion emulated; replay, Entry, Tower console. No horizontal overflow (scrollWidth 360), no running animations.
- 09 `?prototype`. 10 `/night-desk/`. `/` loaded (title "Hindsight").
- console.txt: six errors, all `favicon.ico` 404 (no favicon is shipped). No app errors.
- Not tested: a reload with the network off. There is no service worker.
- Style check, built page: no shell element carries any of the 13 class names `styles.css` defines (shell classes are prefixed `entry-`, `run-`, `frame-`, `booth-`, `tower-`). Body font is IBM Plex Sans, `--paper` is #f5f2ea, all three self-hosted fonts are loaded, and the only stylesheet is `/dead-air/assets/index-*.css`.
