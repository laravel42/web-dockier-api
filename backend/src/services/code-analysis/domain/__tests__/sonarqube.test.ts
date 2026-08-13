import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    rmSync(repoDir, { recursive: true, force: true });
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
