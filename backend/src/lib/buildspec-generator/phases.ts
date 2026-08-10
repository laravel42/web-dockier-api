// ─── Per-Stack Build Phases ───

import { buildAndPush } from "./common.js";

/**
 * Generate the build phase section of a CodeBuild buildspec.
 *
 * All runtimes follow the same structure: log a descriptive label,
 * then run the shared Docker build-and-push commands. The label
 * is the only part that varies between stacks.
 */
export function buildPhase(label: string): string {
  return `  build:
    commands:
      - echo "${label}"
${buildAndPush()}`;
}
