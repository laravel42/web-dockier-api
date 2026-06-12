import type { RepoConfig } from "./types.js";

export function cleanVersion(v: string): string {
  if (!v) return "";
  return v.replace(/^[\^~>=<]+/, "").split(" ")[0];
}

/** Apply framework-specific Node.js minimums after engines/.nvmrc detection. */
export function finalizeNodeVersion(config: RepoConfig): void {
  if (config.runtime !== "node") return;

  let ver = parseInt(config.nodeVersion || config.runtimeVersion || "20", 10);
  if (Number.isNaN(ver)) ver = 20;

  let minVer = 18;

  if (config.framework === "Next.js") {
    // Modern Next.js SSR stacks (Payload, undici 7+, etc.) fail on Node 18.
    minVer = Math.max(minVer, 20);
  } else if (config.framework === "Nuxt" && config.features.has("ssr")) {
    minVer = Math.max(minVer, 20);
  } else if (config.features.has("payload")) {
    minVer = Math.max(minVer, 20);
  }

  if (ver < minVer) {
    config.nodeVersion = String(minVer);
    config.runtimeVersion = String(minVer);
  } else if (!config.nodeVersion) {
    config.nodeVersion = String(ver);
    config.runtimeVersion = String(ver);
  }
}

export function configSummary(config: RepoConfig): string[] {
  const lines: string[] = [];
  lines.push(`Runtime: ${config.runtime} ${config.runtimeVersion}`);
  if (config.framework) lines.push(`Framework: ${config.framework} ${config.frameworkVersion}`);
  lines.push(`Package manager: ${config.packageManager}${config.packageManagerVersion ? ` v${config.packageManagerVersion}` : ""}`);
  if (config.subDir) lines.push(`App directory: ${config.subDir}/`);
  if (config.nodeVersion) lines.push(`Node.js version: ${config.nodeVersion}`);
  if (config.phpVersion) lines.push(`PHP version: ${config.phpVersion}`);
  if (config.phpExtensions.length > 0) lines.push(`PHP extensions: ${config.phpExtensions.join(", ")}`);
  if (config.nativeDeps.length > 0) lines.push(`Native deps: ${config.nativeDeps.map(d => `${d.name} (${d.reason})`).join(", ")}`);
  if (config.hasStandalone) lines.push("Next.js standalone output: yes");
  if (config.features.size > 0) lines.push(`Features: ${[...config.features].join(", ")}`);
  return lines;
}
