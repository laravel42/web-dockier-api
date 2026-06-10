import { describe, it, expect } from "vitest";
import {
  parseSemgrepOutput,
  toRepoRelativePath,
  runCustomRulesOnContent,
  shouldApplyCustomRule,
  runSensitiveDataScan,
  mapSensitiveSeverity,
  matchesExtension,
  mapSemgrepSeverity,
} from "../scan-analysis.js";

describe("mapSemgrepSeverity", () => {
  it("maps ERROR, WARNING, and INFO", () => {
    expect(mapSemgrepSeverity("ERROR")).toBe("error");
    expect(mapSemgrepSeverity("WARNING")).toBe("warning");
    expect(mapSemgrepSeverity("INFO")).toBe("info");
    expect(mapSemgrepSeverity("CRITICAL")).toBe("error");
    expect(mapSemgrepSeverity("LOW")).toBe("warning");
    expect(mapSemgrepSeverity(undefined)).toBe("warning");
    expect(mapSemgrepSeverity("unknown")).toBe("warning");
  });
});

describe("toRepoRelativePath", () => {
  it("strips absolute clone paths to repo-relative paths", () => {
    const repoDir = "/tmp/build-abc123/repo";
    expect(toRepoRelativePath("/tmp/build-abc123/repo/src/app.ts", repoDir)).toBe("src/app.ts");
    expect(toRepoRelativePath("src/app.ts", repoDir)).toBe("src/app.ts");
  });
});

describe("parseSemgrepOutput", () => {
  const sampleOutput = JSON.stringify({
    results: [
      {
        check_id: "rule.enabled",
        path: "src/app.ts",
        start: { line: 10, col: 1 },
        end: { line: 10, col: 20 },
        extra: {
          message: "Hardcoded secret detected",
          severity: "ERROR",
          lines: "const token = 'secret';",
        },
      },
      {
        check_id: "rule.disabled",
        path: "src/other.ts",
        start: { line: 5, col: 1 },
        end: { line: 5, col: 10 },
        extra: {
          message: "Should be skipped",
          severity: "WARNING",
          lines: "eval(x)",
        },
      },
      {
        check_id: "rule.info",
        path: "lib/util.ts",
        start: { line: 1, col: 1 },
        end: { line: 1, col: 5 },
        extra: {
          message: "Informational finding",
          severity: "INFO",
        },
      },
    ],
  });

  it("parses semgrep JSON and skips disabled rules", () => {
    const disabled = new Set(["rule.disabled"]);
    const findings = parseSemgrepOutput(sampleOutput, disabled, "/tmp/build-abc123/repo");

    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({
      ruleId: "rule.enabled",
      severity: "error",
      message: "Hardcoded secret detected",
      filePath: "src/app.ts",
      startLine: 10,
      endLine: 10,
      snippet: "const token = 'secret';",
    });
    expect(findings[1].ruleId).toBe("rule.info");
    expect(findings[1].severity).toBe("info");
    expect(findings[1].snippet).toBe("");
  });

  it("normalizes absolute semgrep paths using repoDir", () => {
    const output = JSON.stringify({
      results: [
        {
          check_id: "rule.abs",
          path: "/tmp/build-abc123/repo/lib/util.ts",
          start: { line: 1 },
          end: { line: 1 },
          extra: { message: "Issue", severity: "WARNING" },
        },
      ],
    });
    const findings = parseSemgrepOutput(output, new Set(), "/tmp/build-abc123/repo");
    expect(findings[0]?.filePath).toBe("lib/util.ts");
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseSemgrepOutput("not json", new Set())).toEqual([]);
  });

  it("falls back to metadata impact when severity is missing", () => {
    const output = JSON.stringify({
      results: [
        {
          check_id: "rule.no-severity",
          path: "src/app.ts",
          start: { line: 1 },
          end: { line: 1 },
          extra: {
            message: "High impact issue",
            metadata: { impact: "HIGH", likelihood: "LOW" },
          },
        },
      ],
    });

    const findings = parseSemgrepOutput(output, new Set());
    expect(findings[0]?.severity).toBe("error");
  });
});

describe("matchesExtension", () => {
  it("matches with or without leading dot", () => {
    expect(matchesExtension("src/app.ts", [".ts"])).toBe(true);
    expect(matchesExtension("src/app.ts", ["ts"])).toBe(true);
    expect(matchesExtension("src/app.js", [".ts"])).toBe(false);
  });

  it("matches all files when extensions list is empty", () => {
    expect(matchesExtension("README", [])).toBe(true);
  });
});

describe("runCustomRulesOnContent", () => {
  const rules = [
    {
      ruleId: "no-eval",
      severity: "error",
      message: "eval() is dangerous",
      pattern: "eval\\(",
      extensions: [".js"],
    },
    {
      ruleId: "todo-comment",
      severity: "warning",
      message: "TODO left in code",
      pattern: "TODO",
      extensions: [".ts"],
    },
  ];

  it("finds regex matches per line with line numbers and snippets", () => {
    const content = [
      "function run() {",
      "  eval('bad');",
      "// TODO: fix this",
      "}",
    ].join("\n");

    const findings = runCustomRulesOnContent("src/unsafe.js", content, rules);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      ruleId: "no-eval",
      severity: "error",
      filePath: "src/unsafe.js",
      startLine: 2,
      endLine: 2,
      snippet: "eval('bad');",
    });
    expect(findings[1]).toMatchObject({
      ruleId: "todo-comment",
      severity: "warning",
      startLine: 3,
      snippet: "// TODO: fix this",
    });
  });

  it("skips rules with invalid regex patterns", () => {
    const findings = runCustomRulesOnContent("file.js", "eval(1)", [
      { ruleId: "bad", severity: "error", message: "bad", pattern: "[", extensions: [] },
    ]);
    expect(findings).toEqual([]);
  });

  it("allows env() in Laravel config files", () => {
    const rule = {
      ruleId: "custom.laravel.env-in-code",
      severity: "info",
      message: "env() in application code",
      pattern: String.raw`\benv\s*\(\s*['"][^'"]+['"]`,
      extensions: [".php"],
    };
    const configPhp = "<?php\nreturn ['db' => env('DB_HOST')];";
    expect(runCustomRulesOnContent("config/database.php", configPhp, [rule])).toEqual([]);
    expect(runCustomRulesOnContent("app/Models/User.php", "$host = env('DB_HOST');", [rule])).toHaveLength(1);
    expect(shouldApplyCustomRule("custom.laravel.env-in-code", "config/mail.php")).toBe(false);
    expect(shouldApplyCustomRule("custom.laravel.env-in-code", "app/Services/Foo.php")).toBe(true);
  });
});

describe("mapSensitiveSeverity", () => {
  it("maps secret, sensitive, and personal levels", () => {
    expect(mapSensitiveSeverity("secret")).toBe("error");
    expect(mapSensitiveSeverity("sensitive")).toBe("warning");
    expect(mapSensitiveSeverity("personal")).toBe("info");
  });
});

describe("runSensitiveDataScan", () => {
  it("detects sensitive SQL columns with rule id, severity, and line numbers", () => {
    const sql = [
      "CREATE TABLE users (",
      "  id UUID PRIMARY KEY,",
      "  email VARCHAR(255),",
      "  password_hash VARCHAR(255)",
      ");",
    ].join("\n");

    const findings = runSensitiveDataScan([{ path: "migrations/001_users.sql", content: sql }]);

    expect(findings.length).toBeGreaterThanOrEqual(2);

    const emailFinding = findings.find((f) => f.snippet.includes("email"));
    expect(emailFinding).toMatchObject({
      ruleId: "sensitive-data.personal",
      severity: "info",
      filePath: "migrations/001_users.sql",
      startLine: 3,
    });

    const secretFinding = findings.find((f) => f.ruleId === "sensitive-data.secret");
    expect(secretFinding).toMatchObject({
      severity: "error",
      filePath: "migrations/001_users.sql",
      startLine: 4,
    });
    expect(secretFinding?.message).toContain("users.password_hash");
  });

  it("detects sensitive fields in TypeScript model files", () => {
    const model = [
      "export interface User {",
      "  id: string;",
      "  email: string;",
      "  apiKey: string;",
      "}",
    ].join("\n");

    const findings = runSensitiveDataScan([{ path: "src/models/User.ts", content: model }]);

    expect(findings.some((f) => f.ruleId === "sensitive-data.personal" && f.snippet.includes("email"))).toBe(
      true,
    );
    expect(findings.some((f) => f.ruleId === "sensitive-data.secret" && f.snippet.includes("apiKey"))).toBe(
      true,
    );
  });

  it("returns empty array when no schema or model files are provided", () => {
    expect(runSensitiveDataScan([{ path: "README.md", content: "# docs" }])).toEqual([]);
  });
});
