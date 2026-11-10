import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Reuses the app's own vite config so component tests get the same React
// transform and `@/` alias the app is built with — a second, drifting copy of
// that setup is how test-only import failures start.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: "frontend",
      include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      // Node 25+ ships a global `localStorage` that is undefined unless
      // --localstorage-file is given, and it shadows jsdom's, so every test
      // touching storage failed there. Turn Node's off; Node 22 (CI, the
      // Dockerfile) accepts the flag as a no-op.
      execArgv: ["--no-experimental-webstorage"],
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
