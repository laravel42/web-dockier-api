import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
/* Editor CSS (Crepe theme + our overrides) lives in MarkdownViewerCrepe so it
   ships with that async chunk rather than the render-blocking entry sheet. */
import App from "./App";
import { pruneProjectBadgeCache } from "./utils/projectBadgeCache";

// Reads only ever touch their own project's key, so expired and old-version
// entries need a sweep. Once per load is enough for a localStorage-sized cache.
pruneProjectBadgeCache();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
