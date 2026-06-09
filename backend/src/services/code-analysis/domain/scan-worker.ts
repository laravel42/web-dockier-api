import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { cloneRepo } from "../../../lib/build-pipeline.js";
import { createConsoleLogger } from "../../../lib/logging.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { getConnectionForTenant } from "../../git-integration/domain/connections.js";
import { sendNotification } from "../../notifications/domain/notifications.js";
import { listCustomRules } from "./custom-rules.js";
import { defaultSummary, parseSummary } from "./mappers.js";
import { listRuleOverrides } from "./rule-overrides.js";
import {
  isModelFile,
  isSchemaFile,
  matchesExtension,
  parseSemgrepOutput,
  runCustomRulesOnContent,
  runSensitiveDataScan,
  toRepoRelativePath,
  type ScanFindingInput,
} from "./scan-analysis.js";
import { filterDisabledSonarFindings, runSonarScanner } from "./sonarqube.js";
import { getOpengrepRulesDir } from "../../../shared/paths.js";
import {
  broadcastScanStatus,
  persistScanProgress,
  updateScanProgress,
} from "./scan-progress.js";
import type { ScanProgressPayload } from "./scan-events.js";
import {
  isScanSkippedDirName,
  isScanSkippedRelativePath,
  semgrepExcludeArgs,
  writeSemgrepIgnore,
} from "./scan-skip-dirs.js";

export interface RunScanOptions {
  enableSemgrep?: boolean;
  enableSonarqube?: boolean;
  enableCustomRules?: boolean;
  enableSensitiveData?: boolean;
}

const RULES_DIR = getOpengrepRulesDir();

const INSERT_BATCH_SIZE = 100;
const SEMGREP_TIMEOUT_MS = 600_000;
const SEMGREP_TARGET_BATCH_SIZE = 1000;
const MAX_SCAN_FILE_BYTES = 1_000_000;
const MAX_COMMAND_OUTPUT = 50 * 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 10_000;

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function withElapsed(label: string, startedAt: number): string {
  const base = label.replace(/ \(\d+m? ?\d*s\)$/, "");
  return `${base} (${formatElapsed(Date.now() - startedAt)})`;
}

/** Keeps updated_at fresh during long-running steps so stale reconciliation can detect dead workers. */
function startScanHeartbeat(
  scanId: string,
  getProgress: () => ScanProgressPayload,
): () => void {
  const startedAt = Date.now();
  const interval = setInterval(() => {
    const base = getProgress();
    void persistScanProgress(scanId, {
      ...base,
      currentFile: withElapsed(base.currentFile ?? "Working", startedAt),
    });
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(interval);
}

function findSemgrepBinary(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "semgrep"),
    "/opt/homebrew/bin/semgrep",
    "semgrep",
  ];

  for (const bin of candidates) {
    if (bin === "semgrep" || existsSync(bin)) return bin;
  }

  throw new Error("semgrep binary not found in PATH or common install locations");
}

function runCommand(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;

    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          proc.kill("SIGTERM");
          reject(new Error(`Command timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : undefined;

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutTruncated) return;
      stdout += chunk.toString();
      if (stdout.length > MAX_COMMAND_OUTPUT) {
        stdoutTruncated = true;
        stdout = stdout.slice(0, MAX_COMMAND_OUTPUT);
        proc.kill("SIGTERM");
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

function filterScannableFindings(
  findings: ScanFindingInput[],
  repoDir: string,
): ScanFindingInput[] {
  return findings.filter((finding) => !isScanSkippedRelativePath(toRepoRelativePath(finding.filePath, repoDir)));
}

async function runSemgrepBatch(
  semgrep: string,
  repoDir: string,
  targets: string[],
  disabledRuleIds: Set<string>,
): Promise<ScanFindingInput[]> {
  const { stdout, stderr, code } = await runCommand(
    semgrep,
    [
      "scan",
      "--config",
      RULES_DIR,
      "--json",
      "--quiet",
      "--use-git-ignore",
      "--exclude-minified-files",
      ...semgrepExcludeArgs(),
      ...targets,
    ],
    { cwd: repoDir, timeoutMs: SEMGREP_TIMEOUT_MS },
  );

  if (!stdout.trim() && code !== 0) {
    throw new Error(stderr.trim() || `semgrep exited with code ${code}`);
  }

  return filterScannableFindings(parseSemgrepOutput(stdout, disabledRuleIds, repoDir), repoDir);
}

async function runSemgrep(
  repoDir: string,
  relativePaths: string[],
  disabledRuleIds: Set<string>,
): Promise<ScanFindingInput[]> {
  await writeSemgrepIgnore(repoDir);

  const targets = relativePaths.filter((path) => !isScanSkippedRelativePath(path));
  if (targets.length === 0) return [];

  const semgrep = findSemgrepBinary();
  const findings: ScanFindingInput[] = [];

  for (let i = 0; i < targets.length; i += SEMGREP_TARGET_BATCH_SIZE) {
    const batch = targets.slice(i, i + SEMGREP_TARGET_BATCH_SIZE);
    const batchFindings = await runSemgrepBatch(semgrep, repoDir, batch, disabledRuleIds);
    findings.push(...batchFindings);
  }

  return findings;
}

async function walkRepoFiles(repoDir: string): Promise<{ allFiles: string[]; relativePaths: string[] }> {
  const allFiles: string[] = [];
  const relativePaths: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() || isScanSkippedDirName(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relPath = relative(repoDir, fullPath);
      if (isScanSkippedRelativePath(relPath)) continue;

      try {
        const { size } = await stat(fullPath);
        if (size > MAX_SCAN_FILE_BYTES) continue;
      } catch {
        continue;
      }

      allFiles.push(fullPath);
      relativePaths.push(relPath);
    }
  }

  await walk(repoDir);
  return { allFiles, relativePaths };
}

type ScanProgressReporter = (progress: ScanProgressPayload) => void;

async function runCustomRules(
  repoDir: string,
  tenantId: string,
  filesInRepo: number,
  allFiles: string[],
  onProgress: ScanProgressReporter,
): Promise<{ findings: ScanFindingInput[]; filesScanned: number }> {
  const allRules = await listCustomRules({ tenantId });
  const rules = allRules
    .filter((rule) => rule.enabled && rule.pattern)
    .map((rule) => ({
      ruleId: rule.ruleId,
      severity: rule.severity,
      message: rule.message,
      pattern: rule.pattern,
      extensions: rule.extensions,
    }));

  if (rules.length === 0) return { findings: [], filesScanned: 0 };

  const findings: ScanFindingInput[] = [];
  let filesScanned = 0;

  for (const filePath of allFiles) {
    const relPath = relative(repoDir, filePath);
    if (isScanSkippedRelativePath(relPath)) continue;
    const applicableRules = rules.filter((rule) => matchesExtension(relPath, rule.extensions));
    if (applicableRules.length === 0) continue;

    filesScanned++;
    if (filesScanned % 25 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const content = await readFile(filePath, "utf-8");

    onProgress({
      phase: "scanning",
      scanner: "custom",
      filesScanned,
      filesInRepo,
      findingsCount: findings.length,
      currentFile: relPath,
      currentRule: applicableRules[0]?.ruleId,
      rulesChecked: 0,
      rulesTotal: applicableRules.length,
    });

    for (let ruleIndex = 0; ruleIndex < applicableRules.length; ruleIndex++) {
      const rule = applicableRules[ruleIndex];
      onProgress({
        phase: "scanning",
        scanner: "custom",
        filesScanned,
        filesInRepo,
        findingsCount: findings.length,
        currentFile: relPath,
        currentRule: rule.ruleId,
        rulesChecked: ruleIndex + 1,
        rulesTotal: applicableRules.length,
      });
      findings.push(...runCustomRulesOnContent(relPath, content, [rule]));
    }
  }

  return { findings, filesScanned };
}

async function runSensitiveDataScanner(
  allFiles: string[],
  relativePaths: string[],
  filesInRepo: number,
  onProgress: ScanProgressReporter,
): Promise<{ findings: ScanFindingInput[]; filesScanned: number }> {
  const scanFiles: Array<{ path: string; content: string }> = [];
  let filesScanned = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const relPath = relativePaths[i];
    if (!isSchemaFile(relPath) && !isModelFile(relPath)) continue;

    filesScanned++;
    onProgress({
      phase: "scanning",
      scanner: "sensitive",
      filesScanned,
      filesInRepo,
      findingsCount: 0,
      currentFile: relPath,
      currentRule: "sensitive-data.schema",
      rulesChecked: 1,
      rulesTotal: 1,
    });

    const content = await readFile(allFiles[i], "utf-8");
    scanFiles.push({ path: relPath, content });
  }

  const findings: ScanFindingInput[] = [];
  for (const file of scanFiles) {
    const fileFindings = runSensitiveDataScan([file]);
    findings.push(...fileFindings);
    onProgress({
      phase: "scanning",
      scanner: "sensitive",
      filesScanned,
      filesInRepo,
      findingsCount: findings.length,
      currentFile: file.path,
      currentRule: fileFindings[0]?.ruleId ?? "sensitive-data.schema",
      rulesChecked: 1,
      rulesTotal: 1,
    });
  }

  return { findings, filesScanned };
}

function buildSummary(findings: ScanFindingInput[], filesInRepo: number, filesScanned: number) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const infos = findings.filter((f) => f.severity === "info").length;

  return {
    ...defaultSummary(),
    totalFindings: findings.length,
    errors,
    warnings,
    infos,
    filesScanned,
    filesInRepo,
  };
}

async function persistFindings(
  scanId: string,
  tenantId: string,
  findings: ScanFindingInput[],
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  if (deleteError) throw new Error(`Failed to delete existing findings: ${deleteError.message}`);

  if (findings.length === 0) return;

  const now = new Date().toISOString();
  for (let i = 0; i < findings.length; i += INSERT_BATCH_SIZE) {
    const batch = findings.slice(i, i + INSERT_BATCH_SIZE).map((finding) => ({
      id: randomUUID(),
      organization_id: tenantId,
      scan_id: scanId,
      rule_id: finding.ruleId,
      severity: finding.severity,
      message: finding.message,
      file_path: toRepoRelativePath(finding.filePath),
      start_line: finding.startLine,
      end_line: finding.endLine,
      snippet: finding.snippet,
      created_at: now,
    }));

    const { error } = await supabaseAdmin.from("findings").insert(batch);
    if (error) throw new Error(`Failed to insert findings: ${error.message}`);
  }
}

async function markScanFailed(scanId: string, message: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("scans")
    .select("summary")
    .eq("id", scanId)
    .single();

  const existing = parseSummary(data?.summary) as ReturnType<typeof parseSummary> & {
    progress?: { filesScanned?: number; filesInRepo?: number };
  };
  const summary = {
    ...defaultSummary(),
    filesScanned: existing.filesScanned || existing.progress?.filesScanned || 0,
    filesInRepo: existing.filesInRepo || existing.progress?.filesInRepo || 0,
    error: message,
  };
  const { error } = await supabaseAdmin
    .from("scans")
    .update({
      status: "failed",
      summary: summary as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scanId);
  if (error) console.error(`[scan] Failed to mark scan ${scanId} as failed:`, error.message);
  broadcastScanStatus(scanId, "failed", summary);
}

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

    await persistScanProgress(scanId, {
      phase: "cloning",
      scanner: "cloning",
      filesScanned: 0,
      filesInRepo: 0,
      findingsCount: 0,
      currentFile: scanRow.repo,
    });

    const cloneResult = await cloneRepo({
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
    const enableSensitiveData = options.enableSensitiveData !== false;

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
        semgrepFindings = await runSemgrep(cloneResult.repoDir, relativePaths, disabledRuleIds);
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
        const message = err instanceof Error ? err.message : String(err);
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

    await persistFindings(scanId, tenantId, findings);

    const summary = buildSummary(findings, filesInRepo, filesScanned);
    const { error: updateError } = await supabaseAdmin
      .from("scans")
      .update({
        status: "completed",
        summary: { ...summary, progress: undefined } as unknown as Json,
        commit_sha: cloneResult.commitHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);
    if (updateError) throw new Error(`Failed to update scan status: ${updateError.message}`);

    broadcastScanStatus(scanId, "completed", summary);

    void sendNotification({
      tenantId,
      title: "Security scan completed",
      message: `Scan of ${scanRow.repo} (${scanRow.branch}) finished with ${findings.length} finding(s) (${summary.errors} errors, ${summary.warnings} warnings).`,
    }).catch((err) => {
      console.error(`[scan] Failed to send scan complete notification for ${scanId}:`, err);
    });

    await logger.success(
      `Scan ${scanId} completed: ${findings.length} finding(s), ${filesInRepo} file(s) in repo`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logger.error(`Scan ${scanId} failed: ${message}`);
    await markScanFailed(scanId, message);
    throw err;
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
