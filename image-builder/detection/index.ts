// ─── Stack Detection Orchestrator ───

import { join } from "node:path";
import type { DetectedStack } from "./types";
import { detectSubDir } from "./helpers";
import { detectNode, nodeDockerfile } from "./node";
import { detectPhp, phpDockerfile } from "./php";
import { detectPython, pythonDockerfile } from "./python";
import { detectGo, goDockerfile } from "./go";

export type { DetectedStack } from "./types";
export { detectNodePM, detectSubDir } from "./helpers";
export { detectNode, nodeDockerfile } from "./node";
export { detectPhp, phpDockerfile } from "./php";
export { detectPython, pythonDockerfile } from "./python";
export { detectGo, goDockerfile } from "./go";

export function detectStack(repoDir: string): DetectedStack {
  const subDir = detectSubDir(repoDir);
  const appDir = subDir ? join(repoDir, subDir) : repoDir;

  // PHP
  const php = detectPhp(appDir, subDir);
  if (php) return php;

  // Python (check before Node.js — Django projects often have package.json for frontend tooling)
  const python = detectPython(appDir, subDir);
  if (python) return python;

  // Node.js
  const node = detectNode(appDir, repoDir, subDir);
  if (node) return node;

  // Go
  const go = detectGo(appDir, subDir);
  if (go) return go;

  return { runtime: "unknown", subDir };
}

export function generateDockerfile(stack: DetectedStack, repoDir: string): string {
  switch (stack.runtime) {
    case "node": return nodeDockerfile(stack, repoDir);
    case "php": return phpDockerfile(stack, repoDir);
    case "python": return pythonDockerfile(stack);
    case "go": return goDockerfile(repoDir);
    default: return "";
  }
}
