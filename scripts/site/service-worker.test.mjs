// Consoles 13.2 (Req 6.2): the generated per-app service worker, run in a small fake worker global.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServiceWorker, precacheList, versionOf, VOICE_BUDGET_BYTES } from "./service-worker.mjs";

const dirs = [];
afterEach(() => {
  vi.useRealTimers();
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function dist(files) {
  const d = mkdtempSync(join(tmpdir(), "sw-"));
  dirs.push(d);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, name)), { recursive: true });
    writeFileSync(join(d, name), text);
  }
  return d;
}
const FILES = {
  "index.html": "<html>v1</html>",
  "assets/index-AAA.js": "console.log(1)",
  "assets/index-AAA.js.map": "{}",
  "assets/index-BBB.css": "a{}",
  "assets/acoustic-worklet-CCC.js": "registerProcessor",
  "fonts/OFL.txt": "licence",
  "fonts/plex.woff2": "font",
  ".DS_Store": "junk",
};

describe("precache list and version", () => {
  it("lists built files under the base, without maps, dotfiles or sw.js", () => {
    const d = dist({ ...FILES, "sw.js": "old" });
    const urls = precacheList(d, "/dead-air/").map((e) => e.url);
    expect(urls).toEqual([
      "/dead-air/assets/acoustic-worklet-CCC.js",
      "/dead-air/assets/index-AAA.js",
      "/dead-air/assets/index-BBB.css",
      "/dead-air/fonts/OFL.txt",
      "/dead-air/fonts/plex.woff2",
      "/dead-air/index.html",
    ]);
    expect(urls.every((u) => u.startsWith("/dead-air/"))).toBe(true);
  });
  it("gives the same version for the same files and a new one when a file changes", () => {
    const a = versionOf(precacheList(dist(FILES), "/dead-air/"));
    const b = versionOf(precacheList(dist(FILES), "/dead-air/"));
    const c = versionOf(precacheList(dist({ ...FILES, "assets/index-BBB.css": "a{color:red}" }), "/dead-air/"));
    const d = versionOf(precacheList(dist({ ...FILES, "extra.txt": "new file" }), "/dead-air/"));
    expect(a).toMatch(/^[0-9a-f]{10}$/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(d).not.toBe(a);
  });
  it("skips voice clips over the budget and keeps small ones", () => {
    const small = dist({ ...FILES, "voice/a.mp3": "x".repeat(10) });
    expect(precacheList(small, "/night-desk/").map((e) => e.url)).toContain("/night-desk/voice/a.mp3");
    const big = dist({ ...FILES, "voice/a.mp3": "x".repeat(50) });
    const urls = precacheList(big, "/night-desk/", { voiceBudgetBytes: 20 }).map((e) => e.url);
    expect(urls).not.toContain("/night-desk/voice/a.mp3");
    expect(urls).toContain("/night-desk/index.html");
    expect(VOICE_BUDGET_BYTES).toBeLessThan(5_000_000);
  });
  it("rejects a base without slashes", () => {
    expect(() => precacheList(dist(FILES), "dead-air")).toThrow(/base/);
  });
});

// ---- fake worker global ----
const ORIGIN = "https://example.test";
const keyOf = (x) => new URL(typeof x === "string" ? x : x.url, `${ORIGIN}/`).href;

function fakeWorld({ online = true, net = {} } = {}) {
  const stores = new Map(); // cache name -> Map(url -> Response)
  const log = { fetched: [], deleted: [] };
  const state = { online };
  const cache = (name) => ({
    async addAll(items) {
      for (const it of items) {
        const res = await fakeFetch(it);
        stores.get(name).set(keyOf(it), res);
      }
    },
    async put(req, res) {
      stores.get(name).set(keyOf(req), res);
    },
    async match(req) {
      const hit = stores.get(name).get(keyOf(req));
      return hit ? hit.clone() : undefined;
    },
  });
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return cache(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      log.deleted.push(name);
      return stores.delete(name);
    },
  };
  async function fakeFetch(req) {
    const url = keyOf(req);
    log.fetched.push(url);
    if (!state.online) throw new TypeError("offline");
    if (state.hang) return new Promise(() => {});
    const path = new URL(url).pathname;
    const body = net[path] ?? `network:${path}`;
    const html = path.endsWith("/") || path.endsWith(".html");
    return new Response(body, { status: 200, headers: { "content-type": html ? "text/html" : "text/javascript" } });
  }
  const listeners = {};
  const banned = (name) =>
    new Proxy({}, { get: () => { throw new Error(`worker touched ${name}`); }, set: () => { throw new Error(`worker touched ${name}`); } });
  const self = { location: new URL(`${ORIGIN}/sw.js`), addEventListener: (t, fn) => (listeners[t] = fn) };
  function load(source) {
    new Function(
      "self", "caches", "fetch", "Response", "Request", "URL", "setTimeout", "clearTimeout",
      "localStorage", "sessionStorage", "indexedDB", "document", "clients",
      source,
    )(self, caches, fakeFetch, Response, Request, URL,
      (...a) => globalThis.setTimeout(...a), (...a) => globalThis.clearTimeout(...a), // late-bound so fake timers apply
      banned("localStorage"), banned("sessionStorage"), banned("indexedDB"), banned("document"), banned("clients"));
  }
  /** Dispatches a lifecycle event and awaits its waitUntil promises. */
  async function lifecycle(type) {
    const waits = [];
    listeners[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  }
  /** Dispatches a fetch. Returns null when the worker did not call respondWith. */
  async function fetchEvent(url, init = {}) {
    const request = {
      url: new URL(url, ORIGIN).href,
      method: init.method ?? "GET",
      mode: init.mode ?? "no-cors",
      destination: init.destination ?? "",
      headers: new Headers(init.headers ?? {}),
    };
    let responded = null;
    const waits = [];
    listeners.fetch({ request, respondWith: (p) => (responded = p), waitUntil: (p) => waits.push(p) });
    if (!responded) return null;
    const res = await responded;
    await Promise.all(waits);
    return res;
  }
  return { stores, log, state, load, lifecycle, fetchEvent, caches };
}

function boot(app, base, files = FILES, world = fakeWorld()) {
  const { source, version, precache } = buildServiceWorker(dist(files), { app, base });
  world.load(source);
  return { world, version, precache, source };
}
const nav = { mode: "navigate", destination: "document" };

describe("generated worker", () => {
  it("install precaches every listed file into <app>-<version>", async () => {
    const { world, version, precache } = boot("dead-air", "/dead-air/");
    await world.lifecycle("install");
    expect([...world.stores.keys()]).toEqual([`dead-air-${version}`]);
    const cached = [...world.stores.get(`dead-air-${version}`).keys()].sort();
    expect(cached).toEqual(precache.map((p) => ORIGIN + p).sort());
    expect(precache).toContain("/dead-air/assets/acoustic-worklet-CCC.js");
  });

  it("activate deletes only older caches with its own prefix", async () => {
    const { world, version } = boot("dead-air", "/dead-air/");
    for (const name of ["dead-air-old1", "dead-air-old2", "night-desk-abc", "some-other-cache", "dead-airx"]) {
      await world.caches.open(name);
    }
    await world.lifecycle("install");
    await world.lifecycle("activate");
    expect((await world.caches.keys()).sort()).toEqual(
      ["dead-airx", `dead-air-${version}`, "night-desk-abc", "some-other-cache"].sort(),
    );
    expect(world.log.deleted.sort()).toEqual(["dead-air-old1", "dead-air-old2"]);
  });

  it("an online navigation returns the network response and leaves the precached index.html alone", async () => {
    const { world, version } = boot("dead-air", "/dead-air/", FILES, fakeWorld({ net: { "/dead-air/": "<html>fresh</html>" } }));
    await world.lifecycle("install");
    const store = world.stores.get(`dead-air-${version}`);
    const before = await store.get(`${ORIGIN}/dead-air/index.html`).clone().text();
    const res = await world.fetchEvent("/dead-air/", nav);
    expect(await res.text()).toBe("<html>fresh</html>");
    const cached = await (await world.caches.open(`dead-air-${version}`)).match("/dead-air/index.html");
    expect(await cached.text()).toBe(before);
    expect(before).not.toBe("<html>fresh</html>");
  });

  it("a later offline navigation still serves the precached index.html", async () => {
    const { world } = boot("dead-air", "/dead-air/", FILES, fakeWorld({ net: { "/dead-air/": "<html>fresh</html>", "/dead-air/index.html": "<html>v1</html>" } }));
    await world.lifecycle("install");
    expect(await (await world.fetchEvent("/dead-air/", nav)).text()).toBe("<html>fresh</html>");
    expect(await (await world.fetchEvent("/dead-air/index.html", nav)).text()).toBe("<html>v1</html>");
    world.state.online = false;
    for (const url of ["/dead-air/", "/dead-air/?x=1"]) {
      expect(await (await world.fetchEvent(url, nav)).text(), url).toBe("<html>v1</html>");
    }
  });

  it("an offline navigation serves the cached index.html, also with a query string", async () => {
    const { world } = boot("dead-air", "/dead-air/");
    await world.lifecycle("install");
    world.state.online = false;
    for (const url of ["/dead-air/", "/dead-air/?prototype", "/dead-air/index.html?x=1"]) {
      const res = await world.fetchEvent(url, nav);
      expect(await res.text(), url).toBe("network:/dead-air/index.html");
    }
  });

  it("a hung network falls back to the cache after the timeout", async () => {
    const { world } = boot("dead-air", "/dead-air/");
    await world.lifecycle("install");
    world.state.hang = true; // every later fetch never settles
    vi.useFakeTimers();
    let settled = false;
    const pending = world.fetchEvent("/dead-air/?prototype", nav).then((r) => ((settled = true), r));
    await vi.advanceTimersByTimeAsync(3499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await (await pending).text()).toBe("network:/dead-air/index.html");
  });

  it("serves precached assets cache-first without touching the network", async () => {
    const { world } = boot("dead-air", "/dead-air/");
    await world.lifecycle("install");
    const before = world.log.fetched.length;
    const hit = await world.fetchEvent("/dead-air/assets/index-AAA.js");
    expect(await hit.text()).toBe("network:/dead-air/assets/index-AAA.js");
    expect(world.log.fetched.length).toBe(before);
  });

  it("runtime-caches only listed urls and voice clips; other assets are fetched but not stored", async () => {
    const { world, version } = boot("dead-air", "/dead-air/");
    await world.lifecycle("install");
    const store = world.stores.get(`dead-air-${version}`);
    const before = store.size;
    const other = await world.fetchEvent("/dead-air/assets/index-NEW.js"); // chunk of another version
    expect(await other.text()).toBe("network:/dead-air/assets/index-NEW.js");
    expect(store.size).toBe(before);
    expect(store.has(`${ORIGIN}/dead-air/assets/index-NEW.js`)).toBe(false);
    await world.fetchEvent("/dead-air/voice/late.mp3");
    expect(store.has(`${ORIGIN}/dead-air/voice/late.mp3`)).toBe(true);
    world.state.online = false;
    expect(await (await world.fetchEvent("/dead-air/voice/late.mp3")).text()).toBe("network:/dead-air/voice/late.mp3");
    await expect((await world.fetchEvent("/dead-air/assets/index-NEW.js").catch((e) => e)) instanceof Error).toBe(true);
  });

  it("does not intercept non-GET, cross-origin, out-of-scope, range or media requests", async () => {
    const { world } = boot("dead-air", "/dead-air/");
    await world.lifecycle("install");
    expect(await world.fetchEvent("/dead-air/assets/index-AAA.js", { method: "POST" })).toBeNull();
    expect(await world.fetchEvent("https://elsewhere.test/dead-air/assets/index-AAA.js")).toBeNull();
    expect(await world.fetchEvent("/night-desk/", nav)).toBeNull();
    expect(await world.fetchEvent("/night-desk/assets/x.js")).toBeNull();
    expect(await world.fetchEvent("/", nav)).toBeNull();
    expect(await world.fetchEvent("/dead-air", nav)).toBeNull();
    expect(await world.fetchEvent("/dead-air/fonts/a.mp3", { headers: { range: "bytes=0-1" } })).toBeNull();
    expect(await world.fetchEvent("/dead-air/clip.mp3", { destination: "audio" })).toBeNull();
  });

  it("the Night Desk worker is scoped the same way, with its own prefix", async () => {
    const { world, version } = boot("night-desk", "/night-desk/");
    await world.caches.open("dead-air-keepme");
    await world.lifecycle("install");
    await world.lifecycle("activate");
    expect(await world.caches.keys()).toEqual(["dead-air-keepme", `night-desk-${version}`]);
    expect(await world.fetchEvent("/dead-air/", nav)).toBeNull();
    expect(await world.fetchEvent("/night-desk/", nav)).not.toBeNull();
  });

  it("uses Cache Storage only: no other storage, clients, skipWaiting or claim", async () => {
    const { world, source } = boot("dead-air", "/dead-air/");
    // The fake global throws on any touch of localStorage, sessionStorage, indexedDB, document or clients.
    await world.lifecycle("install");
    await world.lifecycle("activate");
    await world.fetchEvent("/dead-air/", nav);
    await world.fetchEvent("/dead-air/assets/index-AAA.js");
    expect(source.replace(/\/\/.*$/gm, "")).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|skipWaiting|clients\.claim/);
  });
});
