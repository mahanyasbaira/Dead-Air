/** Directory listing for motion.test.ts. Merges with css-raw.d.ts; no @types/node is added. */
declare module "node:fs" {
  export function readdirSync(path: URL): string[];
  export function statSync(path: URL): { isDirectory(): boolean };
}
