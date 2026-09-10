/**
 * Scanning strategies.
 *
 * Each strategy takes a discovered file set and produces raw findings:
 *   - Semgrep (batched, against the opengrep rule set)
 *   - Custom per-tenant regex rules
 *   - Sensitive-data heuristics over schema/model files
 *
 * SonarQube lives in its own module (`sonarqube.ts`); the orchestrator wires
 * these together.
 */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { listCustomRules } from "./custom-rules.js";
import {
  isModelFile,
  isSchemaFile,
  matchesExtension,
  parseSemgrepOutput,
  runCustomRulesOnContent,
  runSensitiveDataScan,
  toRepoRelativePath,
  type ScanFindingInput,
  dedupeScanFindings,
} from "./scan-analysis.js";
import { getOpengrepRulesDir } from "../../../shared/utils/paths.js";
import { isScanSkippedRelativePath, semgrepExcludeArgs, writeSemgrepIgnore } from "./scan-skip-dirs.js";
import { findSemgrepBinary, runCommand } from "./scan-exec.js";
import type { ScanProgressPayload } from "./scan-events.js";

const RULES_DIR = getOpengrepRulesDir();

const SEMGREP_TIMEOUT_MS = 600_000;
const SEMGREP_TARGET_BATCH_SIZE = 1000;

/** Callback used by strategies to stream progress updates to the orchestrator. */
export type ScanProgressReporter = (progress: ScanProgressPayload) => void;

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

export async function runSemgrep(
  repoDir: string,
  relativePaths: string[],
  disabledRuleIds: Set<string>,
  onBatchProgress: (filesScanned: number, filesInRepo: number, currentFile: string) => void,
): Promise<ScanFindingInput[]> {
  await writeSemgrepIgnore(repoDir);

  const targets = relativePaths.filter((path) => !isScanSkippedRelativePath(path));
  if (targets.length === 0) return [];

  const semgrep = findSemgrepBinary();
  const findings: ScanFindingInput[] = [];

  for (let i = 0; i < targets.length; i += SEMGREP_TARGET_BATCH_SIZE) {
    const batch = targets.slice(i, i + SEMGREP_TARGET_BATCH_SIZE);
    onBatchProgress(i, targets.length, batch[0] ?? "Running Semgrep…");
    const batchFindings = await runSemgrepBatch(semgrep, repoDir, batch, disabledRuleIds);
    findings.push(...batchFindings);
    onBatchProgress(
      Math.min(i + batch.length, targets.length),
      targets.length,
      batch[batch.length - 1] ?? batch[0] ?? "Running Semgrep…",
    );
  }

  return dedupeScanFindings(findings, repoDir);
}

export async function runCustomRules(
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

export async function runSensitiveDataScanner(
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
