/** The three Node functions fonts.test.ts needs. The app has no @types/node and adds none. */
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
  export function existsSync(path: URL): boolean;
  export function statSync(path: URL): { size: number };
}
