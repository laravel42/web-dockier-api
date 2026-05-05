/**
 * Preservation Property Tests — AWS EC2 DB Credential Fix
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests capture the CURRENT (unfixed) baseline behavior that MUST be
 * preserved after the fix is applied. All tests here PASS on the unfixed code.
 *
 * Property 2: Preservation — Default Credentials and Non-DB Behavior Unchanged
 *
 * _For any_ deploy event where the user does NOT provide custom database
 * credentials, or deploys via ECS, the fixed code SHALL produce the same
 * result as the original code.
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
 * Replicates the CURRENT (unfixed) deployParams construction logic from
 * aws-deploy.ts. This is the baseline we must preserve.
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
  return deployParams;
}

// ---------------------------------------------------------------------------
// Read ec2.yml once for template-level assertions
// ---------------------------------------------------------------------------

const ec2YmlPath = join(__dirname, "..", "cfn-templates", "ec2.yml");
const ec2YmlContent = readFileSync(ec2YmlPath, "utf-8");

// Extract step blocks once for reuse across tests
const step02Match = ec2YmlContent.match(
  /02_self_hosted_services:\s*\n\s*command:\s*!Sub\s*\|\s*\n([\s\S]*?)(?=\n\s{12}\d{2}_|\n\s{8}files:)/,
);
const step02Content = step02Match ? step02Match[1] : "";

const step03Match = ec2YmlContent.match(
  /03_deploy_container:\s*\n\s*command:\s*!Sub\s*\|\s*\n([\s\S]*?)(?=\n\s{12}\d{2}_|\n\s{8}files:)/,
);
const step03Content = step03Match ? step03Match[1] : "";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Preservation: Default Credentials and Non-DB Behavior Unchanged", () => {
  // ── 1. Default credentials preservation ─────────────────────────────────
  describe("Default credentials preservation (Req 3.1)", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * When envVars is empty or contains no DB-related vars, the deployParams
     * object has appName, containerPort, instanceType (for EC2). No envVars
     * field is expected in the current code (additive fields are acceptable
     * after fix).
     */
    it("should produce deployParams with appName, containerPort, instanceType for EC2 when envVars is empty", () => {
      const event: DeployEvent = { deployStrategy: "vps", envVars: [] };
      const params = buildDeployParams(event, "my-app", 3000);

      expect(params).toHaveProperty("appName", "my-app");
      expect(params).toHaveProperty("containerPort", 3000);
      expect(params).toHaveProperty("instanceType", "t3.small");
      // Current code does NOT include envVars in deployParams
      expect(params).not.toHaveProperty("cpu");
      expect(params).not.toHaveProperty("memory");
    });

    it("should produce deployParams with appName, containerPort, instanceType for EC2 when envVars is undefined", () => {
      const event: DeployEvent = { deployStrategy: "vps" };
      const params = buildDeployParams(event, "another-app", 8080);

      expect(params).toHaveProperty("appName", "another-app");
      expect(params).toHaveProperty("containerPort", 8080);
      expect(params).toHaveProperty("instanceType", "t3.small");
    });

    it("should produce deployParams with appName, containerPort, instanceType for EC2 when envVars has only non-DB vars", () => {
      const event: DeployEvent = {
        deployStrategy: "vps",
        envVars: [
          { name: "APP_KEY", value: "base64:abc123" },
          { name: "APP_URL", value: "https://example.com" },
          { name: "MAIL_HOST", value: "smtp.example.com" },
        ],
      };
      const params = buildDeployParams(event, "laravel-app", 3000);

      expect(params).toHaveProperty("appName", "laravel-app");
      expect(params).toHaveProperty("containerPort", 3000);
      expect(params).toHaveProperty("instanceType", "t3.small");
    });

    it("should default containerPort to 3000 when port is 0", () => {
      const event: DeployEvent = { deployStrategy: "vps", envVars: [] };
      const params = buildDeployParams(event, "app", 0);

      expect(params).toHaveProperty("containerPort", 3000);
    });
  });

  // ── 2. ECS deploy preservation ──────────────────────────────────────────
  describe("ECS deploy preservation (Req 3.2)", () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * When deployStrategy is 'managed', deployTarget is 'ecs' with cpu/memory
     * params. EC2-specific changes don't affect ECS.
     */
    it("should produce deployParams with cpu and memory for ECS (managed) strategy", () => {
      const event: DeployEvent = { deployStrategy: "managed", envVars: [] };
      const params = buildDeployParams(event, "ecs-app", 3000);

      expect(params).toHaveProperty("appName", "ecs-app");
      expect(params).toHaveProperty("containerPort", 3000);
      expect(params).toHaveProperty("cpu", "512");
      expect(params).toHaveProperty("memory", "1024");
      // ECS should NOT have instanceType
      expect(params).not.toHaveProperty("instanceType");
    });

    it("should produce ECS params regardless of envVars content", () => {
      const event: DeployEvent = {
        deployStrategy: "managed",
        envVars: [
          { name: "DB_DATABASE", value: "mydb" },
          { name: "DB_USERNAME", value: "admin" },
          { name: "DB_PASSWORD", value: "secret" },
        ],
      };
      const params = buildDeployParams(event, "ecs-laravel", 8080);

      // ECS params are always the same regardless of envVars
      expect(params).toHaveProperty("cpu", "512");
      expect(params).toHaveProperty("memory", "1024");
      expect(params).not.toHaveProperty("instanceType");
    });

    it("should map unknown deployStrategy to EC2 (default)", () => {
      const event: DeployEvent = { deployStrategy: "unknown" };
      const params = buildDeployParams(event, "app", 3000);

      // Unknown strategy defaults to ec2
      expect(params).toHaveProperty("instanceType", "t3.small");
      expect(params).not.toHaveProperty("cpu");
      expect(params).not.toHaveProperty("memory");
    });
  });

  // ── 3. Non-DB env vars preservation ─────────────────────────────────────
  describe("Non-DB env vars preservation (Req 3.4)", () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * The ec2.yml step 03_deploy_container passes all user env vars through
     * an env file — verify the Python parsing loop processes all env vars.
     */
    it("should have a Python parsing loop in step 03 that iterates all env vars", () => {
      expect(step03Content.length).toBeGreaterThan(0);

      // The Python one-liner that parses EnvVarsJson and prints name=value pairs
      const hasPythonImport = step03Content.includes("import sys, json");
      const hasJsonLoad = step03Content.includes("json.load(sys.stdin)");
      expect(hasPythonImport).toBe(true);
      expect(hasJsonLoad).toBe(true);
    });

    it("should write user env vars to an env file for docker", () => {
      // User env vars are written to an env file to handle values with spaces
      expect(step03Content).toContain(".env");
      expect(step03Content).toContain("--env-file");
    });

    it("should include env file flag in the docker run command", () => {
      const dockerRunMatch = step03Content.match(/docker run[\s\S]*?\$\{ImageUri\}/);
      expect(dockerRunMatch).not.toBeNull();
      expect(dockerRunMatch![0]).toContain("$ENV_FILE_FLAG");
    });
  });

  // ── 4. Redis/queue/scheduler preservation ───────────────────────────────
  describe("Redis/queue/scheduler preservation (Req 3.5)", () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * The ec2.yml step 02_self_hosted_services handles cache, queue, and
     * scheduler services. These blocks exist and are independent of DB
     * credential changes.
     */
    it("should have a Redis/cache installation block in step 02", () => {
      expect(step02Content).toContain('grep -q "cache"');
      expect(step02Content).toContain("Installing Redis...");
      expect(step02Content).toContain("apt-get install -y redis-server");
      expect(step02Content).toContain("Redis ready on 0.0.0.0:6379");
    });

    it("should have a queue worker (Supervisor) block in step 02", () => {
      expect(step02Content).toContain('grep -q "queue"');
      expect(step02Content).toContain("Installing Supervisor for queue worker...");
      expect(step02Content).toContain("apt-get install -y supervisor");
    });

    it("should have a scheduler block in step 02", () => {
      expect(step02Content).toContain('grep -q "scheduler"');
      expect(step02Content).toContain("Scheduler will be configured after container starts");
    });

    it("should inject Redis env vars in step 03 as infrastructure overrides for cache service", () => {
      expect(step03Content).toContain("REDIS_HOST=host.docker.internal");
      expect(step03Content).toContain("REDIS_PORT=6379");
    });

    it("should inject QUEUE_CONNECTION in step 03 env file for queue service", () => {
      expect(step03Content).toContain("QUEUE_CONNECTION=redis");
    });

    it("should handle broadcasting service alongside cache (Redis)", () => {
      // The cache block also triggers on "broadcasting"
      expect(step02Content).toContain('grep -q "broadcasting"');
      // Step 03 also checks broadcasting for Redis flags
      expect(step03Content).toContain('grep -q "broadcasting"');
    });
  });

  // ── 5. ec2.yml default credentials ──────────────────────────────────────
  describe("ec2.yml default credentials when EnvVarsJson is empty (Req 3.1)", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * When EnvVarsJson is empty ('[]'), the MySQL block uses
     * appdb/appuser/apppass123 and the PostgreSQL block uses
     * appdb/appuser/apppass123. This is the correct default behavior.
     */
    it("should use 'appdb' as the default MySQL database name (via variable fallback)", () => {
      // MySQL block creates database using $DB_NAME variable (defaults to appdb)
      expect(step02Content).toContain("DB_NAME=");
      expect(step02Content).toContain("appdb");
    });

    it("should use 'appuser' as the default MySQL username (via variable fallback)", () => {
      expect(step02Content).toContain("DB_USER=");
      expect(step02Content).toContain("appuser");
    });

    it("should grant privileges on the database to the user for MySQL", () => {
      expect(step02Content).toContain("GRANT ALL PRIVILEGES ON");
    });

    it("should use 'appdb' as the default PostgreSQL database name (via variable fallback)", () => {
      expect(step02Content).toContain("CREATE DATABASE");
      expect(step02Content).toContain("appdb");
    });

    it("should use 'appuser' as the default PostgreSQL username with 'apppass123' password (via variable fallback)", () => {
      expect(step02Content).toContain("CREATE USER");
      expect(step02Content).toContain("appuser");
      expect(step02Content).toContain("apppass123");
    });

    it("should configure pg_hba.conf for the database user", () => {
      expect(step02Content).toContain("172.16.0.0/12 md5");
      expect(step02Content).toContain("10.0.0.0/8 md5");
    });

    it("should use default DB credentials in step 03 env file for MySQL", () => {
      // Step 03 writes defaults to the env file before user values
      expect(step03Content).toContain("DB_DATABASE=appdb");
      expect(step03Content).toContain("DB_USERNAME=appuser");
      expect(step03Content).toContain("DB_PASSWORD=apppass123");
    });

    it("should use default DB credentials in step 03 env file for PostgreSQL", () => {
      // The pgsql branch also uses the same defaults written to env file
      expect(step03Content).toContain("DB_CONNECTION=pgsql");
      expect(step03Content).toContain("DB_DATABASE=appdb");
      expect(step03Content).toContain("DB_USERNAME=appuser");
      expect(step03Content).toContain("DB_PASSWORD=apppass123");
    });

    it("should detect DB engine from DB_CONNECTION in EnvVarsJson", () => {
      // Both step 02 and step 03 parse DB_CONNECTION from EnvVarsJson
      expect(step02Content).toContain("DB_CONNECTION");
      expect(step03Content).toContain("DB_CONNECTION");
    });
  });
});
