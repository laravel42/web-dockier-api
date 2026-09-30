/**
 * Deploy log → timeline parsing.
 *
 * Split out of StepDeploy.tsx so the parsing rules can be unit-tested and so the
 * component file only exports a component (react-refresh/only-export-components).
 */

export type StageStatus = "pending" | "in-progress" | "success" | "failed";

export interface PipelineStage {
  id: string;
  label: string;
  status: StageStatus;
  logs: string[];
}

export interface AIRetryInfo {
  attempt: number;
  maxAttempts: number;
  fixDescription: string | null;
}

/**
 * Stage timelines, one per pipeline.
 *
 * These ids must match the `[stage:<id>]` markers the backend emits. Dokploy's
 * come from `dokploy/stages/*`; the static ones from `NATIVE_STAGE` in
 * `lib/logging.ts`. A mismatch leaves a step pending forever — which is what
 * happened when static deploys started routing to the native pipeline and this
 * list still described Dokploy's stages ("Provision Server" for a deploy that
 * provisions no server).
 */
const DOKPLOY_STAGE_DEFS = [
  { id: "ensure-project", label: "Create Project" },
  { id: "sync-git", label: "Sync Git Credentials" },
  { id: "provision-server", label: "Provision Server" },
  { id: "configure-app", label: "Configure Application" },
  { id: "deploy", label: "Deploy" },
] as const;

/** Static sites skip servers and containers entirely: build, upload, put a CDN in front. */
const STATIC_STAGE_DEFS = [
  { id: "clone", label: "Clone Repository" },
  { id: "analyze", label: "Analyze Repository" },
  { id: "build-site", label: "Build Site" },
  { id: "upload", label: "Upload Files" },
  { id: "cdn", label: "Provision CDN" },
  { id: "verify", label: "Verify" },
] as const;

export function stageDefsFor(deployStrategy: string): ReadonlyArray<{ id: string; label: string }> {
  return deployStrategy === "static" ? STATIC_STAGE_DEFS : DOKPLOY_STAGE_DEFS;
}

/**
 * Parse deploy log lines into structured pipeline stages.
 * Backend logs use markers like `[stage:ensure-project] ...`
 *
 * `deployFailed` reconciles the timeline against the deployment's terminal
 * status. A pipeline can fail between stage markers — or in the top-level
 * catch handler, whose "✗ Pipeline failed: ..." line carries no `[stage:xxx]`
 * marker — which would otherwise leave the active stage stuck showing a
 * spinner forever. When the deploy has failed, the stage that was still
 * in-progress is marked failed instead.
 */
export function parseStages(
  logs: string[],
  deployFailed: boolean,
  deployStrategy = "vps",
  deploySucceeded = false,
): { stages: PipelineStage[]; retries: AIRetryInfo[] } {
  const stageDefs = stageDefsFor(deployStrategy);
  const stages: PipelineStage[] = stageDefs.map((def) => ({
    id: def.id,
    label: def.label,
    status: "pending",
    logs: [],
  }));

  const retries: AIRetryInfo[] = [];
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const indexOf = new Map(stages.map((s, i) => [s.id, i]));

  for (const line of logs) {
    // Match [stage:xxx] markers
    const stageMatch = line.match(/\[stage:([\w-]+)\]/);
    if (stageMatch) {
      const stageId = stageMatch[1];
      const stage = stageMap.get(stageId);
      if (stage) {
        stage.logs.push(line);

        // Determine status from markers
        if (line.includes("✓")) {
          stage.status = "success";
        } else if (line.includes("✗")) {
          stage.status = "failed";
        } else if (stage.status === "pending") {
          stage.status = "in-progress";
        }

        // Reaching a stage means every earlier one finished. The native pipeline
        // only marks the START of each section, so without this its steps would
        // all sit spinning. Never downgrade a stage that already failed.
        const reached = indexOf.get(stageId) ?? 0;
        for (let i = 0; i < reached; i++) {
          if (stages[i].status === "pending" || stages[i].status === "in-progress") {
            stages[i].status = "success";
          }
        }
      }

      // Parse AI recovery info
      if (stageId === "ai-recovery" && line.includes("Fix applied:")) {
        const descMatch = line.match(/Fix applied:\s*(.+)/);
        retries.push({
          attempt: retries.length + 1,
          maxAttempts: 3,
          fixDescription: descMatch?.[1] || "Applied automatic fix",
        });
      }
    }

    // Parse deploy attempts
    const attemptMatch = line.match(/Attempt (\d+)\/(\d+)/);
    if (attemptMatch) {
      const [, attempt, max] = attemptMatch;
      // Update retry tracking
      if (parseInt(attempt) > 1) {
        const lastRetry = retries[retries.length - 1];
        if (lastRetry) lastRetry.maxAttempts = parseInt(max);
      }
    }
  }

  // Reconcile against the deployment's terminal status. If the deploy failed
  // but no stage carried a "✗" marker (e.g. it died in the untagged top-level
  // catch handler), the last stage that started is where it broke — mark it
  // failed so the timeline stops spinning and shows an X.
  if (deployFailed && !stages.some((s) => s.status === "failed")) {
    const lastActive = [...stages].reverse().find((s) => s.status === "in-progress");
    if (lastActive) lastActive.status = "failed";
  }

  // A succeeded deployment means every stage completed, even ones whose final
  // line carried no ✓ (the native pipeline's last section is followed by
  // untagged lines). Without this the timeline shows a spinner next to a deploy
  // that has already finished.
  if (deploySucceeded) {
    for (const stage of stages) {
      if (stage.status !== "failed") stage.status = "success";
    }
  }

  return { stages, retries };
}

