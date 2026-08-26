import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
/* Crepe theme first, then our overrides — load order is what kills the
   ProseMirror padding: 60px 120px that made top spacing flicker. */
import "@milkdown/crepe/theme/common/style.css";
import "./components/markdown-viewer.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
