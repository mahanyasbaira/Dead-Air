// Tooling tests under scripts/ run separately from the flat src/ suite.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs", "scripts/**/*.prop.test.mjs"],
  },
});
