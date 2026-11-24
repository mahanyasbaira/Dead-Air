// Feature: skeleton, task 5.3. Asserts the scenario-from-brief hook file and its matcher.
// The round trip of the Night Desk example brief through parseBrief/printBrief is tested in
// apps/night-desk/src/example-brief.test.ts, because the kit is TypeScript and this suite is plain .mjs.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const file = new URL(".kiro/hooks/scenario-from-brief.json", root);

describe("scenario-from-brief hook", () => {
  it("exists and is valid JSON with one hook", () => {
    expect(existsSync(file)).toBe(true);
    const json = JSON.parse(readFileSync(file, "utf8"));
    expect(json.version).toBe("v1");
    expect(json.hooks).toHaveLength(1);
  });

  const hook = () => JSON.parse(readFileSync(file, "utf8")).hooks[0];

  it("fires on save, as an agent action, with the brief matcher", () => {
    const h = hook();
    expect(h.name).toBe("scenario-from-brief");
    expect(h.trigger).toBe("PostFileSave");
    expect(h.matcher).toBe("apps/[^/]+/scenarios/briefs/[^/]+\\.md$");
    expect(h.action.type).toBe("agent");
  });

  it("tells the agent to read the brief, write beside it, run the app test, and leave the kit alone", () => {
    const p = hook().action.prompt;
    expect(p).toMatch(/Read it/);
    expect(p).toMatch(/beside it/);
    expect(p).toMatch(/pnpm .*test/);
    expect(p).toMatch(/report the real result/);
    expect(p).toMatch(/Never edit anything under packages\/hindsight/);
    expect(p).toMatch(/\.kiro\/steering\/product\.md/);
  });

  it("matches both example brief paths", () => {
    const re = new RegExp(hook().matcher);
    expect(re.test("apps/dead-air/scenarios/briefs/static-on-channel-9.md")).toBe(true);
    expect(re.test("apps/night-desk/scenarios/briefs/example-noise-complaint.md")).toBe(true);
    for (const p of [
      "apps/dead-air/scenarios/briefs/static-on-channel-9.md",
      "apps/night-desk/scenarios/briefs/example-noise-complaint.md",
    ]) {
      expect(existsSync(new URL(p, root)), p).toBe(true);
    }
  });

  it("matches no other path", () => {
    const re = new RegExp(hook().matcher);
    for (const p of [
      "packages/hindsight/scenarios/briefs/x.md",
      "packages/hindsight/src/engine/brief.ts",
      "apps/dead-air/scenarios/briefs/static-on-channel-9.ts",
      "apps/dead-air/scenarios/briefs/static-on-channel-9.md.bak",
      "apps/dead-air/scenarios/briefs/nested/x.md",
      "apps/dead-air/scenarios/static-on-channel-9.ts",
      "apps/dead-air/scenarios/x.md",
      "apps/dead-air/src/briefs/x.md",
      "apps/scenarios/briefs/x.md",
      "docs/scenario-brief.md",
      "scenarios/briefs/x.md",
    ]) {
      expect(re.test(p), p).toBe(false);
    }
  });
});
