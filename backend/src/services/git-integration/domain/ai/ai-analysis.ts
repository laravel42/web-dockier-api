/**
 * AI-powered repository analysis using OpenAI.
 *
 * Performs parallel AI calls to analyze different aspects of a repository:
 * - Core analysis: runtime, framework, commands, deploy options
 * - Section analysis: overview, architecture, data storage, security, etc.
 */

import type { TechStackItem } from "../tech-stack.js";
import type { DetectedService } from "../services.js";
import { logger } from "../../../../shared/logger.js";
import { callOpenAIJson } from "./openai-client.js";
import { env } from "../../../../shared/config.js";
import { fetchRepoFile, getRepoFileTree, type ConnectionLike, type RepoRef } from "../providers/provider-client.js";

// ─── Types ───

export interface AIRepoAnalysis {
  runtime: string;
  runtimeVersion: string;
  framework: string;
  frameworkVersion: string;
  phpExtensions?: string[];
  nodeVersion?: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  needsScheduler: boolean;
  needsQueueWorker: boolean;
  needsWebsockets: boolean;
  envVars: string[];
  nginxConfig: "php-fpm" | "reverse-proxy" | "static";
  summary: string;
  description: string;
  sections?: {
    overview: string;
    howItWorks: string;
    techStack: string;
    architecture: string;
    dataStorage: string;
    codeQuality: string;
    security: string;
    deployment: string;
  };
  deployOptions?: Array<{
    provider: string;
    type: string;
    description: string;
    pros: string[];
    cons: string[];
    estimatedMonthlyCost: string;
    bestFor: string;
  }>;
}

export const CONFIG_FILES_TO_FETCH = [
  "composer.json", "package.json", "Dockerfile", "docker-compose.yml",
  ".env.example", "requirements.txt", "Pipfile", "pyproject.toml",
  "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "build.gradle",
  "nginx.conf", "supervisor.conf", "supervisord.conf",
];

// ─── Shared OpenAI caller ───

async function callOpenAI(apiKey: string, model: string, prompt: string, maxTokens = 4096): Promise<Record<string, unknown> | null> {
  return callOpenAIJson<Record<string, unknown>>({
    apiKey,
    model,
    messages: [{ role: "user", content: prompt }],
    maxTokens,
    logTag: "[AI]",
    truncation: "null",
  });
}

// ─── Context builder ───

function buildContext(techStack: TechStackItem[], detectedServices: DetectedService[], files: string[], configSummary: string): string {
  return `**Detected tech stack:** ${techStack.map(t => `${t.name} (${t.category})`).join(", ")}
**Detected services:** ${detectedServices.map(s => `${s.name} (${s.type})`).join(", ") || "none"}
**File tree (sample):** ${files.slice(0, 200).join(", ")}

**Config file contents:**
${configSummary}`;
}

// ─── Section definitions ───

interface SectionDef {
  key: string;
  role: string;
  instruction: string;
  relevantFiles?: RegExp[];
  maxTokens: number;
}

const SECTION_DEFS: SectionDef[] = [
  { key: "overview", role: "You are a product analyst.", instruction: "Write a concise overview (200-300 words). Explain purpose, target users, value proposition. Use **bold**, bullet lists, inline `code`.", maxTokens: 2048 },
  { key: "howItWorks", role: "You are a backend architect.", instruction: "Explain how this system works (200-350 words). Cover request lifecycle, routing, controllers, background jobs.", maxTokens: 2048 },
  { key: "architecture", role: "You are a software architect.", instruction: "Describe the system architecture (200-350 words). Include frontend/backend split, API style, design patterns.", maxTokens: 2048 },
  { key: "dataStorage", role: "You are a data architect.", instruction: "Describe data storage (200-350 words). Include database type, relationships, caching.", maxTokens: 2048 },
  { key: "codeQuality", role: "You are a code quality expert.", instruction: "Analyze code quality (200-300 words). Include testing, linting, CI/CD.", maxTokens: 2048 },
  { key: "security", role: "You are a security expert.", instruction: "Analyze security (200-350 words). Include auth, input validation, CSRF/XSS.", maxTokens: 2048 },
  { key: "deployment", role: "You are a DevOps engineer.", instruction: "Explain deployment (200-350 words). Include Docker, CI/CD, hosting, build/start commands.", maxTokens: 2048 },
];

// ─── Per-section AI call ───

async function fetchSection(apiKey: string, model: string, def: SectionDef, context: string, fileTree: string[]): Promise<{ key: string; content: string } | null> {
  const relevantTree = def.relevantFiles
    ? fileTree.filter(f => def.relevantFiles!.some(p => p.test(f))).slice(0, 80)
    : fileTree.slice(0, 100);

  const prompt = `${def.role}\n\n${context}\n\n**Relevant files:** ${relevantTree.join(", ") || "none matched"}\n\n${def.instruction}\n\nReturn ONLY valid JSON: {"content": "your markdown here"}`;

  const result = await callOpenAI(apiKey, model, prompt, def.maxTokens);
  if (result && typeof result.content === "string" && (result.content as string).length > 10) {
    return { key: def.key, content: result.content as string };
  }
  return null;
}

// ─── Core analysis ───

async function fetchCoreAnalysis(apiKey: string, model: string, context: string): Promise<Partial<AIRepoAnalysis> | null> {
  const prompt = `You are a DevOps architect. Analyze this repository and return deployment configuration.\n\n${context}\n\nReturn ONLY valid JSON with: runtime, runtimeVersion, framework, frameworkVersion, phpExtensions, nodeVersion, buildCommand, startCommand, port, needsScheduler, needsQueueWorker, needsWebsockets, envVars, nginxConfig, summary, description, deployOptions (3-6 for AWS and GCP).`;

  return callOpenAI(apiKey, model, prompt, 4096) as Promise<Partial<AIRepoAnalysis> | null>;
}

// ─── Main entry point ───

export async function analyzeWithAI(
  apiKey: string,
  model: string,
  files: string[],
  configContents: Record<string, string>,
  techStack: TechStackItem[],
  detectedServices: DetectedService[],
): Promise<AIRepoAnalysis | null> {
  if (!apiKey) { logger.error("[AI] API key not provided"); return null; }

  const configSummary = Object.entries(configContents)
    .map(([f, c]) => `── ${f} ──\n${c.slice(0, 3000)}`)
    .join("\n\n");

  const context = buildContext(techStack, detectedServices, files, configSummary);

  logger.info("[AI] Starting parallel calls: 1 core + 7 sections...");
  const startTime = Date.now();

  const [coreResult, ...sectionResults] = await Promise.allSettled([
    fetchCoreAnalysis(apiKey, model, context),
    ...SECTION_DEFS.map(def => fetchSection(apiKey, model, def, context, files)),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[AI] All parallel calls completed in ${elapsed}s`);

  const core = coreResult.status === "fulfilled" ? coreResult.value : null;
  if (!core) { logger.error("[AI] Core analysis failed"); return null; }

  const sections: Record<string, string> = {};
  for (const result of sectionResults) {
    if (result.status === "fulfilled" && result.value) {
      sections[result.value.key] = result.value.content;
    }
  }

  return {
    ...core,
    sections: {
      overview: sections.overview || "",
      howItWorks: sections.howItWorks || "",
      techStack: "",
      architecture: sections.architecture || "",
      dataStorage: sections.dataStorage || "",
      codeQuality: sections.codeQuality || "",
      security: sections.security || "",
      deployment: sections.deployment || "",
    },
  } as AIRepoAnalysis;
}

/**
 * Fetch the repo's file tree + config file contents and run {@link analyzeWithAI}.
 *
 * Wraps the "gather context then call the model" flow the repo-analyze route
 * used to inline (twice). The caller supplies the already-computed tech stack
 * and detected services. Returns null when the OpenAI key is unset or the
 * analysis fails, so callers can treat AI enrichment as best-effort.
 */
export async function runAiAnalysisForRepo(
  connection: ConnectionLike,
  ref: RepoRef,
  techStack: TechStackItem[],
  detectedServices: DetectedService[],
): Promise<AIRepoAnalysis | null> {
  if (!env.OPENAI_API_KEY) return null;

  const files = await getRepoFileTree(connection, ref);
  const configContents: Record<string, string> = {};
  for (const candidate of CONFIG_FILES_TO_FETCH) {
    const path = files.find((f) => f.toLowerCase().endsWith(candidate.toLowerCase()));
    if (!path) continue;
    const content = await fetchRepoFile(connection, ref, path);
    if (content) configContents[path] = content;
  }

  return analyzeWithAI(
    env.OPENAI_API_KEY,
    env.OPENAI_MODEL,
    files,
    configContents,
    techStack,
    detectedServices,
  );
}
