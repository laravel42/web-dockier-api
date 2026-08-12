import { defineConfig } from "vitest/config";

// Two projects rather than one config: the backend suite runs on node with its
// rate-limiter teardown, while component tests need jsdom and the app's React
// transform. One shared environment would force one suite into the wrong one.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "backend",
          include: ["backend/**/__tests__/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          environment: "node",
          testTimeout: 30000,
          setupFiles: ["./backend/src/shared/__tests__/setup.ts"],
        },
      },
      "./frontend/vitest.config.ts",
    ],
  },
});
