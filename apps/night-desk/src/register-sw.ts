// Offline after first load (consoles 13.2, Req 6.2). The worker file `<base>sw.js` is generated at build
// time by scripts/site/service-worker.mjs; this only registers it. The same few lines live in both apps
// because the kit core is headless (no DOM) and a worker is a hosting concern, not kit code.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Registers `<base>sw.js` with scope `base`. Does nothing outside production builds, without
 * service worker support, or on an insecure origin. Errors are logged once, never thrown. */
export function registerServiceWorker(base: string, prod: boolean): void {
  if (!prod || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (window.isSecureContext !== true && !LOCAL_HOSTS.includes(window.location.hostname)) return;
  const register = () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((e: unknown) => {
      console.warn("Offline support is unavailable:", e);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
