import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { ShareGate } from "./ui/shell/ShareGate";
// The shell owns its tokens, fonts and base element rules. It never reads the prototype's
// ui/styles.css, so deleting the prototype (skeleton 6.2) cannot change the shell.
import "./ui/shell/base.css";
import { registerServiceWorker } from "./register-sw";
registerServiceWorker(import.meta.env.BASE_URL, import.meta.env.PROD);

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

// The shell is the entry. `?prototype` keeps the old UI reachable until skeleton task 6.2,
// and only that path loads the prototype stylesheet (after base.css, so it wins as before).
const prototype = new URLSearchParams(window.location.search).has("prototype");
const ready: Promise<unknown> = prototype ? import("./ui/styles.css") : Promise.resolve();

void ready.then(() => {
  createRoot(container).render(
    <React.StrictMode>{prototype ? <App /> : <ShareGate />}</React.StrictMode>,
  );
});
