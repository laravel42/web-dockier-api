import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
    },
  },
  {
    // Type-aware block, scoped to src: these two rules need type information,
    // and they are the ones that matter in a Fastify + pg-boss worker codebase
    // where a dropped promise becomes a silent unhandled rejection rather than
    // a failed request. Deliberately NOT the whole recommendedTypeChecked
    // preset — that adds a large stylistic surface for no reliability gain.
    // At "warn" so CI stays green while the existing findings are worked off.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },
  {
    files: ["**/__tests__/**/*.test.ts"],
    plugins: { vitest },
    rules: {
      "vitest/no-focused-tests": "error",
    },
  },
]);
