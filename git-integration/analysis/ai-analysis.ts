import { BedrockApiKey, BedrockRegion, BedrockAccountId } from "../shared";
import type { TechStackItem } from "./tech-stack";
import type { DetectedService } from "./services";

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

// ─── AI-powered repo analysis ───

export const CONFIG_FILES_TO_FETCH = [
  "composer.json", "package.json", "Dockerfile", "docker-compose.yml",
  ".env.example", "requirements.txt", "Pipfile", "pyproject.toml",
  "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "build.gradle",
  "nginx.conf", "supervisor.conf", "supervisord.conf",
];

export async function analyzeWithAI(
  aiType: string,
  aiConfig: Record<string, string>,
  files: string[],
  configContents: Record<string, string>,
  techStack: TechStackItem[],
  detectedServices: DetectedService[],
): Promise<AIRepoAnalysis | null> {
  const configSummary = Object.entries(configContents)
    .map(([f, c]) => `── ${f} ──\n${c.slice(0, 3000)}`)
    .join("\n\n");

  const prompt = `You are a DevOps architect. Analyze this repository and return a JSON object for deployment configuration.

**Detected tech stack:** ${techStack.map(t => `${t.name} (${t.category})`).join(", ")}
**Detected services:** ${detectedServices.map(s => `${s.name} (${s.type})`).join(", ") || "none"}
**File tree (sample):** ${files.slice(0, 200).join(", ")}

**Config file contents:**
${configSummary}

Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "runtime": "php|node|python|go|ruby|java|rust|dotnet",
  "runtimeVersion": "exact version string e.g. 8.3 or 20",
  "framework": "framework name e.g. Laravel, Next.js, Django",
  "frameworkVersion": "exact version e.g. 11.x",
  "phpExtensions": ["array of required PHP extensions if PHP, else empty"],
  "nodeVersion": "node version if needed for asset building, else empty string",
  "buildCommand": "full build command for production",
  "startCommand": "full start command for production",
  "port": 8080,
  "needsScheduler": true/false,
  "needsQueueWorker": true/false,
  "needsWebsockets": true/false,
  "envVars": ["KEY=default_or_placeholder for essential env vars"],
  "postDeployCommands": ["commands to run after deploy e.g. php artisan migrate --force"],
  "nginxConfig": "php-fpm|reverse-proxy|static",
  "summary": "1-2 sentence summary of the architecture",
  "deployOptions": [
    {
      "provider": "provider name e.g. AWS, GCP",
      "type": "deployment type e.g. EC2 Instance, ECS Fargate, Cloud Run, Compute Engine, S3 + CloudFront",
      "description": "1-2 sentence description of why this option fits this specific project",
      "pros": ["3-4 specific pros for THIS project, not generic"],
      "cons": ["2-3 specific cons for THIS project, not generic"],
      "estimatedMonthlyCost": "realistic cost range based on detected services",
      "bestFor": "one sentence on when to pick this option"
    }
  ]
}

IMPORTANT for deployOptions:
- Suggest 3-6 realistic options ranked by fit for this specific project
- Only suggest AWS and GCP as cloud providers
- Consider the detected services (database, cache, queue, etc.) when estimating costs
- For PHP/Laravel projects: prioritize VPS options (AWS EC2, GCP Compute Engine) and managed container services
- For Node.js/Python: include serverless and container options (ECS Fargate, Cloud Run)
- For static sites: suggest AWS S3 + CloudFront or GCP Cloud Storage + CDN
- Include at least one budget option and one premium/enterprise option
- Be specific about WHY each option fits (or doesn't) based on the actual tech stack and services detected
- Cost estimates should account for: compute + database + cache + storage needs

Be precise with versions — read them from composer.json/package.json/etc.`;

  try {
    const apiKey = BedrockApiKey();
    if (!apiKey) return null;
    const region = BedrockRegion() || "us-east-1";
    const accountId = BedrockAccountId() || "";
    const modelId = "us.anthropic.claude-sonnet-4-20250514-v1:0";
    const modelArn = `arn:aws:bedrock:${region}:${accountId}:inference-profile/${modelId}`;
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelArn)}/converse`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { temperature: 0.1, maxTokens: 4096 },
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text = data.output?.message?.content?.[0]?.text?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) as AIRepoAnalysis : null;
  } catch (e: any) {
    console.error("AI analysis failed:", e.message);
  }
  return null;
}
