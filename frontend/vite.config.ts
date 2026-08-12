import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: path.resolve(__dirname, ".."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Cloudflare named tunnel → localhost:5173
    // Note: the DNS label "local" does not publish on public DNS for this zone;
    // use localdev.dockier.dev (local.dockier.dev kept for hosts-file / DoH clients).
    allowedHosts: ["local.dockier.dev", "localdev.dockier.dev"],
  },
});
