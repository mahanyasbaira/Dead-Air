// Builds the deployable dist/ from site/ and both app builds. See skeleton design, "Site".
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServiceWorker } from "./service-worker.mjs";

export const PARTS = [
  { from: "site", to: "dist" },
  { from: "apps/night-desk/dist", to: "dist/night-desk" },
  { from: "apps/dead-air/dist", to: "dist/dead-air" },
];

/** Each app gets its own worker, scoped to its own base. The landing page gets none. */
export const WORKERS = [
  { app: "night-desk", base: "/night-desk/", to: "dist/night-desk" },
  { app: "dead-air", base: "/dead-air/", to: "dist/dead-air" },
];

/** Replaces `<root>/dist`. Throws, naming each missing index.html, before touching dist/. */
export function assemble(root) {
  const missing = PARTS.map((p) => `${p.from}/index.html`).filter((f) => !existsSync(join(root, f)));
  if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
  const dist = join(root, "dist");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  for (const p of PARTS) cpSync(join(root, p.from), join(root, p.to), { recursive: true });
  for (const w of WORKERS) {
    const { source } = buildServiceWorker(join(root, w.to), w);
    writeFileSync(join(root, w.to, "sw.js"), source);
  }
}

/** CLI wrapper: returns the exit code. */
export function main(root, log = console) {
  try {
    assemble(root);
    log.log("assemble: ok");
    return 0;
  } catch (e) {
    log.error(`assemble: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(fileURLToPath(new URL("../../", import.meta.url)));
}
