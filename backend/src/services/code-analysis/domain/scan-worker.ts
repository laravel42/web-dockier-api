import { rm } from "node:fs/promises";
import { cloneRepo } from "../../../lib/build-pipeline.js";
import { createConsoleLogger } from "../../../lib/logging.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { getConnectionForTenant } from "../../../shared/service-clients/git-connections.js";
import { emit } from "../../../shared/events.js";
import { type ScanFindingInput, dedupeScanFindings } from "./scan-analysis.js";
import { filterDisabledSonarFindings, runSonarScanner } from "./sonarqube.js";
import { listRuleOverrides } from "./rule-overrides.js";
import {
  broadcastScanStatus,
  persistScanProgress,
  updateScanProgress,
} from "./scan-progress.js";
import type { ScanProgressPayload } from "./scan-events.js";
import { withElapsed, startScanHeartbeat } from "./scan-heartbeat.js";
import { walkRepoFiles } from "./scan-files.js";
import { runSemgrep, runCustomRules, runSensitiveDataScanner } from "./scan-strategies.js";
import { buildSummary, persistFindings, markScanFailed } from "./scan-persistence.js";

export interface RunScanOptions {
  enableSemgrep?: boolean;
  enableSonarqube?: boolean;
  enableBearer?: boolean;
  enableCustomRules?: boolean;
  enableSensitiveData?: boolean;
  enableCodeql?: boolean;
}

/**
 * If a scan is still marked `running`, mark it failed with the given error.
 * Used by the queue worker when a job crashes without cleaning up after itself.
 */
export async function failScanIfStillRunning(scanId: string, err: unknown): Promise<void> {
  const { data } = await supabaseAdmin.from("scans").select("status").eq("id", scanId).single();
  if (data?.status !== "running") return;
  const message = getErrMsg(err);
  await markScanFailed(scanId, message);
}

/**
 * Run a full security scan for `scanId`: clone the repo, discover files, run the
 * enabled scanners (semgrep, custom rules, sensitive-data, sonarqube), persist
 * the deduped findings, and broadcast completion. On failure the scan is marked
 * failed and the error is rethrown; the clone workdir is always cleaned up.
 */
export async function executeScan(
  scanId: string,
  tenantId: string,
  options: RunScanOptions = {},
): Promise<void> {
  const logger = createConsoleLogger("scan");
  let workDir: string | undefined;

  try {
    const { data: scanRow, error: scanError } = await supabaseAdmin
      .from("scans")
      .select("*")
      .eq("id", scanId)
      .single();
    if (scanError || !scanRow) {
      throw new Error(scanError?.message ?? "Scan not found");
    }
    if (scanRow.organization_id !== tenantId) {
      throw new Error("Not your scan");
    }

    const connection = await getConnectionForTenant(scanRow.connection_id, tenantId);

    const reportProgress = (progress: ScanProgressPayload) => updateScanProgress(scanId, progress);

    const cloneLabel = scanRow.repo;
    await persistScanProgress(scanId, {
      phase: "cloning",
      scanner: "cloning",
      filesScanned: 0,
      filesInRepo: 0,
      findingsCount: 0,
      currentFile: cloneLabel,
    });

    const stopCloneHeartbeat = startScanHeartbeat(scanId, () => ({
      phase: "cloning",
      scanner: "cloning",
      filesScanned: 0,
      filesInRepo: 0,
      findingsCount: 0,
      currentFile: cloneLabel,
    }));
    let cloneResult: Awaited<ReturnType<typeof cloneRepo>>;
    try {
      cloneResult = await cloneRepo({
        git: {
          provider: connection.provider,
          token: connection.personal_token,
          repo: scanRow.repo,
          endpoint: connection.endpoint || undefined,
        },
        branch: scanRow.branch,
        shortId: scanId.slice(0, 8),
        logger,
      });
    } finally {
      stopCloneHeartbeat();
    }
    workDir = cloneResult.workDir;

    const { allFiles, relativePaths } = await walkRepoFiles(cloneResult.repoDir);
    const filesInRepo = allFiles.length;

    await persistScanProgress(scanId, {
      phase: "scanning",
      filesScanned: 0,
      filesInRepo,
      findingsCount: 0,
      currentFile: "Indexing repository…",
    });

    const enableSemgrep = options.enableSemgrep !== false;
    const enableSonarqube = options.enableSonarqube !== false;
    const enableCustomRules = options.enableCustomRules !== false;
    // Schema-based sensitive-data belongs in project info, not security scans.
    const enableSensitiveData = options.enableSensitiveData === true;

    const findings: ScanFindingInput[] = [];
    let filesScanned = 0;

    if (enableSemgrep) {
      await logger.section("Semgrep");
      const semgrepLabel = `Running Semgrep on ${filesInRepo} files`;
      const semgrepStarted = Date.now();
      await persistScanProgress(scanId, {
        phase: "scanning",
        scanner: "semgrep",
        filesScanned: 0,
        filesInRepo,
        findingsCount: findings.length,
        currentFile: withElapsed(semgrepLabel, semgrepStarted),
        currentRule: "semgrep/opengrep",
      });
      const overrides = await listRuleOverrides(tenantId, "semgrep");
      const disabledRuleIds = new Set(
        overrides.filter((override) => !override.enabled).map((override) => override.ruleId),
      );
      const stopSemgrepHeartbeat = startScanHeartbeat(scanId, () => ({
        phase: "scanning",
        scanner: "semgrep",
        filesScanned: 0,
        filesInRepo,
        findingsCount: findings.length,
        currentFile: semgrepLabel,
        currentRule: "semgrep/opengrep",
      }));
      let semgrepFindings: ScanFindingInput[];
      try {
        semgrepFindings = await runSemgrep(
          cloneResult.repoDir,
          relativePaths,
          disabledRuleIds,
          (filesScanned, filesInRepo, currentFile) => {
            void reportProgress({
              phase: "scanning",
              scanner: "semgrep",
              filesScanned,
              filesInRepo,
              findingsCount: findings.length,
              currentFile,
              currentRule: "semgrep/opengrep",
            });
          },
        );
      } finally {
        stopSemgrepHeartbeat();
      }
      findings.push(...semgrepFindings);
      filesScanned = filesInRepo;
      void reportProgress({
        phase: "scanning",
        scanner: "semgrep",
        filesScanned: filesInRepo,
        filesInRepo,
        findingsCount: findings.length,
        currentFile: `Repository (${filesInRepo} files)`,
        currentRule: "semgrep/opengrep",
      });
      await logger.success(`Semgrep found ${semgrepFindings.length} issue(s)`);
    }

    if (enableCustomRules) {
      await logger.section("Custom rules");
      const customResult = await runCustomRules(
        cloneResult.repoDir,
        tenantId,
        filesInRepo,
        allFiles,
        (progress) => {
          void reportProgress(progress);
        },
      );
      findings.push(...customResult.findings);
      filesScanned = Math.max(filesScanned, customResult.filesScanned);
      await logger.success(`Custom rules found ${customResult.findings.length} issue(s)`);
    }

    if (enableSensitiveData) {
      await logger.section("Sensitive data");
      const sensitiveResult = await runSensitiveDataScanner(
        allFiles,
        relativePaths,
        filesInRepo,
        (progress) => {
          void reportProgress({ ...progress, findingsCount: findings.length + progress.findingsCount });
        },
      );
      findings.push(...sensitiveResult.findings);
      filesScanned = Math.max(filesScanned, sensitiveResult.filesScanned);
      await logger.success(`Sensitive data scan found ${sensitiveResult.findings.length} issue(s)`);
    }

    if (enableSonarqube) {
      await logger.section("SonarQube");
      const sonarLabel = `Running SonarQube on ${filesInRepo} files`;
      const sonarStarted = Date.now();
      await persistScanProgress(scanId, {
        phase: "scanning",
        scanner: "sonarqube",
        filesScanned,
        filesInRepo,
        findingsCount: findings.length,
        currentFile: withElapsed(sonarLabel, sonarStarted),
        currentRule: "sonarqube/analyze",
      });
      const stopSonarHeartbeat = startScanHeartbeat(scanId, () => ({
        phase: "scanning",
        scanner: "sonarqube",
        filesScanned,
        filesInRepo,
        findingsCount: findings.length,
        currentFile: sonarLabel,
        currentRule: "sonarqube/analyze",
      }));
      try {
        const sonarOverrides = await listRuleOverrides(tenantId, "sonarqube");
        const disabledSonarRuleIds = new Set(
          sonarOverrides.filter((override) => !override.enabled).map((override) => override.ruleId),
        );
        const sonarProjectKey = `scan-${scanId}`;
        const sonarFindings = await runSonarScanner(cloneResult.repoDir, sonarProjectKey, {
          log: async (message) => {
            await logger.info(message);
          },
        });
        const enabledSonarFindings = filterDisabledSonarFindings(sonarFindings, disabledSonarRuleIds);
        findings.push(...enabledSonarFindings);
        await logger.success(`SonarQube found ${enabledSonarFindings.length} issue(s)`);
      } catch (err) {
        const message = getErrMsg(err);
        await logger.warn(`SonarQube scan skipped or failed: ${message}`);
      } finally {
        stopSonarHeartbeat();
      }
    }

    await persistScanProgress(scanId, {
      phase: "persisting",
      scanner: "persisting",
      filesScanned,
      filesInRepo,
      findingsCount: findings.length,
      currentFile: "Saving findings…",
      currentRule: "database/persist",
    });

    const uniqueFindings = dedupeScanFindings(findings, cloneResult.repoDir);
    await persistFindings(scanId, tenantId, uniqueFindings);

    const summary = buildSummary(uniqueFindings, filesInRepo, filesScanned);
    const { error: updateError } = await supabaseAdmin
      .from("scans")
      .update({
        status: "completed",
        summary: { ...summary, progress: undefined } as unknown as Json,
        commit_sha: cloneResult.commitHash,
        updated_at: nowIso(),
      })
      .eq("id", scanId);
    if (updateError) throw new Error(`Failed to update scan status: ${updateError.message}`);

    broadcastScanStatus(scanId, "completed", summary);

    emit("notification:send", {
      tenantId,
      title: "Security scan completed",
      message: `Scan of ${scanRow.repo} (${scanRow.branch}) finished with ${findings.length} finding(s) (${summary.errors} errors, ${summary.warnings} warnings).`,
      metadata: {
        kind: "scan",
        repo: scanRow.repo,
        branch: scanRow.branch,
        commit: cloneResult.commitHash || undefined,
        projectId: scanRow.project_id || undefined,
        scanId,
        summary: {
          errors: summary.errors,
          warnings: summary.warnings,
          infos: summary.infos,
          totalFindings: summary.totalFindings,
        },
      },
    });

    await logger.success(
      `Scan ${scanId} completed: ${findings.length} finding(s), ${filesInRepo} file(s) in repo`,
    );
  } catch (err) {
    const message = getErrMsg(err);
    await logger.error(`Scan ${scanId} failed: ${message}`);
    await markScanFailed(scanId, message);
    throw err;
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
