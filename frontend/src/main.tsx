import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
/* Editor CSS (Crepe theme + our overrides) lives in MarkdownViewerCrepe so it
   ships with that async chunk rather than the render-blocking entry sheet. */
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
