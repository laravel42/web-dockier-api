/**
 * Deploy Log Builder
 *
 * Centralized utility for building timestamped deploy log lines.
 * Eliminates repeated inline timestamp formatting across the deploy hooks.
 */

export function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function logLine(msg: string): string {
  return `[${timestamp()}] ${msg}`;
}

export function logSection(title: string): string {
  return logLine(`── ${title} ──────────────`);
}

export function logSuccess(msg: string): string {
  return logLine(`✓ ${msg}`);
}

export function logError(msg: string): string {
  return logLine(`✗ ${msg}`);
}

export function logInfo(msg: string): string {
  return logLine(`ℹ ${msg}`);
}

export function logWarning(msg: string): string {
  return logLine(`⚠ ${msg}`);
}

export function logStart(msg: string): string {
  return logLine(`▶ ${msg}`);
}

export function logEmpty(): string {
  return `[${timestamp()}]`;
}

/**
 * Build the initial log header for a deployment.
 */
export function buildDeployHeader(opts: {
  provider: string;
  region: string;
  strategy: string;
  repo: string;
  branch: string;
}): string[] {
  return [
    logStart("Starting deployment pipeline..."),
    logInfo(`Provider: ${opts.provider} | Region: ${opts.region}`),
    logInfo(`Strategy: ${opts.strategy}`),
    logInfo(`Repository: ${opts.repo} | Branch: ${opts.branch}`),
    logEmpty(),
  ];
}

/**
 * Build log lines for the analysis summary section.
 */
export function buildAnalysisLogs(analysis: {
  primaryLanguage?: string;
  aiAnalysis?: {
    runtimeVersion?: string;
    framework?: string;
    frameworkVersion?: string;
    port?: number;
  };
  techStack?: Array<{ name: string }>;
}, deployTarget: string): string[] {
  const lines: string[] = [logSection("Analyze Repository")];

  if (analysis.primaryLanguage) {
    lines.push(logInfo(`Runtime: ${analysis.primaryLanguage}${analysis.aiAnalysis?.runtimeVersion ? " " + analysis.aiAnalysis.runtimeVersion : ""}`));
  }
  if (analysis.aiAnalysis?.framework) {
    lines.push(logInfo(`Framework: ${analysis.aiAnalysis.framework}${analysis.aiAnalysis.frameworkVersion ? " " + analysis.aiAnalysis.frameworkVersion : ""}`));
  }
  if (analysis.techStack?.length) {
    lines.push(logInfo(`Tech stack: ${analysis.techStack.map(t => t.name).join(", ")}`));
  }
  if (analysis.aiAnalysis?.port) {
    lines.push(logInfo(`Port: ${analysis.aiAnalysis.port}`));
  }
  lines.push(logInfo(`Deploy target: ${deployTarget}`));
  lines.push(logEmpty());

  return lines;
}
