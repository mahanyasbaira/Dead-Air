import { defineConfig } from "vitest/config";

// Explicit config so the kit never inherits the repo-root Vite config.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "*.test.ts"],
  },
});
