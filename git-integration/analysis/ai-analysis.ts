import { OpenAIApiKey } from "../shared";
import { DEV_DUMMY_ANALYSIS } from "./dev-dummy-analysis";
import type { TechStackItem } from "./tech-stack";
import type { DetectedService } from "./services";

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
  postDeployCommands: string[];
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

// ─── Shared OpenAI caller (temperature=0, strict JSON) ───

async function callOpenAI(prompt: string, maxTokens = 4096): Promise<Record<string, unknown> | null> {
  const apiKey = OpenAIApiKey();
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    console.error(`[AI] OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
    return null;
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  const text = data.choices?.[0]?.message?.content?.trim() || "";

  if (data.choices?.[0]?.finish_reason === "length") {
    console.error(`[AI] Response truncated (${text.length} chars)`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e: unknown) {
    console.error(`[AI] JSON parse failed: ${(e as Error).message}`);
    return null;
  }
}

// ─── Context builder ───

function buildContext(techStack: TechStackItem[], detectedServices: DetectedService[], files: string[], configSummary: string): string {
  return `**Detected tech stack:** ${techStack.map(t => `${t.name} (${t.category})`).join(", ")}
**Detected services:** ${detectedServices.map(s => `${s.name} (${s.type})`).join(", ") || "none"}
**File tree (sample):** ${files.slice(0, 200).join(", ")}

**Config file contents:**
${configSummary}`;
}

// ─── Validation ───

function validateSection(res: Record<string, unknown> | null): string | null {
  if (res && typeof res.content === "string" && res.content.length > 10) return res.content as string;
  return null;
}

// ─── Section definitions (each runs as independent AI job) ───

interface SectionDef {
  key: string;
  role: string;
  instruction: string;
  relevantFiles?: RegExp[];
  maxTokens: number;
}

const SECTION_DEFS: SectionDef[] = [
  {
    key: "overview",
    role: "You are a product analyst.",
    instruction: `Write a concise but rich overview of this project.

Rules:
- 200–300 words
- Explain purpose, target users, and value proposition
- No hallucinated technologies
- Focus on product understanding, not deep technical detail
- Use **bold**, bullet lists, and inline \`code\` for readability`,
    relevantFiles: [/readme/i, /composer\.json$/, /package\.json$/, /\.env\.example$/],
    maxTokens: 2048,
  },
  {
    key: "howItWorks",
    role: "You are a backend architect.",
    instruction: `Explain how this system works.

Rules:
- 200–350 words
- Cover the full request lifecycle
- Include routing, controllers, APIs
- Mention background jobs if present
- No hallucinated technologies
- Use **bold**, bullet lists, and inline \`code\``,
    relevantFiles: [/routes/i, /controller/i, /middleware/i, /kernel/i, /console/i, /commands/i, /jobs/i, /listeners/i],
    maxTokens: 2048,
  },
  {
    key: "architecture",
    role: "You are a software architect.",
    instruction: `Describe the system architecture.

Rules:
- 200–350 words
- Include frontend/backend split
- API style (REST, GraphQL)
- Design patterns (MVC, Repository, Service Layer, etc.)
- No hallucinated services
- Use **bold**, bullet lists, and inline \`code\``,
    relevantFiles: [/providers/i, /services/i, /repositories/i, /docker/i, /config/i],
    maxTokens: 2048,
  },
  {
    key: "dataStorage",
    role: "You are a data architect.",
    instruction: `Describe data storage.

Rules:
- 200–350 words
- Include database type
- Relationships
- Caching if present
- No guessing
- Use **bold**, bullet lists, and inline \`code\``,
    relevantFiles: [/migration/i, /schema/i, /database/i, /models/i, /config\/database/i, /config\/cache/i],
    maxTokens: 2048,
  },
  {
    key: "codeQuality",
    role: "You are a code quality expert.",
    instruction: `Analyze code quality.

Rules:
- 200–300 words
- Include testing tools
- Linting/formatting
- CI/CD if present
- No assumptions
- Use **bold**, bullet lists, and inline \`code\``,
    relevantFiles: [/phpunit/i, /jest/i, /vitest/i, /eslint/i, /prettier/i, /\.github/i, /gitlab-ci/i, /phpstan/i, /psalm/i, /test/i],
    maxTokens: 2048,
  },
  {
    key: "security",
    role: "You are a security expert.",
    instruction: `Analyze security.

Rules:
- 200–350 words
- Include auth (JWT, session, OAuth)
- Input validation, CSRF/XSS
- Highlight risks if visible
- No hallucinated vulnerabilities
- Use **bold**, bullet lists, and inline \`code\``,
    relevantFiles: [/auth/i, /guard/i, /policy/i, /middleware/i, /config\/auth/i, /config\/cors/i, /sanctum/i, /passport/i],
    maxTokens: 2048,
  },
  {
    key: "deployment",
    role: "You are a DevOps engineer.",
    instruction: `Explain deployment.

Rules:
- 200–350 words
- Include Docker, CI/CD, hosting if present
- Include build/start commands if detectable
- No hallucinated infrastructure
- Use **bold**, bullet lists, and inline \`code\``,
    relevantFiles: [/docker/i, /\.github/i, /gitlab-ci/i, /deploy/i, /supervisor/i, /nginx/i, /\.env/i, /procfile/i],
    maxTokens: 2048,
  },
];

// ─── Per-section AI call ───

async function fetchSection(def: SectionDef, context: string, fileTree: string[]): Promise<{ key: string; content: string } | null> {
  const relevantTree = def.relevantFiles
    ? fileTree.filter(f => def.relevantFiles!.some(p => p.test(f))).slice(0, 80)
    : fileTree.slice(0, 100);

  const prompt = `${def.role}

${context}

**Relevant files:** ${relevantTree.join(", ") || "none matched"}

${def.instruction}

Return ONLY valid JSON: {"content": "your markdown here"}`;

  const result = await callOpenAI(prompt, def.maxTokens);
  const content = validateSection(result);
  if (content) return { key: def.key, content };
  console.error(`[AI] Section "${def.key}" failed validation`);
  return null;
}

// ─── Core analysis (runtime, framework, commands, deploy options) ───

async function fetchCoreAnalysis(context: string): Promise<Partial<AIRepoAnalysis> | null> {
  const prompt = `You are a DevOps architect. Analyze this repository and return deployment configuration.

${context}

Return ONLY valid JSON:
{
  "runtime": "php|node|python|go|ruby|java|rust|dotnet",
  "runtimeVersion": "version string",
  "framework": "framework name",
  "frameworkVersion": "version",
  "phpExtensions": [],
  "nodeVersion": "",
  "buildCommand": "build command",
  "startCommand": "start command",
  "port": 8080,
  "needsScheduler": false,
  "needsQueueWorker": false,
  "needsWebsockets": false,
  "envVars": ["KEY=value"],
  "postDeployCommands": [],
  "nginxConfig": "php-fpm|reverse-proxy|static",
  "summary": "1-2 sentence summary",
  "description": "3-4 sentence project description",
  "deployOptions": [
    {"provider": "AWS or GCP", "type": "type", "description": "why", "pros": [], "cons": [], "estimatedMonthlyCost": "range", "bestFor": "when"}
  ]
}

Be precise with versions. Suggest 3-6 deploy options for AWS and GCP only.`;

  return callOpenAI(prompt, 4096) as Promise<Partial<AIRepoAnalysis> | null>;
}

// ─── Main entry point: parallel execution ───

export async function analyzeWithAI(
  _aiType: string,
  _aiConfig: Record<string, string>,
  files: string[],
  configContents: Record<string, string>,
  techStack: TechStackItem[],
  detectedServices: DetectedService[],
): Promise<AIRepoAnalysis | null> {

  // Dev mode: return dummy data to avoid wasting OpenAI tokens
  if (process.env.ENCORE_RUNTIME_ENV !== "production" && process.env.AI_SKIP_DEV !== "false") {
    console.log("[AI] Dev mode — returning dummy analysis data (set AI_SKIP_DEV=false to use real AI)");
    return DEV_DUMMY_ANALYSIS;
  }

  const apiKey = OpenAIApiKey();
  if (!apiKey) { console.error("[AI] OpenAIApiKey not configured"); return null; }

  const configSummary = Object.entries(configContents)
    .map(([f, c]) => `── ${f} ──\n${c.slice(0, 3000)}`)
    .join("\n\n");

  const context = buildContext(techStack, detectedServices, files, configSummary);

  // All calls run in parallel via Promise.allSettled (partial failures allowed)
  console.log("[AI] Starting parallel calls: 1 core + 7 sections...");
  const startTime = Date.now();

  const [coreResult, ...sectionResults] = await Promise.allSettled([
    fetchCoreAnalysis(context),
    ...SECTION_DEFS.map(def => fetchSection(def, context, files)),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[AI] All parallel calls completed in ${elapsed}s`);

  const core = coreResult.status === "fulfilled" ? coreResult.value : null;
  if (!core) {
    console.error("[AI] Core analysis failed");
    return null;
  }

  // Assemble sections from settled results
  const sections: Record<string, string> = {};
  for (const result of sectionResults) {
    if (result.status === "fulfilled" && result.value) {
      sections[result.value.key] = result.value.content;
    }
  }

  const completed = Object.keys(sections);
  const failed = SECTION_DEFS.map(d => d.key).filter(k => !sections[k]);
  console.log(`[AI] Sections completed: ${completed.join(", ")}${failed.length ? ` | Failed: ${failed.join(", ")}` : ""}`);

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
