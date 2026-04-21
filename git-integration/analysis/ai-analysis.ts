import { OpenAIApiKey } from "../shared";
import type { TechStackItem } from "./tech-stack";
import type { DetectedService } from "./services";

export interface UserJourneyNode {
  label: string;
  icon?: string;
  children?: UserJourneyNode[];
}

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
  dataFlow?: {
    entities: Array<{
      name: string;
      description: string;
      storage: string;
      fields: Array<{
        name: string;
        type: string;
        sensitivity: "public" | "internal" | "personal" | "sensitive" | "secret";
      }>;
    }>;
  };
  userJourney?: {
    label: string;
    icon?: string;
    children?: UserJourneyNode[];
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

async function callOpenAI(prompt: string, maxTokens = 8192): Promise<any | null> {
  const apiKey = OpenAIApiKey();
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    console.error(`[AI] OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
    return null;
  }

  const data: any = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "";

  if (data.choices?.[0]?.finish_reason === "length") {
    console.error(`[AI] Response truncated (${text.length} chars)`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[AI] JSON parse failed: ${e.message}`);
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

// ─── Call 1: Core analysis + sections + deployOptions ───

async function fetchCoreAnalysis(context: string): Promise<Partial<AIRepoAnalysis> | null> {
  const prompt = `You are a DevOps architect. Analyze this repository and return a JSON object.

${context}

Return ONLY valid JSON with these fields:
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
  "sections": {
    "overview": "Rich markdown (300-500 words). Project purpose, value proposition, target audience, what makes it unique.",
    "howItWorks": "Rich markdown (300-500 words). Full application flow, user interactions, API patterns, routing, request lifecycle, background processing.",
    "techStack": "Rich markdown (300-500 words). Every technology grouped by category with version numbers and role descriptions.",
    "architecture": "Rich markdown (300-500 words). Monolith vs microservices, frontend/backend split, API design, database layer, caching, queues, patterns.",
    "dataStorage": "Rich markdown (300-500 words). Database schemas, relationships, indexing, file storage, caching layers, session storage, data pipelines.",
    "codeQuality": "Rich markdown (300-500 words). Code patterns, testing setup, linting, CI/CD, directory structure, naming conventions, dependency management.",
    "security": "Rich markdown (300-500 words). Authentication, authorization, input validation, CSRF/XSS, password hashing, rate limiting, security dependencies.",
    "deployment": "Rich markdown (300-500 words). Deploy process, Docker support, build commands, env vars, health checks, scaling, CI/CD integration."
  },
  "deployOptions": [
    {"provider": "AWS or GCP", "type": "deployment type", "description": "why it fits", "pros": ["specific pros"], "cons": ["specific cons"], "estimatedMonthlyCost": "range", "bestFor": "when to pick"}
  ]
}

Use **bold**, bullet lists with -, and inline code with backticks in all section markdown. Be precise with versions. Suggest 3-6 deploy options for AWS and GCP only.`;

  console.log("[AI] Call 1: Core analysis + sections...");
  return callOpenAI(prompt, 16384);
}

// ─── Call 2: Data flow / collected data ───

async function fetchDataFlow(context: string, schemaFiles: Record<string, string>): Promise<AIRepoAnalysis["dataFlow"] | null> {
  const schemaSummary = Object.entries(schemaFiles)
    .map(([f, c]) => `── ${f} ──\n${c.slice(0, 5000)}`)
    .join("\n\n");

  const prompt = `You are a data privacy analyst. Analyze this repository's database schemas, migrations, and models to produce a complete data inventory.

${context}

${schemaSummary ? `**Database schemas, migrations, and model definitions (READ THESE CAREFULLY — they contain the actual column names):**\n${schemaSummary}\n` : ""}

Return ONLY valid JSON:
{
  "entities": [
    {
      "name": "Entity name e.g. Users, Products, Invoices",
      "description": "What this entity represents and its business purpose",
      "storage": "Where stored e.g. PostgreSQL users table, Redis cache, S3 bucket",
      "fields": [
        {"name": "actual_column_name", "type": "string|email|hash|token|url|phone|address|text|json|file|boolean|integer|decimal|date|enum", "sensitivity": "public|internal|personal|sensitive|secret"}
      ]
    }
  ]
}

CRITICAL RULES:
1. Read EVERY migration file and model definition provided above. Extract ALL columns/fields from CREATE TABLE statements, model properties, and schema definitions.
2. Use the EXACT column/field names from the code — do not rename or paraphrase them.
3. EXCLUDE these fields from every entity: id, uuid, primary keys, foreign keys (*_id), created_at, updated_at, deleted_at, timestamps.
4. EXCLUDE these framework/infrastructure tables entirely: jobs, failed_jobs, job_batches, sessions, cache, cache_locks, password_reset_tokens, personal_access_tokens, telescope_entries, telescope_monitoring, migrations, oauth_*, pulse_*, env vars.
5. Only include tables/entities that represent actual business data the application manages.
6. For each field, assign sensitivity accurately:
   - public: display names, titles, slugs, published content
   - internal: status flags, types, counts, internal references
   - personal: name, email, phone, address, date of birth, IP address, user agent
   - sensitive: financial data, health data, government IDs, payment info
   - secret: password hashes, API keys, tokens, secrets, private keys
7. Include entities from ALL sources: database tables, Redis/cache structures, file uploads, API request/response data, localStorage/cookies.
8. Aim for completeness: every business table should appear with ALL its non-excluded columns.`;

  console.log("[AI] Call 2: Data flow...");
  const result = await callOpenAI(prompt, 12288);
  return result?.entities ? { entities: result.entities } : null;
}

// ─── Call 3: User journey tree ───

async function fetchUserJourney(context: string): Promise<AIRepoAnalysis["userJourney"] | null> {
  const prompt = `You are a UX analyst. Analyze this repository and map the complete user journey as a tree.

${context}

Return ONLY valid JSON — a single tree node:
{
  "label": "App Entry",
  "children": [
    {
      "label": "Step or screen name",
      "children": [
        {"label": "Sub-action", "children": []}
      ]
    }
  ]
}

IMPORTANT:
- Root is the app entry point
- STRICTLY 2 levels deep only (root → main sections → actions). Never go deeper.
- Root should have 4-6 children representing main app sections
- Each section should have 2-4 leaf actions
- Total: 12-20 nodes maximum
- Use short descriptive labels: "Login", "Dashboard", "Settings"
- Do NOT include icon fields
- Merge similar flows into single nodes`;

  console.log("[AI] Call 3: User journey...");
  const result = await callOpenAI(prompt, 2048);
  return result?.label ? result : null;
}

// ─── Main entry point: only core AI analysis ───

export async function analyzeWithAI(
  _aiType: string,
  _aiConfig: Record<string, string>,
  files: string[],
  configContents: Record<string, string>,
  techStack: TechStackItem[],
  detectedServices: DetectedService[],
  schemaFiles?: Record<string, string>,
): Promise<AIRepoAnalysis | null> {
  const apiKey = OpenAIApiKey();
  if (!apiKey) { console.error("[AI] OpenAIApiKey not configured"); return null; }

  const configSummary = Object.entries(configContents)
    .map(([f, c]) => `── ${f} ──\n${c.slice(0, 3000)}`)
    .join("\n\n");

  const context = buildContext(techStack, detectedServices, files, configSummary);

  console.log("[AI] Calling core analysis...");
  const core = await fetchCoreAnalysis(context);

  if (!core) {
    console.error("[AI] Core analysis failed");
    return null;
  }

  console.log(`[AI] Done. sections=${!!core.sections}`);
  return core as AIRepoAnalysis;
}
