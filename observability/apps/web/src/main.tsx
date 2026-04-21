import { initLogger } from "@observability/sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Initialize observability SDK before React renders to capture all network calls
initLogger({
  wsUrl: "ws://localhost:3000/logs",
  captureNetwork: true,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
