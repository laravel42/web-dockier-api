// ─── Buildspec Generator Orchestrator ───

import type { DetectedStack } from "../repo-analyzer/types";
import { commonPreBuild, commonPostBuild, staticBuildAndSync, staticPostBuild } from "./common";
import { nodeBuildPhase, phpBuildPhase, pythonBuildPhase, goBuildPhase, fallbackBuildPhase } from "./phases";

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

  let buildPhase: string;

  switch (stack.runtime) {
    case "node":
      buildPhase = nodeBuildPhase(stack);
      break;
    case "php":
      buildPhase = phpBuildPhase(stack);
      break;
    case "python":
      buildPhase = pythonBuildPhase(stack);
      break;
    case "go":
      buildPhase = goBuildPhase();
      break;
    default:
      buildPhase = fallbackBuildPhase();
      break;
  }

  return [
    header.trimEnd(),
    COMMON_INSTALL,
    "",
    commonPreBuild(),
    "",
    buildPhase,
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
