import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { registerServiceWorker } from "./register-sw";
registerServiceWorker(import.meta.env.BASE_URL, import.meta.env.PROD);
createRoot(document.getElementById("root")!).render(<App />);
