import type { Deployment } from "../types";

const LOG_URL_PATTERNS = [
  /(?:✓\s*)?App URL:\s*(https?:\/\/\S+)/i,
  /Application URL:\s*(https?:\/\/\S+)/i,
  /appUrl\s*=\s*(https?:\/\/\S+)/i,
];

function cleanUrl(raw: string): string {
  return raw.replace(/[),.;]+$/, "");
}

/** Prefer stored appUrl; fall back to the last URL found in deploy logs. */
export function resolveDeployUrl(deploy: Pick<Deployment, "appUrl" | "logs">): string {
  const stored = deploy.appUrl?.trim();
  if (stored) return stored;

  const logs = deploy.logs || "";
  const found: string[] = [];

  for (const pattern of LOG_URL_PATTERNS) {
    for (const match of logs.matchAll(new RegExp(pattern.source, "gim"))) {
      const url = cleanUrl(match[1]);
      if (url && url !== "(not found)") found.push(url);
    }
  }

  return found.at(-1) ?? "";
}
