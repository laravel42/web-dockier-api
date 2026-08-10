// ─── Buildspec Generator Orchestrator ───

import type { DetectedStack } from "../repo-analyzer/types.js";
import { commonPreBuild, commonPostBuild, staticBuildAndSync, staticPostBuild } from "./common.js";
import { buildPhase } from "./phases.js";

const COMMON_INSTALL = `  install:
    commands:
      - set -euo pipefail`;

const COMMON_FOOTER = `
artifacts:
  files:
    - imageDetail.json

cache:
  paths:
    - '/root/.cache/**/*'`;

export function generateBuildspec(stack: DetectedStack): string {
  const header = `version: 0.2

env:
  shell: bash
  variables:
    AWS_ACCOUNT_ID: ""
    AWS_DEFAULT_REGION: ""
    IMAGE_REPO_NAME: ""
    CACHE_REPO_NAME: ""

phases:
`;

  let phase: string;

  switch (stack.runtime) {
    case "node":
      phase = buildPhase(`Building Node.js (${stack.framework}) with ${stack.packageManager}`);
      break;
    case "php":
      phase = buildPhase(`Building PHP (${stack.framework})${stack.hasNodeAssets ? " with frontend assets" : ""}`);
      break;
    case "python":
      phase = buildPhase(`Building Python (${stack.framework})`);
      break;
    case "go":
      phase = buildPhase("Building Go");
      break;
    default:
      phase = buildPhase("Unknown stack — building with Dockerfile");
      break;
  }

  return [
    header.trimEnd(),
    COMMON_INSTALL,
    "",
    commonPreBuild(),
    "",
    phase,
    "",
    commonPostBuild(),
    COMMON_FOOTER,
  ].join("\n");
}


export function generateStaticBuildspec(): string {
  const header = `version: 0.2

env:
  shell: bash
  variables:
    AWS_ACCOUNT_ID: ""
    AWS_DEFAULT_REGION: ""
    IMAGE_REPO_NAME: ""

phases:
`;

  const install = `  install:
    runtime-versions:
      nodejs: 20
    commands:
      - set -euo pipefail
      - node --version && npm --version`;

  const preBuild = `  pre_build:
    commands:
      - set -euo pipefail
      - echo "Static site build — no Docker needed"`;

  const build = `  build:
    commands:
${staticBuildAndSync()}`;

  return [
    header.trimEnd(),
    install,
    "",
    preBuild,
    "",
    build,
    "",
    staticPostBuild(),
    `
artifacts:
  files:
    - imageDetail.json

cache:
  paths:
    - '/root/.cache/**/*'`,
  ].join("\n");
}
