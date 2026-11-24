// Generates one scoped service worker per app (consoles 13.2, Req 6.2: works offline after first load).
// A service worker is a build and hosting concern, so it lives here, not in packages/hindsight and not in
// either app. `assemble.mjs` writes the result to `dist/<app>/sw.js`. The landing page gets none.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";

/** Voice clips are precached only while all of them together stay under this many bytes. */
export const VOICE_BUDGET_BYTES = 1_500_000;
/** Navigation waits this long for the network before serving the cached index.html. */
export const NAV_TIMEOUT_MS = 3500;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Files to precache for one app: everything in its built `dist` except source maps, dotfiles and the
 * worker itself. Each entry is `{ url, hash }` with `url` under `base`, sorted by url.
 * Files under `voice/` are left out when together they exceed `voiceBudgetBytes`
 * (they are still cached on first use by the cache-first rule).
 */
export function precacheList(distDir, base, { voiceBudgetBytes = VOICE_BUDGET_BYTES } = {}) {
  if (!base.startsWith("/") || !base.endsWith("/")) throw new Error(`base must look like "/app/", got ${base}`);
  const files = walk(distDir)
    .map((abs) => ({ abs, rel: abs.slice(distDir.length + 1).split(sep).join("/") }))
    .filter(({ rel }) => !rel.endsWith(".map") && rel !== "sw.js" && !rel.split("/").some((s) => s.startsWith(".")))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const voice = files.filter(({ rel }) => rel.startsWith("voice/"));
  const voiceBytes = voice.reduce((n, f) => n + statSync(f.abs).size, 0);
  const skip = voiceBytes > voiceBudgetBytes ? new Set(voice.map((f) => f.rel)) : new Set();
  return files
    .filter(({ rel }) => !skip.has(rel))
    .map(({ abs, rel }) => ({ url: posix.join(base, rel), hash: sha256(readFileSync(abs)) }));
}

/** Deterministic: the same urls with the same file contents give the same 10 hex characters. */
export function versionOf(list) {
  const h = createHash("sha256");
  for (const { url, hash } of list) h.update(`${url}\0${hash}\n`);
  return h.digest("hex").slice(0, 10);
}

// The worker template. Plain ES5-style JavaScript with no template literals, so it can sit in a string.
// It touches Cache Storage only: no localStorage, IndexedDB, cookies or clients.claim().
const TEMPLATE = String.raw`'use strict';
var CONFIG = __CONFIG__;
var PREFIX = CONFIG.app + '-';
var CACHE = PREFIX + CONFIG.version;
var INDEX = CONFIG.base + 'index.html';

// Install: precache this version, then wait. No skipWaiting: a new version never replaces code under an
// open page. It takes over when every tab of this app has closed.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(
        CONFIG.precache.map(function (url) {
          return new Request(new URL(url, self.location.origin).href, { cache: 'reload' });
        })
      );
    })
  );
});


// Activate: delete this app's own older caches and nothing else. No clients.claim().
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key.indexOf(PREFIX) === 0 && key !== CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
});

// Navigation: network first with a timeout. The network response is returned as is and never written to
// the cache. The offline page is always the index.html precached at install, which matches the hashed
// assets in the same cache. A newer index.html fetched by an old worker would reference chunks that this
// cache does not hold. The new worker precaches its own index.html and assets together.
// The cached page is looked up by its fixed url, so a query string such as ?prototype works offline too.
function navigate(event) {
  var timer;
  var network = fetch(event.request);
  var timeout = new Promise(function (resolve, reject) {
    timer = setTimeout(function () {
      reject(new Error('navigation timeout'));
    }, CONFIG.navTimeoutMs);
  });
  return Promise.race([network, timeout])
    .then(function (res) {
      clearTimeout(timer);
      return res;
    })
    .catch(function () {
      clearTimeout(timer);
      return caches.open(CACHE).then(function (cache) {
        return cache.match(INDEX);
      }).then(function (hit) {
        return hit || Response.error();
      });
    });
}

// Runtime caching is limited to urls this version listed, plus voice clips (which the build may leave out of
// the precache for size). Any other url, such as a chunk of a newer deploy, is fetched but not stored, so
// this version's cache never mixes in assets from another version.
var PRECACHED = {};
CONFIG.precache.forEach(function (u) {
  PRECACHED[u] = true;
});
function mayStore(request) {
  var path = new URL(request.url).pathname;
  return PRECACHED[path] === true || path.indexOf(CONFIG.base + 'voice/') === 0;
}

// Assets: cache first, then network; a good response for a storable url is added to the current cache.
function assetFirst(event) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        if (res.ok && mayStore(event.request)) {
          var copy = res.clone();
          event.waitUntil(cache.put(event.request, copy).catch(function () {}));
        }
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(CONFIG.base) !== 0) return;
  // Leave media and microphone-related requests to the browser.
  if (request.headers.get('range') || request.destination === 'audio' || request.destination === 'video') return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
  } else {
    event.respondWith(assetFirst(event));
  }
});
`;

/** The worker source for one app, with its precache list inlined. */
export function serviceWorkerSource({ app, base, version, precache, navTimeoutMs = NAV_TIMEOUT_MS }) {
  if (!/^[a-z][a-z0-9-]*$/.test(app)) throw new Error(`bad app name ${app}`);
  const config = { app, base, version, navTimeoutMs, precache };
  return TEMPLATE.replace("__CONFIG__", () => JSON.stringify(config, null, 2));
}

/** Reads `distDir`, derives the version from its contents and returns `{ source, version, precache }`. */
export function buildServiceWorker(distDir, { app, base, ...opts }) {
  const list = precacheList(distDir, base, opts);
  const version = versionOf(list);
  const precache = list.map((e) => e.url);
  return { source: serviceWorkerSource({ app, base, version, precache }), version, precache };
}
