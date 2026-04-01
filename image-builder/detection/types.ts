// ─── Stack Detection Types ───

export type DetectedStack =
  | { runtime: "node"; framework: "nextjs" | "nuxt" | "sveltekit" | "spa" | "generic"; packageManager: "npm" | "pnpm" | "yarn" | "bun"; hasStandalone: boolean; isStatic: boolean; subDir: string }
  | { runtime: "php"; framework: "laravel" | "generic"; hasNodeAssets: boolean; subDir: string }
  | { runtime: "python"; framework: "django" | "fastapi" | "flask" | "generic"; subDir: string }
  | { runtime: "go"; subDir: string }
  | { runtime: "unknown"; subDir: string };
