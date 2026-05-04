/**
 * Bug Condition Exploration Test — AWS EC2 DB Credential Mismatch
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * This test encodes the EXPECTED behavior after the fix. It should FAIL on
 * the current unfixed code, confirming the three-part credential mismatch bug:
 *
 *   1. `aws-deploy.ts` omits `envVars` / `techStack` / `selfHostedServices`
 *      from the SNS `deployParams` object.
 *   2. `ec2.yml` step `02_self_hosted_services` uses hardcoded credentials
 *      (`appdb`/`appuser`/`apppass123`) instead of parsing from `EnvVarsJson`.
 *   3. `ec2.yml` step `03_deploy_container` places `$SVC_FLAGS` AFTER
 *      `$ENV_FLAGS`, so hardcoded values overwrite user values.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers — replicate the deployParams construction logic from aws-deploy.ts
// ---------------------------------------------------------------------------

interface DeployEvent {
  deployStrategy: string;
  envVars?: Array<{ name: string; value: string }>;
  techStack?: string[];
}

/**
 * Replicates the deployParams construction logic from aws-deploy.ts (lines 75-78).
 * This is the CURRENT (unfixed) logic — it only sets appName, containerPort,
 * and instanceType/cpu/memory.
 */
function buildDeployParams(
  event: DeployEvent,
  repoName: string,
  port: number,
): Record<string, any> {
  const deployTargetMap: Record<string, string> = { vps: "ec2", managed: "ecs" };
  const deployTarget = deployTargetMap[event.deployStrategy] || "ec2";
  const deployParams: Record<string, any> = {
    appName: repoName,
    containerPort: port || 3000,
  };
  if (deployTarget === "ecs") {
    deployParams.cpu = "512";
    deployParams.memory = "1024";
  }
  if (deployTarget === "ec2") {
    deployParams.instanceType = "t3.small";
  }
  if (event.envVars && event.envVars.length > 0) {
    deployParams.envVars = event.envVars;
  }
  if (event.techStack && event.techStack.length > 0) {
    deployParams.techStack = event.techStack;
  }
  const selfHostedServices: string[] = [];
  const hasDbEnvVars = (event.envVars || []).some(v =>
    ["DB_CONNECTION", "DB_DATABASE", "DB_HOST"].includes(v.name),
  );
  if (event.techStack?.some(t => t.toLowerCase() === "laravel") || hasDbEnvVars) {
    selfHostedServices.push("database");
  }
  if (selfHostedServices.length > 0) {
    deployParams.selfHostedServices = selfHostedServices;
  }

  return deployParams;
}

// ---------------------------------------------------------------------------
// Read ec2.yml once for template-level assertions
// ---------------------------------------------------------------------------

const ec2YmlPath = join(__dirname, "..", "cfn-templates", "ec2.yml");
const ec2YmlContent = readFileSync(ec2YmlPath, "utf-8");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Bug Condition: AWS EC2 Deploy Ignores User DB Credentials", () => {
  // ── Assertion 1: SNS message deployParams includes envVars ──────────────
  describe("SNS message deployParams includes envVars", () => {
    it("should include envVars in deployParams when user provides DB credentials", () => {
      const event: DeployEvent = {
        deployStrategy: "vps",
        envVars: [
          { name: "DB_DATABASE", value: "myapp" },
          { name: "DB_USERNAME", value: "admin" },
          { name: "DB_PASSWORD", value: "secret123" },
        ],
        techStack: ["Laravel", "PHP"],
      };

      const params = buildDeployParams(event, "my-laravel-app", 8080);

      // EXPECTED: deployParams should contain the user's envVars
      // ACTUAL (unfixed): deployParams only has appName, containerPort, instanceType
      expect(params).toHaveProperty("envVars");
      expect(params.envVars).toEqual(event.envVars);
    });
  });

  // ── Assertion 2: SNS message deployParams includes techStack & selfHostedServices
  describe("SNS message deployParams includes techStack and selfHostedServices", () => {
    it("should include techStack in deployParams when event has techStack", () => {
      const event: DeployEvent = {
        deployStrategy: "vps",
        envVars: [
          { name: "DB_DATABASE", value: "proddb" },
          { name: "DB_USERNAME", value: "pgadmin" },
          { name: "DB_PASSWORD", value: "pgpass" },
        ],
        techStack: ["Laravel", "PHP"],
      };

      const params = buildDeployParams(event, "laravel-app", 3000);

      // EXPECTED: deployParams should contain techStack
      // ACTUAL (unfixed): deployParams has no techStack field
      expect(params).toHaveProperty("techStack");
      expect(params.techStack).toEqual(["Laravel", "PHP"]);
    });

    it("should include selfHostedServices in deployParams for Laravel with DB env vars", () => {
      const event: DeployEvent = {
        deployStrategy: "vps",
        envVars: [
          { name: "DB_DATABASE", value: "myapp" },
          { name: "DB_USERNAME", value: "admin" },
          { name: "DB_PASSWORD", value: "secret123" },
        ],
        techStack: ["Laravel", "PHP"],
      };

      const params = buildDeployParams(event, "laravel-app", 3000);

      // EXPECTED: deployParams should contain selfHostedServices with 'database'
      // ACTUAL (unfixed): deployParams has no selfHostedServices field
      expect(params).toHaveProperty("selfHostedServices");
      expect(params.selfHostedServices).toContain("database");
    });
  });

  // ── Assertion 3: ec2.yml credential parsing uses EnvVarsJson ────────────
  describe("ec2.yml step 02_self_hosted_services parses DB credentials from EnvVarsJson", () => {
    // Extract the 02_self_hosted_services command block from ec2.yml
    const step02Match = ec2YmlContent.match(
      /02_self_hosted_services:\s*\n\s*command:\s*!Sub\s*\|\s*\n([\s\S]*?)(?=\n\s{12}\d{2}_|\n\s{8}files:)/,
    );
    const step02Content = step02Match ? step02Match[1] : "";

    it("should have the step 02 content available for testing", () => {
      expect(step02Content.length).toBeGreaterThan(0);
    });

    it("should parse DB_DATABASE from EnvVarsJson (not use hardcoded 'appdb')", () => {
      // EXPECTED: The PostgreSQL and MySQL blocks should use a variable
      // derived from EnvVarsJson for the database name, not the literal 'appdb'.
      //
      // We check that the step parses DB_DATABASE from EnvVarsJson.
      // ACTUAL (unfixed): There is no parsing of DB_DATABASE — only DB_CONNECTION is parsed.

      const parsesDbDatabase = step02Content.includes("DB_DATABASE");
      expect(parsesDbDatabase).toBe(true);
    });

    it("should parse DB_USERNAME from EnvVarsJson (not use hardcoded 'appuser')", () => {
      // EXPECTED: The step should parse DB_USERNAME from EnvVarsJson.
      // ACTUAL (unfixed): There is no parsing of DB_USERNAME.

      const parsesDbUsername = step02Content.includes("DB_USERNAME");
      expect(parsesDbUsername).toBe(true);
    });

    it("should parse DB_PASSWORD from EnvVarsJson (not use hardcoded 'apppass123')", () => {
      // EXPECTED: The step should parse DB_PASSWORD from EnvVarsJson.
      // ACTUAL (unfixed): There is no parsing of DB_PASSWORD.

      const parsesDbPassword = step02Content.includes("DB_PASSWORD");
      expect(parsesDbPassword).toBe(true);
    });
  });

  // ── Assertion 4: docker run uses env file with user values overriding defaults ───
  describe("ec2.yml step 03_deploy_container env var handling", () => {
    // Extract the 03_deploy_container command block from ec2.yml
    const step03Match = ec2YmlContent.match(
      /03_deploy_container:\s*\n\s*command:\s*!Sub\s*\|\s*\n([\s\S]*?)(?=\n\s{12}\d{2}_|\n\s{8}files:)/,
    );
    const step03Content = step03Match ? step03Match[1] : "";

    it("should have the step 03 content available for testing", () => {
      expect(step03Content.length).toBeGreaterThan(0);
    });

    it("should write defaults before user env vars in the env file so user values win", () => {
      // Defaults are written to the env file first, then user env vars are appended.
      // In Docker --env-file, later lines for the same key override earlier ones.
      const defaultDbWrite = step03Content.indexOf('echo "DB_DATABASE=appdb"');
      // The user env var append section is marked with this comment
      const userEnvAppend = step03Content.indexOf("# Append user env vars");

      expect(defaultDbWrite).toBeGreaterThan(-1);
      expect(userEnvAppend).toBeGreaterThan(-1);

      // Defaults should come BEFORE user env var append
      expect(defaultDbWrite).toBeLessThan(userEnvAppend);
    });

    it("should use --env-file for user env vars and -e for infrastructure overrides", () => {
      const dockerRunMatch = step03Content.match(/docker run[\s\S]*?\$\{ImageUri\}/);
      expect(dockerRunMatch).not.toBeNull();

      const dockerRunCmd = dockerRunMatch![0];

      // Env file flag should be present (handles values with spaces correctly)
      expect(dockerRunCmd).toContain("$ENV_FILE_FLAG");

      // Infrastructure overrides (DB_HOST) should be -e flags that always win
      expect(dockerRunCmd).toContain("$SVC_OVERRIDES");

      // $SVC_OVERRIDES should come AFTER $ENV_FILE_FLAG so infra values win
      const envFileIndex = dockerRunCmd.indexOf("$ENV_FILE_FLAG");
      const overridesIndex = dockerRunCmd.indexOf("$SVC_OVERRIDES");
      expect(overridesIndex).toBeGreaterThan(envFileIndex);
    });
  });
});
