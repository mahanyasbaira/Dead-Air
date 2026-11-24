// Feature: skeleton, task 4.1. Fixtures for each rule (one passing, one failing) plus the real workspace.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBoundaries, extractSpecifiers } from "./check.mjs";

const rules = (files) => checkBoundaries(files).map((v) => v.rule);
const K = "packages/hindsight/src";

describe("app rules", () => {
  it("allows relative imports inside the app and the two kit entries", () => {
    const files = {
      "apps/dead-air/src/a.ts": 'import { x } from "./b";\nimport "../c";\nimport { r } from "hindsight";\nimport { v } from "hindsight/replay";\nimport React from "react";',
    };
    expect(checkBoundaries(files)).toEqual([]);
  });
  it("flags a relative path that leaves the app", () => {
    expect(rules({ "apps/dead-air/src/a.ts": 'import x from "../../../../packages/hindsight/src/index";' })).toEqual(["app-relative-leaves-app"]);
  });
  it("flags another app, by path and by package name", () => {
    expect(rules({ "apps/dead-air/src/a.ts": 'import x from "../../night-desk/src/y";' })).toEqual(["app-imports-other-app"]);
    expect(rules({ "apps/dead-air/src/a.ts": 'import x from "night-desk";' })).toEqual(["app-imports-other-app"]);
  });
  it("flags a kit path other than hindsight and hindsight/replay", () => {
    expect(rules({ "apps/night-desk/src/a.ts": 'import x from "hindsight/src/engine/types";' })).toEqual(["app-kit-deep-import"]);
  });
});

describe("kit rules", () => {
  it("allows relative imports inside the kit and downward folder imports", () => {
    expect(
      checkBoundaries({
        [`${K}/ledger/a.ts`]: 'import { e } from "../engine/types";\nimport { l } from "./b";',
        [`${K}/replay/a.ts`]: 'import { e } from "../ledger/a";',
      }),
    ).toEqual([]);
  });
  it("flags a relative path leaving the kit and a named app", () => {
    expect(rules({ [`${K}/a.ts`]: 'import x from "../../../apps/dead-air/src/y";' })).toEqual(["kit-relative-leaves-kit"]);
    expect(rules({ [`${K}/a.ts`]: 'import x from "dead-air";' })).toEqual(["kit-names-app"]);
  });
  it("flags imports against the direction engine, ledger, replay", () => {
    expect(rules({ [`${K}/engine/a.ts`]: 'import x from "../ledger/l";' })).toEqual(["kit-folder-direction"]);
    expect(rules({ [`${K}/ledger/a.ts`]: 'import x from "../replay/r";' })).toEqual(["kit-folder-direction"]);
    expect(rules({ [`${K}/channel/a.ts`]: 'import x from "../ledger/l";' })).toEqual(["kit-folder-direction"]);
  });
});

describe("core entry closure", () => {
  const entry = `import { a } from "./engine/a";`;
  it("passes when reachable files avoid react and DOM globals", () => {
    expect(checkBoundaries({ [`${K}/index.ts`]: entry, [`${K}/engine/a.ts`]: 'export const a = 1; // window is only a comment\nexport const s = "document";' })).toEqual([]);
  });
  it("flags react and DOM globals in reachable files", () => {
    const got = checkBoundaries({
      [`${K}/index.ts`]: entry,
      [`${K}/engine/a.ts`]: 'import React from "react";\nexport const w = window.innerWidth;\nnew AudioContext();',
    });
    expect(got.map((v) => v.rule)).toEqual(["core-entry-imports-ui", "core-entry-uses-dom-global", "core-entry-uses-dom-global"]);
  });
  it("does not flag the same code when it is not reachable from the entry", () => {
    expect(checkBoundaries({ [`${K}/index.ts`]: "export {};", [`${K}/replay/v.tsx`]: 'import React from "react"; export const w = window;' })).toEqual([]);
  });
});

describe("content scan", () => {
  it("flags forbidden words in kit sources, any case, with line numbers", () => {
    const got = checkBoundaries({ [`${K}/a.ts`]: "// ok\n// A Resident called\nconst t = 'Night Desk';" });
    expect(got.map((v) => [v.line, v.rule])).toEqual([[2, "forbidden-word"], [3, "forbidden-word"]]);
  });
  it("passes clean kit text and ignores forbidden words outside the kit", () => {
    expect(checkBoundaries({ [`${K}/a.ts`]: "// a person sends a message", "apps/dead-air/src/a.ts": "// modem, acoustic, fsk" })).toEqual([]);
  });
  it("checks README for the first three words only", () => {
    expect(rules({ "README.md": "A resident and a booth and a modem." })).toEqual(["forbidden-word", "forbidden-word", "forbidden-word"]);
    expect(checkBoundaries({ "README.md": "Dead Air, Night Desk, acoustic, fsk, tower." })).toEqual([]);
  });
  it("flags Math.random and Date.now in the kit and in engine, channel and modem folders", () => {
    expect(rules({ [`${K}/a.ts`]: "Math.random();" })).toEqual(["forbidden-api"]);
    expect(rules({ "apps/dead-air/src/modem/a.ts": "Date.now();" })).toEqual(["forbidden-api"]);
    expect(rules({ "apps/dead-air/src/engine/a.ts": "Math.random();" })).toEqual(["forbidden-api"]);
    expect(checkBoundaries({ "apps/dead-air/src/ui/a.ts": "Date.now(); Math.random();" })).toEqual([]);
  });
});

describe("unreadable files and specifier extraction", () => {
  it("reports an unreadable file as a violation", () => {
    expect(rules({ "apps/dead-air/src/a.ts": null })).toEqual(["unreadable-file"]);
  });
  it("sees import, export-from, dynamic import and require, and skips comments", () => {
    const src = '// import a from "x1"\n/* import b from "x2" */\nimport c, { d } from "x3";\nexport * from "x4";\nexport type { E } from "x5";\nimport("x6");\nrequire("x7");\nimport "x8";\nimport {\n  f,\n} from "x9";';
    expect(extractSpecifiers(src).map((s) => s.specifier)).toEqual(["x3", "x4", "x5", "x6", "x7", "x8", "x9"]);
  });
});

describe("real workspace", () => {
  it("passes pnpm check:boundaries", () => {
    const r = spawnSync("node", ["scripts/boundaries/run.mjs"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("boundaries: ok");
    expect(r.status).toBe(0);
  });
  it("wires CI before pnpm test and folds the check into root test", () => {
    const ci = readFileSync(fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)), "utf8");
    expect(ci.indexOf("pnpm check:boundaries")).toBeGreaterThan(-1);
    expect(ci.indexOf("pnpm check:boundaries")).toBeLessThan(ci.indexOf("pnpm test"));
  });
});
