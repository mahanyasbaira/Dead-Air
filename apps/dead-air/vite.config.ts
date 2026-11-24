import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/dead-air/",
  plugins: [react()],
  test: {
    globals: true,
    // Default to node; UI test files opt into jsdom via a per-file docblock.
    environment: "node",
    setupFiles: ["./src/ui/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scenarios/**/*.test.ts"],
  },
});
