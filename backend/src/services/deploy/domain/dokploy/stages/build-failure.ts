/**
 * Classify a failed Dokploy build from whatever failure text we have.
 *
 * Pure and message-free on purpose: the ordering lives here, the wording stays
 * in trigger-deploy.ts. Evidence from the actual build wins over heuristics
 * about the repo's shape — a recognizable build error (today: out of memory)
 * proves what happened, while "no start command" is only an inference.
 */

import type { RuntimeHint } from "./trigger-deploy.js";

export interface BuildFailureDiagnosis {
  kind: "oom" | "pnpm-workspace" | "platform-adapter" | "missing-start" | "generic";
  /** The build step that died (e.g. "npm run build"), when the text names it. */
  step?: string;
}

/**
 * 134 = V8 abort after heap exhaustion, 137 = kernel OOM kill.
 *
 * shortcut: those two codes are really SIGABRT/SIGKILL, so a native assertion
 * or an unrelated kill reads as out of memory; during a source build on these
 * servers memory is by far the dominant cause. Narrow them if a non-memory
 * abort shows up in practice.
 */
const OOM_PATTERNS = [
  /JavaScript heap out of memory/i,
  /Ineffective mark-compacts/i,
  /\bENOMEM\b/,
  /Cannot allocate memory/i,
  /exit code:\s*13[47]\b/,
];

/**
 * pnpm rejecting a `pnpm-workspace.yaml` that declares no `packages` field.
 *
 * Deterministic on purpose, because the model tier gets this one wrong in a way
 * that actively misleads: it reads "packages field" and sends the user to
 * package.json, which has no such field and never did. The field lives in
 * pnpm-workspace.yaml, and it only became optional in pnpm 10.5 — so the real
 * cause is a version split inside the repo (a workspace file written for pnpm
 * 10+ against a lockfileVersion that pins railpack to pnpm 9), which no log
 * tail reveals.
 */
const PNPM_WORKSPACE_PATTERNS = [
  /packages field missing or empty/i,
  /ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION/,
];

/**
 * A railpack plan that resolved its own Deploy command disproves the
 * missing-start-command diagnosis. Only fires when such text happens to reach
 * us — it is a suppression signal, not a guarantee.
 */
const DEPLOY_COMMAND_PATTERNS = [
  /^\s*Deploy\s*$[\s\S]{0,400}?^\s*\$\s+\S+/m,
  /\$\s+node\s+\S+\.(mjs|cjs|js)\b/,
];

export function classifyBuildFailure(text: string, hint?: RuntimeHint): BuildFailureDiagnosis {
  const failedStep = /process "([^"]+)" did not complete successfully/.exec(text)?.[1];

  if (OOM_PATTERNS.some((re) => re.test(text))) {
    return { kind: "oom", step: failedStep };
  }

  if (PNPM_WORKSPACE_PATTERNS.some((re) => re.test(text))) {
    return { kind: "pnpm-workspace", step: failedStep };
  }

  if (hint?.platformAdapter) {
    return { kind: "platform-adapter" };
  }

  const missingStart =
    hint?.buildType === "railpack" &&
    hint.kind === "server" &&
    !hint.startCommandApplied &&
    !hint.repoHasStartScript &&
    !DEPLOY_COMMAND_PATTERNS.some((re) => re.test(text));

  return { kind: missingStart ? "missing-start" : "generic" };
}
