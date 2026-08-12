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
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
