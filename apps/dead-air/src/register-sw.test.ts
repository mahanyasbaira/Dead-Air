// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register-sw";

const BASE = "/dead-air/";
function stub(register: (...a: unknown[]) => Promise<unknown>) {
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
}
afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.restoreAllMocks();
});

describe("registerServiceWorker", () => {
  it("does not register outside production", () => {
    const register = vi.fn(() => Promise.resolve());
    stub(register);
    registerServiceWorker(BASE, false);
    expect(register).not.toHaveBeenCalled();
  });
  it("registers sw.js with the app's own scope in production", () => {
    const register = vi.fn(() => Promise.resolve());
    stub(register);
    registerServiceWorker(BASE, true);
    expect(register).toHaveBeenCalledWith(`${BASE}sw.js`, { scope: BASE });
  });
  it("does nothing without service worker support", () => {
    expect(() => registerServiceWorker(BASE, true)).not.toThrow();
  });
  it("logs a registration error once and does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stub(() => Promise.reject(new Error("blocked")));
    registerServiceWorker(BASE, true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
