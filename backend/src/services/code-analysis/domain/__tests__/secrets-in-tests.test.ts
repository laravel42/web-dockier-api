/**
 * A secret rule firing on a test fixture is a false positive by construction:
 * the fixture holds fake credentials on purpose.
 *
 * On the first real scan with Semgrep enabled (laravel42/amedeusapp, 679 files),
 * 3 of the 5 secret findings were fixtures — a 60% false-positive rate in the
 * category users check first, which is how a scanner stops being read. The
 * paths below are the real ones from that scan.
 *
 * The narrow scope is the point. Tests are still scanned, and an injection or
 * XSS finding in a test says something true about the code under test; only
 * secret detection gets this treatment.
 */
import { describe, expect, it } from "vitest";

import {
  dropSecretFindingsInTests,
  isSecretDetectionFinding,
} from "../finding-filters.js";
import { isTestFilePath } from "../scan-skip-dirs.js";

const finding = (ruleId: string, filePath: string) => ({
  ruleId,
  filePath,
  severity: "info" as const,
  message: "m",
  startLine: 1,
  endLine: 1,
  snippet: "",
});

describe("isSecretDetectionFinding", () => {
  it.each([
    "generic.secrets.gitleaks.private-key",
    "generic.secrets.gitleaks.hashicorp-tf-password",
    "generic.secrets.security.detected-aws-access-key-id-value",
    "custom.auth.hardcoded-secret",
  ])("recognises %s", (ruleId) => {
    expect(isSecretDetectionFinding(ruleId)).toBe(true);
  });

  it.each([
    // All real rule ids from the same scan. None of these is about credentials,
    // so a test fixture is not automatically a false positive for them.
    "javascript.browser.security.insecure-innerhtml",
    "javascript.lang.security.audit.detect-non-literal-regexp",
    "dockerfile.security.secret-in-build-arg",
    "generic.html-templates.security.var-in-href",
    "sonar.python:S4790",
    "custom.generic.http-no-tls",
  ])("leaves %s alone", (ruleId) => {
    expect(isSecretDetectionFinding(ruleId)).toBe(false);
  });

  it("does not treat `secret-in-build-arg` as secret detection", () => {
    // It names a secret but reports a Dockerfile mistake: build args are baked
    // into the image layers. A test Dockerfile doing that is still wrong.
    expect(isSecretDetectionFinding("dockerfile.security.secret-in-build-arg")).toBe(false);
  });
});

describe("isTestFilePath", () => {
  it.each([
    // The three fixtures from the real scan.
    "src/lib/vault.test.ts",
    "src/lib/vault-note-language.test.ts",
    "src/services/password-recovery.test.ts",
    // Other conventions the scanner will meet.
    "backend/src/shared/__tests__/test-helpers.ts",
    "src/__mocks__/client.ts",
    "tests/Feature/AuthTest.php",
    "app/Models/UserTest.php",
    "api/test_auth.py",
    "api/auth_test.py",
    "conftest.py",
    "pkg/store/store_test.go",
    "src/main/java/com/acme/UserTest.java",
    "e2e/login.spec.ts",
    "cypress/login.cy.js",
    "spec/models/user_spec.rb",
    "testdata/keys.json",
  ])("classifies %s as test code", (path) => {
    expect(isTestFilePath(path)).toBe(true);
  });

  it.each([
    // The two findings from the real scan that are NOT tests, and must survive.
    "src/lib/vault.ts",
    "Dockerfile",
    // Names that merely contain the word, which must not be swept up: a file
    // wrongly judged a test hides real credentials, the one direction that
    // actually costs something.
    "src/lib/testimonials.ts",
    "src/components/LatestPosts.tsx",
    "src/contest/entry.ts",
    "src/protest-banner.tsx",
    "src/lib/attestation.ts",
  ])("does not classify %s as test code", (path) => {
    expect(isTestFilePath(path)).toBe(false);
  });

  it("handles Windows separators", () => {
    expect(isTestFilePath("src\\lib\\vault.test.ts")).toBe(true);
  });
});

describe("dropSecretFindingsInTests", () => {
  it("reproduces the real scan: drops the 3 fixtures, keeps the 2 real ones", () => {
    const findings = [
      finding("generic.secrets.gitleaks.private-key", "src/lib/vault-note-language.test.ts"),
      finding("generic.secrets.gitleaks.private-key", "src/lib/vault.test.ts"),
      finding("generic.secrets.gitleaks.hashicorp-tf-password", "src/services/password-recovery.test.ts"),
      finding("generic.secrets.gitleaks.hashicorp-tf-password", "src/lib/vault.ts"),
      finding("dockerfile.security.secret-in-build-arg", "Dockerfile"),
    ];

    const { kept, dropped } = dropSecretFindingsInTests(findings, isTestFilePath);

    expect(dropped).toBe(3);
    expect(kept.map((f) => f.filePath)).toEqual(["src/lib/vault.ts", "Dockerfile"]);
  });

  it("keeps a non-secret finding in a test file", () => {
    // The whole reason this filters findings instead of excluding the files: a
    // test can call an unsafe API for real.
    const findings = [
      finding("javascript.browser.security.insecure-innerhtml", "src/lib/render.test.ts"),
    ];

    const { kept, dropped } = dropSecretFindingsInTests(findings, isTestFilePath);

    expect(dropped).toBe(0);
    expect(kept).toHaveLength(1);
  });

  it("keeps a secret finding outside test code", () => {
    const findings = [finding("generic.secrets.gitleaks.private-key", "config/keys.ts")];
    expect(dropSecretFindingsInTests(findings, isTestFilePath).dropped).toBe(0);
  });

  it("returns an empty result unchanged", () => {
    expect(dropSecretFindingsInTests([], isTestFilePath)).toEqual({ kept: [], dropped: 0 });
  });
});
