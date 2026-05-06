// ─── Per-Stack Build Phases ───

import { buildAndPush } from "./common";

export function nodeBuildPhase(stack: { framework: string; packageManager: string }): string {
  return `  build:
    commands:
      - echo "Building Node.js (${stack.framework}) with ${stack.packageManager}"
${buildAndPush()}`;
}

export function phpBuildPhase(stack: { framework: string; hasNodeAssets: boolean }): string {
  return `  build:
    commands:
      - echo "Building PHP (${stack.framework})${stack.hasNodeAssets ? " with frontend assets" : ""}"
${buildAndPush()}`;
}

export function pythonBuildPhase(stack: { framework: string }): string {
  return `  build:
    commands:
      - echo "Building Python (${stack.framework})"
${buildAndPush()}`;
}

export function goBuildPhase(): string {
  return `  build:
    commands:
      - echo "Building Go"
${buildAndPush()}`;
}

export function fallbackBuildPhase(): string {
  return `  build:
    commands:
      - echo "Unknown stack — building with Dockerfile"
${buildAndPush()}`;
}
