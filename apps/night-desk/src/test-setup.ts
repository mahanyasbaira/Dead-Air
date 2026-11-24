import "@testing-library/jest-dom/vitest";

// UI tests share one jsdom Storage per file; start every test with it empty.
import { afterEach, beforeEach } from "vitest";
const wipe = (): void => {
  try {
    if (typeof localStorage !== "undefined") localStorage.clear();
  } catch {
    /* no Storage in this environment */
  }
};
beforeEach(wipe);
afterEach(wipe);
