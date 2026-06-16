import type { ConnectionLike, RepoRef } from "./provider-client.js";
import { fetchRepoFile, getRepoFileTree } from "./provider-client.js";
import { scanDependencies, type Dependency } from "./dependency-scanner.js";
import { suggestDeployOptions } from "./deploy-options.js";
import { detectServices, type DetectedService } from "./services.js";
import { detectTechStack, type TechStackItem } from "./tech-stack.js";

type SensitiveTable = {
  name: string;
  riskScore: number;
  columns: Array<{
    name: string;
    type: string;
    category: SensitiveField["sensitivity"];
    sensitivity: "critical" | "high" | "medium";
    reason: string;
    confidence: number;
  }>;
};

export function analyzeSensitiveDataFromText(schema: string): { tables: SensitiveTable[]; summary: { totalTables: number; highRiskTables: number; criticalFindings: string[] } } {
  const findings: SensitiveField[] = [];
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi;
  const sensitiveTokens = [
    { pattern: /password|token|secret|api_key|private_key/i, sensitivity: "secret" as const, reason: "Credential or secret material" },
    { pattern: /email|phone|address|name|birth|ip/i, sensitivity: "personal" as const, reason: "Personally identifiable data" },
    { pattern: /card|iban|ssn|tax|passport|salary|bank/i, sensitivity: "sensitive" as const, reason: "Financial or regulated identifier" },
  ];

  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRegex.exec(schema)) !== null) {
    const tableName = tableMatch[1];
    const body = tableMatch[2];
    const columnRegex = /^\s*["`]?(\w+)["`]?\s+[A-Z]/gim;
    let columnMatch: RegExpExecArray | null;
    while ((columnMatch = columnRegex.exec(body)) !== null) {
      const field = columnMatch[1];
      for (const token of sensitiveTokens) {
        if (token.pattern.test(field)) {
          findings.push({ entity: tableName, field, sensitivity: token.sensitivity, reason: token.reason });
          break;
        }
      }
    }
  }

  const grouped = new Map<string, SensitiveField[]>();
  for (const finding of findings) {
    const bucket = grouped.get(finding.entity) ?? [];
    bucket.push(finding);
    grouped.set(finding.entity, bucket);
  }
  const tables: SensitiveTable[] = Array.from(grouped.entries()).map(([name, columns]) => ({
    name,
    riskScore: Math.min(100, columns.length * 20 + (columns.some((c) => c.sensitivity === "secret") ? 40 : 0)),
    columns: columns.map((column) => ({
      name: column.field,
      type: "unknown",
      category: column.sensitivity,
      sensitivity: (column.sensitivity === "secret" ? "critical" : column.sensitivity === "sensitive" ? "high" : "medium") as "critical" | "high" | "medium",
      reason: column.reason,
      confidence: 0.85,
    })),
  }));

  return {
    tables,
    summary: {
      totalTables: tables.length,
      highRiskTables: tables.filter((table) => table.riskScore >= 61).length,
      criticalFindings: tables.filter((table) => table.riskScore >= 81).map((table) => `${table.name} contains high-risk secret fields`),
    },
  };
}

export type RepoAnalysisResult = {
  techStack: TechStackItem[];
  deployOptions: Array<{ provider: string; type: string; description: string }>;
  detectedServices: DetectedService[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  sensitiveData?: SensitiveField[];
  dependencies?: Dependency[];
  _scannersRan: boolean;
};

export type SensitiveField = {
  entity: string;
  field: string;
  sensitivity: "personal" | "sensitive" | "secret";
  reason: string;
};

const DEPENDENCY_FRAMEWORKS: Record<string, TechStackItem> = {
  react: { name: "React", category: "framework", confidence: 95 },
  vue: { name: "Vue", category: "framework", confidence: 95 },
  "@angular/core": { name: "Angular", category: "framework", confidence: 95 },
  svelte: { name: "Svelte", category: "framework", confidence: 95 },
  next: { name: "Next.js", category: "framework", confidence: 95 },
  nuxt: { name: "Nuxt", category: "framework", confidence: 95 },
  "@remix-run/react": { name: "Remix", category: "framework", confidence: 95 },
  astro: { name: "Astro", category: "framework", confidence: 95 },
  express: { name: "Express", category: "framework", confidence: 90 },
  fastify: { name: "Fastify", category: "framework", confidence: 90 },
  "@nestjs/core": { name: "NestJS", category: "framework", confidence: 90 },
  hono: { name: "Hono", category: "framework", confidence: 90 },
  "laravel/framework": { name: "Laravel", category: "framework", confidence: 95 },
  "symfony/symfony": { name: "Symfony", category: "framework", confidence: 95 },
  "@inertiajs/react": { name: "Inertia.js", category: "framework", confidence: 90 },
  "@inertiajs/vue3": { name: "Inertia.js", category: "framework", confidence: 90 },
  livewire: { name: "Livewire", category: "framework", confidence: 90 },
  "filament/filament": { name: "Filament", category: "framework", confidence: 90 },
  django: { name: "Django", category: "framework", confidence: 90 },
  flask: { name: "Flask", category: "framework", confidence: 90 },
  fastapi: { name: "FastAPI", category: "framework", confidence: 90 },
  "rails": { name: "Rails", category: "framework", confidence: 90 },
  "@prisma/client": { name: "Prisma", category: "database", confidence: 90 },
  drizzle: { name: "Drizzle ORM", category: "database", confidence: 90 },
  "tailwindcss": { name: "Tailwind CSS", category: "tool", confidence: 90 },
  "@mui/material": { name: "Material UI", category: "tool", confidence: 85 },
  "@chakra-ui/react": { name: "Chakra UI", category: "tool", confidence: 85 },
  antd: { name: "Ant Design", category: "tool", confidence: 85 },
  "react-native": { name: "React Native", category: "framework", confidence: 90 },
};

function enrichTechStackFromDependencies(
  techStack: TechStackItem[],
  dependencies: Dependency[],
): TechStackItem[] {
  const merged = new Map(techStack.map((item) => [item.name, item]));
  for (const dep of dependencies) {
    const framework = DEPENDENCY_FRAMEWORKS[dep.name];
    if (framework && !merged.has(framework.name)) {
      merged.set(framework.name, framework);
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}

const CONFIG_FILES_TO_FETCH = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "Gemfile",
  "prisma/schema.prisma",
  "go.mod",
  "Cargo.toml",
];

export async function runRepoAnalysis(connection: ConnectionLike, ref: RepoRef): Promise<RepoAnalysisResult> {
  const files = await getRepoFileTree(connection, ref);
  const techStack = detectTechStack(files);
  const hasDocker = files.some((file) => /Dockerfile/i.test(file));
  const hasCi = files.some((file) => /\.github\/workflows\/|\.gitlab-ci\.yml|Jenkinsfile|\.circleci/i.test(file));
  const detectedServices = detectServices(files);

  const configFiles: Record<string, string> = {};
  for (const candidate of CONFIG_FILES_TO_FETCH) {
    const path = files.find((file) => file.toLowerCase().endsWith(candidate.toLowerCase()));
    if (!path) continue;
    const content = await fetchRepoFile(connection, ref, path);
    if (content) configFiles[path] = content;
  }

  const dependencies = await scanDependencies(configFiles);
  const mergedTechStack = enrichTechStackFromDependencies(techStack, dependencies);

  return {
    techStack: mergedTechStack,
    deployOptions: suggestDeployOptions(mergedTechStack, hasDocker, files.length).map((option) => ({
      provider: option.provider,
      type: option.type,
      description: option.description,
    })),
    detectedServices,
    repoSize: files.length,
    primaryLanguage: mergedTechStack.find((item) => item.category === "language" || item.category === "runtime")?.name ?? "",
    hasDocker,
    hasCi,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    _scannersRan: true,
  };
}
