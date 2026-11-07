import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getSonarConfig now reads SONARQUBE_URL/SONARQUBE_TOKEN through the validated
// `env` config object. In production `env` is populated from process.env by
// initConfig(); the test suite never calls initConfig(), so back these two
// keys with live getters off process.env. That keeps the existing harness
// (which mutates process.env.SONARQUBE_*) driving the same reads, and leaves
// the non-schema SONAR_HOST_URL / SONAR_TOKEN aliases on real process.env.
vi.mock("../../../../shared/config.js", () => ({
  env: {
    get SONARQUBE_URL() {
      return process.env.SONARQUBE_URL;
    },
    get SONARQUBE_TOKEN() {
      return process.env.SONARQUBE_TOKEN;
    },
  },
}));

import {
  filterDisabledSonarFindings,
  getSonarConfig,
  isSonarConfigured,
  mapSonarSeverity,
  parseSonarIssues,
  runSonarScanner,
  sonarFetch,
  SonarNotConfiguredError,
} from "../sonarqube.js";

describe("getSonarConfig", () => {
  const originalUrl = process.env.SONARQUBE_URL;
  const originalToken = process.env.SONARQUBE_TOKEN;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SONARQUBE_URL;
    else process.env.SONARQUBE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SONARQUBE_TOKEN;
    else process.env.SONARQUBE_TOKEN = originalToken;
  });

  it("returns null when env vars are missing", () => {
    delete process.env.SONARQUBE_URL;
    delete process.env.SONARQUBE_TOKEN;
    expect(getSonarConfig()).toBeNull();
    expect(isSonarConfigured()).toBe(false);
  });

  it("returns config when both env vars are set", () => {
    process.env.SONARQUBE_URL = "https://sonar.example.com";
    process.env.SONARQUBE_TOKEN = "sqp_test_token";
    expect(getSonarConfig()).toEqual({
      baseUrl: "https://sonar.example.com",
      token: "sqp_test_token",
    });
    expect(isSonarConfigured()).toBe(true);
  });
});

describe("mapSonarSeverity", () => {
  it("maps SonarQube severities to scan severities", () => {
    expect(mapSonarSeverity("BLOCKER")).toBe("error");
    expect(mapSonarSeverity("CRITICAL")).toBe("error");
    expect(mapSonarSeverity("MAJOR")).toBe("warning");
    expect(mapSonarSeverity("MINOR")).toBe("info");
    expect(mapSonarSeverity("INFO")).toBe("info");
  });
});

describe("parseSonarIssues", () => {
  it("maps API issues to findings with sonar. rule prefix", () => {
    const findings = parseSonarIssues(
      [
        {
          rule: "typescript:S1234",
          severity: "CRITICAL",
          message: "Remove this unused import",
          component: "scan-abc:src/app.ts",
          line: 12,
          textRange: { startLine: 12, endLine: 12 },
        },
      ],
      "scan-abc",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "sonar.typescript:S1234",
      severity: "error",
      message: "Remove this unused import",
      filePath: "src/app.ts",
      startLine: 12,
      endLine: 12,
    });
  });
});

describe("filterDisabledSonarFindings", () => {
  it("filters by SonarQube rule key without sonar. prefix", () => {
    const findings = [
      {
        ruleId: "sonar.java:S100",
        severity: "error" as const,
        message: "Disabled rule",
        filePath: "Main.java",
        startLine: 1,
        endLine: 1,
        snippet: "x",
      },
      {
        ruleId: "sonar.java:S200",
        severity: "warning" as const,
        message: "Enabled rule",
        filePath: "Main.java",
        startLine: 2,
        endLine: 2,
        snippet: "y",
      },
    ];

    const filtered = filterDisabledSonarFindings(findings, new Set(["java:S100"]));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].ruleId).toBe("sonar.java:S200");
  });
});

describe("sonarFetch", () => {
  const originalUrl = process.env.SONARQUBE_URL;
  const originalToken = process.env.SONARQUBE_TOKEN;

  beforeEach(() => {
    process.env.SONARQUBE_URL = "https://sonar.example.com";
    process.env.SONARQUBE_TOKEN = "sqp_test_token";
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SONARQUBE_URL;
    else process.env.SONARQUBE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SONARQUBE_TOKEN;
    else process.env.SONARQUBE_TOKEN = originalToken;
  });

  it("throws SonarNotConfiguredError when credentials are missing", async () => {
    delete process.env.SONARQUBE_URL;
    await expect(sonarFetch("/api/qualityprofiles/search")).rejects.toBeInstanceOf(
      SonarNotConfiguredError,
    );
  });

  it("calls SonarQube API with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ profiles: [] }),
    });

    await sonarFetch("/api/qualityprofiles/search", {}, "GET", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sonar.example.com/api/qualityprofiles/search",
      expect.objectContaining({
        headers: { Authorization: "Bearer sqp_test_token" },
      }),
    );
  });
});

describe("runSonarScanner", () => {
  const originalUrl = process.env.SONARQUBE_URL;
  const originalToken = process.env.SONARQUBE_TOKEN;
  const logs: string[] = [];

  beforeEach(() => {
    logs.length = 0;
    delete process.env.SONARQUBE_URL;
    delete process.env.SONARQUBE_TOKEN;
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SONARQUBE_URL;
    else process.env.SONARQUBE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SONARQUBE_TOKEN;
    else process.env.SONARQUBE_TOKEN = originalToken;
  });

  it("skips gracefully when SonarQube is not configured", async () => {
    const findings = await runSonarScanner("/tmp/repo", "scan-123", {
      log: (message) => logs.push(message),
    });

    expect(findings).toEqual([]);
    expect(logs.some((line) => line.includes("not configured"))).toBe(true);
  });

  it("runs scanner flow and returns parsed findings when configured", async () => {
    process.env.SONARQUBE_URL = "https://sonar.example.com";
    process.env.SONARQUBE_TOKEN = "sqp_test_token";

    const repoDir = mkdtempSync(join(tmpdir(), "sonar-scan-test-"));
    const execCalls: Array<{ bin: string; repoDir: string }> = [];
    const deleted: string[] = [];
    const findings = await runSonarScanner(repoDir, "scan-abc", {
      findScanner: () => "/opt/homebrew/bin/sonar-scanner",
      execScanner: (bin, repoDir) => {
        execCalls.push({ bin, repoDir });
      },
      readReportTask: () => "ceTaskId=task-1\n",
      waitForAnalysis: async () => {},
      fetchIssues: async () => [
        {
          rule: "typescript:S1234",
          severity: "MAJOR",
          message: "Fix this",
          component: "scan-abc:src/main.ts",
          line: 4,
        },
      ],
      deleteProject: async (key) => {
        deleted.push(key);
      },
      log: (message) => logs.push(message),
    });

    expect(execCalls).toEqual([
      { bin: "/opt/homebrew/bin/sonar-scanner", repoDir },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "sonar.typescript:S1234",
      severity: "warning",
      filePath: "src/main.ts",
    });
    expect(deleted).toEqual(["scan-abc"]);
    rmSync(repoDir, { recursive: true, force: true });
  });
});

/**
 * Every scan analyses under a fresh `scan-<id>` key, so a path that forgets to
 * clean up leaves a project per scan on the server, each with its own history
 * and search indices. Nothing bills for it and nothing errors — it just grows
 * until the project list is unusable, which is why this needs pinning rather
 * than trusting the happy path.
 */
describe("runSonarScanner — scratch project cleanup", () => {
  const originalUrl = process.env.SONARQUBE_URL;
  const originalToken = process.env.SONARQUBE_TOKEN;
  const logs: string[] = [];

  beforeEach(() => {
    logs.length = 0;
    process.env.SONARQUBE_URL = "https://sonar.example.com";
    process.env.SONARQUBE_TOKEN = "sqp_test_token";
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SONARQUBE_URL;
    else process.env.SONARQUBE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SONARQUBE_TOKEN;
    else process.env.SONARQUBE_TOKEN = originalToken;
  });

  /** Run with everything stubbed, letting one step be overridden per case. */
  async function run(overrides: Parameters<typeof runSonarScanner>[2]) {
    // A real directory: sonar-project.properties is written before the cleanup
    // block is even entered, so a missing path fails ahead of what is under test.
    const repoDir = mkdtempSync(join(tmpdir(), "sonar-cleanup-test-"));
    const deleted: string[] = [];
    try {
      const findings = await runSonarScanner(repoDir, "scan-xyz", {
        findScanner: () => "/usr/local/bin/sonar-scanner",
        execScanner: () => {},
        readReportTask: () => "ceTaskId=task-1\n",
        waitForAnalysis: async () => {},
        fetchIssues: async () => [],
        deleteProject: async (key) => {
          deleted.push(key);
        },
        log: (message: string) => logs.push(message),
        ...overrides,
      });
      return { findings, deleted };
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  }

  it("deletes the project when the scanner binary fails to run", async () => {
    const { deleted } = await run({
      execScanner: () => {
        throw new Error("exit 1");
      },
      readReportTask: () => null,
    });

    expect(deleted).toEqual(["scan-xyz"]);
  });

  it("deletes the project when report-task.txt never appears", async () => {
    // The scanner can create the project server-side and then fail before
    // writing its report, so this early return is the easiest leak to miss.
    const { findings, deleted } = await run({ readReportTask: () => null });

    expect(findings).toEqual([]);
    expect(deleted).toEqual(["scan-xyz"]);
  });

  it("deletes the project when the report carries no ceTaskId", async () => {
    const { deleted } = await run({ readReportTask: () => "projectKey=scan-xyz\n" });
    expect(deleted).toEqual(["scan-xyz"]);
  });

  it("deletes the project when the analysis task fails", async () => {
    await expect(
      run({
        waitForAnalysis: async () => {
          throw new Error("SonarQube analysis FAILED");
        },
      }),
    ).rejects.toThrow("analysis FAILED");
  });

  it("does not fail the scan when the delete itself fails", async () => {
    // The findings are already in hand by then; a project left behind costs
    // disk, not correctness.
    const { findings } = await run({
      fetchIssues: async () => [
        { rule: "x:S1", severity: "MINOR", message: "m", component: "scan-xyz:a.ts", line: 1 },
      ],
      deleteProject: async () => {
        throw new Error("403 insufficient privileges");
      },
    });

    expect(findings).toHaveLength(1);
    expect(logs.some((l) => l.includes("Could not delete scratch project"))).toBe(true);
  });

  it("skips the delete entirely when no scanner ran", async () => {
    // Nothing was created, so there is nothing to delete — and calling the API
    // here would be a request on every scan in a deployment without SonarQube.
    const { deleted } = await run({ findScanner: () => null });
    expect(deleted).toEqual([]);
  });
});

/**
 * Every early exit of runSonarScanner returns `[]`, the same value as "analysed
 * and found nothing". A scan with SonarQube down (Docker stopped, wrong URL)
 * therefore completed with a clean-looking 0. onUnavailable is how the caller
 * tells the two apart, so each exit that analysed nothing has to call it — and
 * the one that did analyse must not.
 */
describe("runSonarScanner — reporting an engine that did not run", () => {
  const originalUrl = process.env.SONARQUBE_URL;
  const originalToken = process.env.SONARQUBE_TOKEN;

  beforeEach(() => {
    process.env.SONARQUBE_URL = "https://sonar.example.com";
    process.env.SONARQUBE_TOKEN = "sqp_test_token";
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SONARQUBE_URL;
    else process.env.SONARQUBE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SONARQUBE_TOKEN;
    else process.env.SONARQUBE_TOKEN = originalToken;
  });

  async function reasons(overrides: Parameters<typeof runSonarScanner>[2]): Promise<string[]> {
    const repoDir = mkdtempSync(join(tmpdir(), "sonar-unavailable-test-"));
    const reported: string[] = [];
    try {
      await runSonarScanner(repoDir, "scan-xyz", {
        findScanner: () => "/usr/local/bin/sonar-scanner",
        execScanner: () => {},
        readReportTask: () => "ceTaskId=task-1\n",
        waitForAnalysis: async () => {},
        fetchIssues: async () => [],
        deleteProject: async () => {},
        log: () => {},
        onUnavailable: (reason) => reported.push(reason),
        ...overrides,
      });
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
    return reported;
  }

  it("reports a missing configuration", async () => {
    delete process.env.SONARQUBE_URL;
    delete process.env.SONARQUBE_TOKEN;
    expect(await reasons({})).toEqual(["is not set up on this server"]);
  });

  it("reports a missing scanner binary", async () => {
    expect(await reasons({ findScanner: () => null })).toEqual(["is not available on this server"]);
  });

  it("tells the user it could not be reached, and keeps the cause for the log", async () => {
    // What a stopped SonarQube produces: the exception message is only the
    // command line, stderr is empty, and the diagnosis is an ERROR line on
    // stdout. That line carries the server URL — fine for the operator's log,
    // not for a reason stored on the scan and served to every tenant member.
    const failure = Object.assign(new Error("Command failed: sonar-scanner -Dsonar.projectBaseDir=/tmp/x"), {
      stdout: Buffer.from(
        "INFO: Scanner configuration file\nERROR: Failed to query server version: Connect to localhost:9100 failed\nINFO: EXECUTION FAILURE\n",
      ),
      stderr: Buffer.from(""),
    });
    const logged: string[] = [];
    const reported = await reasons({
      execScanner: () => {
        throw failure;
      },
      readReportTask: () => null,
      log: (message: string) => logged.push(message),
    });

    expect(reported).toEqual(["could not be reached"]);
    expect(reported.join(" ")).not.toMatch(/localhost|9100|sonar-scanner|ERROR/);
    expect(logged.join("\n")).toContain("Failed to query server version: Connect to localhost:9100 failed");
  });

  it("reports a missing report when the scanner exited cleanly", async () => {
    expect(await reasons({ readReportTask: () => null })).toEqual(["could not be reached"]);
  });

  it("reports a report without an analysis task id", async () => {
    expect(await reasons({ readReportTask: () => "projectKey=scan-xyz\n" })).toEqual(["could not be reached"]);
  });

  it("reports nothing when the analysis ran, even if it found nothing", async () => {
    expect(await reasons({})).toEqual([]);
  });
});

describe("getSonarConfig — variable naming", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("accepts the SAST service's naming so one pair configures the platform", () => {
    delete process.env.SONARQUBE_URL;
    delete process.env.SONARQUBE_TOKEN;
    process.env.SONAR_HOST_URL = "https://sonar.example.com";
    process.env.SONAR_TOKEN = "squ_legacy";

    expect(getSonarConfig()).toEqual({
      baseUrl: "https://sonar.example.com",
      token: "squ_legacy",
    });
  });

  it("prefers SONARQUBE_* when both namings are present", () => {
    process.env.SONARQUBE_URL = "https://new.example.com";
    process.env.SONARQUBE_TOKEN = "squ_new";
    process.env.SONAR_HOST_URL = "https://old.example.com";
    process.env.SONAR_TOKEN = "squ_old";

    expect(getSonarConfig()).toEqual({ baseUrl: "https://new.example.com", token: "squ_new" });
  });

  it("stays unconfigured when a naming is only half present", () => {
    delete process.env.SONARQUBE_URL;
    delete process.env.SONARQUBE_TOKEN;
    delete process.env.SONAR_TOKEN;
    process.env.SONAR_HOST_URL = "https://sonar.example.com";

    expect(getSonarConfig()).toBeNull();
  });
});
