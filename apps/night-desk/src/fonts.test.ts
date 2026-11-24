import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inSrc = (rel: string) => new URL(rel, import.meta.url);
const font = (name: string) => inSrc(`../public/fonts/${name}`);
const css = readFileSync(inSrc("./styles.css"), "utf8");
const FONTS = ["IBMPlexSans-Regular.woff2", "IBMPlexSans-Medium.woff2", "IBMPlexMono-Regular.woff2"];

describe("self-hosted fonts", () => {
  it("has the three woff2 files, the licence and a README", () => {
    for (const f of [...FONTS, "OFL.txt", "README.md"]) {
      expect(existsSync(font(f)), f).toBe(true);
    }
    expect(readFileSync(font("OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE");
  });

  it("points every @font-face url at a file in public/", () => {
    const urls = [...css.matchAll(/@font-face\s*{[^}]*?url\("([^"]+)"\)/g)].map((m) => m[1] as string);
    expect(urls).toHaveLength(3);
    for (const u of urls) {
      expect(u.startsWith("/fonts/"), u).toBe(true);
      expect(existsSync(inSrc(`../public${u}`)), u).toBe(true);
    }
  });

  it("uses font-display: swap on every face", () => {
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces).toHaveLength(3);
    for (const f of faces) expect(f).toContain("font-display: swap");
  });

  it("keeps the font files under 200 KB in total", () => {
    const total = FONTS.reduce((sum, f) => sum + statSync(font(f)).size, 0);
    expect(total).toBeLessThan(200 * 1024);
  });
});
