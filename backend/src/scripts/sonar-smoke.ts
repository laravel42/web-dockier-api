/**
 * Live smoke test for the SonarQube engine, in the spirit of smoke:ai-review.
 *
 * `domain/sonarqube.ts` had never been run against a real server in this
 * repository — it was written, unit-tested with mocked fetch, and shipped
 * behind a branch that silently returned [] whenever the scanner binary was
 * missing. A mocked-fetch test cannot catch a wrong property name, an API that
 * moved, or a scanner that refuses the project key, which is exactly how the
 * `application.aiFixDeployment` 404 went unnoticed for months (see AGENTS.md).
 *
 * This runs the real path: findSonarScanner() -> sonar-scanner -> poll
 * /api/ce/task -> fetch /api/issues/search -> parseSonarIssues, over a fixture
 * written to a temp directory. It also exercises the scratch-project cleanup,
 * since runSonarScanner deletes the project it created — check the server's
 * project list before and after if you want to see that part.
 *
 * Needs SONARQUBE_URL and SONARQUBE_TOKEN, and `sonar-scanner` on the PATH.
 *
 *   pnpm --filter @dockier/backend-fastify smoke:sonar
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initConfig } from "../shared/config.js";
import { getErrMsg } from "../shared/utils/error-message.js";
import {
  findSonarScanner,
  getSonarConfig,
  runSonarScanner,
  sonarFetch,
} from "../services/code-analysis/domain/sonarqube.js";

/**
 * Deliberately flawed, so a run that reports zero findings means the pipeline is
 * broken rather than the fixture being clean. Python because the Community
 * Build analyses it out of the box with no build step.
 */
const FIXTURE = `import hashlib
import os
import subprocess


def weak_digest(password):
    # MD5 for a password is a textbook finding; if nothing fires here, the
    # analysis did not actually run.
    return hashlib.md5(password.encode()).hexdigest()


def run_untrusted(user_input):
    # shell=True on interpolated input.
    return subprocess.call("echo " + user_input, shell=True)


def dead_branch(value):
    if value == value:
        return True
    return False


API_KEY = "AKIAIOSFODNN7EXAMPLE"


def unused_local():
    unused = os.getcwd()
    return 42
`;

async function main(): Promise<void> {
  await initConfig();

  const config = getSonarConfig();
  if (!config) {
    throw new Error(
      "SONARQUBE_URL / SONARQUBE_TOKEN not set. Start the server with " +
        "`docker compose up -d --wait` and put both in the root .env.",
    );
  }
  console.log(`server:  ${config.baseUrl}`);

  const scanner = findSonarScanner();
  if (!scanner) {
    throw new Error(
      "sonar-scanner not found on the PATH. `brew install sonar-scanner`, or " +
        "run this inside the backend image, which installs it.",
    );
  }
  console.log(`scanner: ${scanner}`);

  const status = await sonarFetch("/api/system/status");
  console.log(`status:  ${String(status.status)} (${String(status.version)})`);
  if (status.status !== "UP") {
    throw new Error(`server is ${String(status.status)}, not UP`);
  }

  const projectKey = `dockier-smoke-${Date.now()}`;
  const workDir = await mkdtemp(join(tmpdir(), "sonar-smoke-"));

  try {
    await writeFile(join(workDir, "vulnerable.py"), FIXTURE, "utf-8");
    console.log(`\nscanning ${projectKey} …\n`);

    const started = Date.now();
    const findings = await runSonarScanner(workDir, projectKey, {
      log: (message: string) => console.log(`  [sonar] ${message}`),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`\n${findings.length} finding(s) in ${elapsed}s`);
    for (const finding of findings.slice(0, 12)) {
      console.log(
        `  ${finding.severity.padEnd(7)} ${finding.ruleId}  ` +
          `${finding.filePath}:${finding.startLine}`,
      );
    }
    if (findings.length > 12) console.log(`  … and ${findings.length - 12} more`);

    // Assertions, not just output: a green run has to mean something.
    const problems: string[] = [];
    if (findings.length === 0) {
      problems.push("no findings on a deliberately flawed fixture");
    }
    if (findings.some((f) => !f.ruleId.startsWith("sonar."))) {
      problems.push("a ruleId is missing the `sonar.` prefix findingProvider() keys on");
    }
    if (findings.some((f) => f.filePath.startsWith("/") || f.filePath.includes(projectKey))) {
      problems.push("a filePath is absolute or still carries the project key");
    }
    if (findings.some((f) => f.startLine < 1)) {
      problems.push("a finding has no usable line number");
    }
    if (problems.length > 0) {
      throw new Error(`pipeline ran but produced bad data:\n  - ${problems.join("\n  - ")}`);
    }

    console.log("\nOK: prefixes, paths and line numbers all usable.");
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    // The scratch project is NOT deleted here: runSonarScanner owns its
    // lifetime and removes it in its own finally. Doing it again just 404s.
  }
}

main().catch((err: unknown) => {
  console.error(`\n[sonar-smoke] ${getErrMsg(err)}`);
  process.exit(1);
});
