import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: path.resolve(__dirname, ".."),
  // Vue's esm-bundler build (pulled in transitively by @codemirror/lang-vue) expects these flags.
  define: {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      /*
        rehype-prism-plus (pulled in by @uiw/react-md-editor) imports
        `refractor/all`, which registers 298 grammars — 910 KB of source, and by
        far the largest thing in the markdown chunk. `refractor`'s default entry
        is its `common` set: 37 grammars covering every language this product
        renders. Same export shape, so the alias is transparent.

        Safe because @uiw/react-markdown-preview passes `ignoreMissing: true`:
        a fenced block in an unregistered language falls back to plain text
        instead of throwing. Without that flag this alias would break the render.
      */
      "refractor/all": path.resolve(__dirname, "./src/utils/refractorSubset.ts"),
    },
  },
  server: {
    // Cloudflare named tunnel → localhost:5173
    // Note: the DNS label "local" does not publish on public DNS for this zone;
    // use localdev.dockier.dev (local.dockier.dev kept for hosts-file / DoH clients).
    allowedHosts: ["local.dockier.dev", "localdev.dockier.dev"],
  },
});
