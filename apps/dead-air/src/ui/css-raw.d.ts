/**
 * The one Node function focus-css.test.ts needs. The app has no @types/node and
 * adds none; vitest strips stylesheet text from `?raw` imports, so the test
 * reads the files itself.
 */
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
