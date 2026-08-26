/**
 * Live smoke test for the AI Dockerfile review layer.
 *
 * Exercises the REAL OpenAI API (no mocks) so we can confirm the round-trip,
 * response shape, JSON-mode handling, and validation all work end-to-end
 * without needing a full deployment, provider credentials, or a real repo.
 *
 * Usage:
 *   pnpm --filter @dockier/backend-fastify smoke:ai-review
 *
 * Requires OPENAI_API_KEY in the environment (or root .env). If it's absent,
 * the script explains what to set and exits without error.
 */

import { initConfig, env } from "../shared/config.js";
import { aiReviewDockerfile } from "../lib/repo-analyzer/ai-review.js";
import { createRepoConfig } from "../lib/repo-analyzer/types.js";

// A deliberately imperfect Node Dockerfile — single stage, root user,
// unpinned base, copies everything before installing (poor layer caching).
// A competent reviewer should propose improvements here.
const IMPERFECT_DOCKERFILE = [
  "FROM node:latest",
  "WORKDIR /app",
  "COPY . .",
  "RUN npm install",
  "RUN npm run build",
  "EXPOSE 3000",
  'CMD ["npm", "start"]',
].join("\n");

// A reasonable multi-stage Dockerfile — a reviewer may well approve this as-is.
const REASONABLE_DOCKERFILE = [
  "FROM public.ecr.aws/docker/library/node:20-slim AS builder",
  "WORKDIR /app",
  "COPY package.json package-lock.json* ./",
  "RUN npm ci || npm install",
  "COPY . .",
  "RUN npm run build",
  "",
  "FROM public.ecr.aws/docker/library/node:20-slim",
  "WORKDIR /app",
  "COPY --from=builder /app .",
  "USER node",
  "ENV PORT=3000",
  "EXPOSE 3000",
  'CMD ["npm", "start"]',
].join("\n");

const sampleRepoConfig = createRepoConfig({
  runtime: "node",
  framework: "generic",
  packageManager: "npm",
  runtimeVersion: "20",
  startCommand: "npm start",
  port: 3000,
});

const sampleManifest = {
  name: "package.json",
  content: JSON.stringify(
    {
      name: "smoke-sample",
      scripts: { build: "tsc", start: "node dist/index.js" },
      dependencies: { express: "^4.19.2" },
    },
    null,
    2,
  ),
};

async function runCase(label: string, dockerfile: string): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(`CASE: ${label}`);
  console.log("=".repeat(70));

  const started = Date.now();
  const result = await aiReviewDockerfile({
    apiKey: env.OPENAI_API_KEY!,
    model: env.OPENAI_MODEL,
    dockerfile,
    repoConfig: sampleRepoConfig,
    manifest: sampleManifest,
    envExample: "PORT=\nDATABASE_URL=\n",
    fileTree: ["package.json", "src/", "src/index.ts", "tsconfig.json"],
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nElapsed: ${elapsed}s`);
  console.log(`approved: ${result.approved}  |  revised: ${result.revised}`);
  if (result.skipReason) console.log(`skipReason: ${result.skipReason}`);

  if (result.changes.length > 0) {
    console.log("\nChanges:");
    for (const c of result.changes) console.log(`  - ${c.what} — ${c.why}`);
  }

  if (result.revised) {
    console.log("\n--- Revised Dockerfile ---");
    console.log(result.dockerfile);
  } else {
    console.log("\n(No revision applied — mechanical Dockerfile kept unchanged.)");
  }
}

async function main(): Promise<void> {
  await initConfig();

  if (!env.OPENAI_API_KEY) {
    console.log(
      "OPENAI_API_KEY is not set. Set it in your environment or root .env to run the live smoke test.\n" +
        "Example: OPENAI_API_KEY=sk-... pnpm --filter @dockier/backend-fastify smoke:ai-review",
    );
    return;
  }

  console.log(`Model: ${env.OPENAI_MODEL}  |  Review flag: ${env.AI_DOCKERFILE_REVIEW}`);

  await runCase("Imperfect Dockerfile (expect a revision)", IMPERFECT_DOCKERFILE);
  await runCase("Reasonable Dockerfile (may be approved as-is)", REASONABLE_DOCKERFILE);

  console.log("\nSmoke test complete.");
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
