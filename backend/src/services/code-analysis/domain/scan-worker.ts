import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { cloneRepo } from "../../../lib/build-pipeline.js";
import { createConsoleLogger } from "../../../lib/logging.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { getConnectionForTenant } from "../../git-integration/domain/connections.js";
import { sendNotification } from "../../notifications/domain/notifications.js";
import { listCustomRules } from "./custom-rules.js";
import { defaultSummary } from "./mappers.js";
import { listRuleOverrides } from "./rule-overrides.js";
import {
  isModelFile,
  isSchemaFile,
  matchesExtension,
  parseSemgrepOutput,
  runCustomRulesOnContent,
  runSensitiveDataScan,
  type ScanFindingInput,
} from "./scan-analysis.js";
import { filterDisabledSonarFindings, runSonarScanner } from "./sonarqube.js";

export interface RunScanOptions {
  enableSemgrep?: boolean;
  enableSonarqube?: boolean;
  enableCustomRules?: boolean;
  enableSensitiveData?: boolean;
}

const RULES_DIR = join(process.cwd(), "code-analysis", "rules", "opengrep");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".pnpm-store",
]);

const INSERT_BATCH_SIZE = 100;

function findSemgrepBinary(): string {
  const candidates = [
    "semgrep",
    "/opt/homebrew/bin/semgrep",
    join(homedir(), ".local", "bin", "semgrep"),
  ];

  for (const bin of candidates) {
    if (bin === "semgrep") {
      try {
        execSync("which semgrep", { stdio: "pipe" });
        return bin;
      } catch {
        continue;
      }
    }
    if (existsSync(bin)) return bin;
  }

  throw new Error("semgrep binary not found in PATH or common install locations");
}

function runSemgrep(repoDir: string, disabledRuleIds: Set<string>): ScanFindingInput[] {
  const semgrep = findSemgrepBinary();
  const args = [
    "scan",
    "--config",
    RULES_DIR,
    "--json",
    "--quiet",
    "--no-git-ignore",
    repoDir,
  ];

  let stdout = "";
  try {
    stdout = execSync(`${JSON.stringify(semgrep)} ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 600_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const execErr = err as { stdout?: string; status?: number };
    if (execErr.stdout) {
      stdout = execErr.stdout;
    } else {
      throw err;
    }
  }

  return parseSemgrepOutput(stdout, disabledRuleIds);
}

async function walkRepoFiles(repoDir: string): Promise<{ allFiles: string[]; relativePaths: string[] }> {
  const allFiles: string[] = [];
  const relativePaths: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        allFiles.push(fullPath);
        relativePaths.push(relative(repoDir, fullPath));
      }
    }
  }

  await walk(repoDir);
  return { allFiles, relativePaths };
}

async function runCustomRules(
  repoDir: string,
  tenantId: string,
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

  const { allFiles } = await walkRepoFiles(repoDir);
  const findings: ScanFindingInput[] = [];
  let filesScanned = 0;

  for (const filePath of allFiles) {
    const relPath = relative(repoDir, filePath);
    const applicableRules = rules.filter((rule) => matchesExtension(relPath, rule.extensions));
    if (applicableRules.length === 0) continue;

    filesScanned++;
    const content = await readFile(filePath, "utf-8");
    findings.push(...runCustomRulesOnContent(relPath, content, applicableRules));
  }

  return { findings, filesScanned };
}

async function runSensitiveDataScanner(
  repoDir: string,
): Promise<{ findings: ScanFindingInput[]; filesScanned: number }> {
  const { allFiles, relativePaths } = await walkRepoFiles(repoDir);
  const scanFiles: Array<{ path: string; content: string }> = [];
  let filesScanned = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const relPath = relativePaths[i];
    if (!isSchemaFile(relPath) && !isModelFile(relPath)) continue;

    filesScanned++;
    const content = await readFile(allFiles[i], "utf-8");
    scanFiles.push({ path: relPath, content });
  }

  return { findings: runSensitiveDataScan(scanFiles), filesScanned };
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
      file_path: finding.filePath,
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
  const summary = {
    ...defaultSummary(),
    note: message,
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

    const { allFiles } = await walkRepoFiles(cloneResult.repoDir);
    const filesInRepo = allFiles.length;

    const enableSemgrep = options.enableSemgrep !== false;
    const enableSonarqube = options.enableSonarqube !== false;
    const enableCustomRules = options.enableCustomRules !== false;
    const enableSensitiveData = options.enableSensitiveData !== false;

    const findings: ScanFindingInput[] = [];
    let filesScanned = 0;

    if (enableSemgrep) {
      await logger.section("Semgrep");
      const overrides = await listRuleOverrides(tenantId, "semgrep");
      const disabledRuleIds = new Set(
        overrides.filter((override) => !override.enabled).map((override) => override.ruleId),
      );
      const semgrepFindings = runSemgrep(cloneResult.repoDir, disabledRuleIds);
      findings.push(...semgrepFindings);
      filesScanned = filesInRepo;
      await logger.success(`Semgrep found ${semgrepFindings.length} issue(s)`);
    }

    if (enableCustomRules) {
      await logger.section("Custom rules");
      const customResult = await runCustomRules(cloneResult.repoDir, tenantId);
      findings.push(...customResult.findings);
      if (!enableSemgrep) {
        filesScanned = Math.max(filesScanned, customResult.filesScanned);
      }
      await logger.success(`Custom rules found ${customResult.findings.length} issue(s)`);
    }

    if (enableSensitiveData) {
      await logger.section("Sensitive data");
      const sensitiveResult = await runSensitiveDataScanner(cloneResult.repoDir);
      findings.push(...sensitiveResult.findings);
      if (!enableSemgrep && !enableCustomRules) {
        filesScanned = sensitiveResult.filesScanned;
      }
      await logger.success(`Sensitive data scan found ${sensitiveResult.findings.length} issue(s)`);
    }

    if (enableSonarqube) {
      await logger.section("SonarQube");
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
      }
    }

    await persistFindings(scanId, tenantId, findings);

    const summary = buildSummary(findings, filesInRepo, filesScanned);
    const { error: updateError } = await supabaseAdmin
      .from("scans")
      .update({
        status: "completed",
        summary: summary as unknown as Json,
        commit_sha: cloneResult.commitHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);
    if (updateError) throw new Error(`Failed to update scan status: ${updateError.message}`);

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
