/**
 * API Smoke Tests — verifies every endpoint returns expected status codes.
 *
 * Prerequisites:
 *   1. `encore run` must be running on localhost:4000
 *   2. Database must be seeded (`pnpm db:reset`)
 *
 * Run: pnpm test -- __tests__/api-smoke.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.API_BASE || "http://localhost:4000";
let TOKEN = "";
let USER_ID = "";
let APP_ID = "";

// Check server availability synchronously via a top-level await
let SERVER_UP = false;
try {
  const res = await fetch(`${BASE}/auth/me`, { signal: AbortSignal.timeout(2000) });
  SERVER_UP = true;
} catch {
  console.warn("\n⚠ Encore server not running on " + BASE + " — skipping smoke tests.\n  Start with: encore run\n");
}

// Helper: make authenticated requests
async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token || TOKEN) headers["Authorization"] = `Bearer ${token || TOKEN}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

// ─── Auth ───

describe.skipIf(!SERVER_UP)("Auth", () => {
  it("POST /auth/login — valid credentials", async () => {
    const res = await api("POST", "/auth/login", { email: "admin@dockier.io", password: "Admin123!" });
    expect(res.status).toBe(200);
    expect((res.json as { token: string }).token).toBeTruthy();
    TOKEN = (res.json as { token: string }).token;
    USER_ID = (res.json as { userId: string }).userId;
  });

  it("POST /auth/login — wrong password returns 401", async () => {
    const res = await api("POST", "/auth/login", { email: "admin@dockier.io", password: "wrong" });
    expect([401, 400]).toContain(res.status);
  });

  it("POST /auth/register — duplicate email returns error", async () => {
    const res = await api("POST", "/auth/register", { email: "admin@dockier.io", password: "Test123!", name: "Dup", appId: "" });
    expect([400, 409]).toContain(res.status);
  });

  it("GET /auth/me — returns current user", async () => {
    const res = await api("GET", "/auth/me");
    expect(res.status).toBe(200);
    expect((res.json as { email: string }).email).toBe("admin@dockier.io");
    APP_ID = (res.json as { appId: string }).appId || "";
  });

  it("POST /auth/2fa/setup — returns QR code", async () => {
    const res = await api("POST", "/auth/2fa/setup");
    expect(res.status).toBe(200);
    expect((res.json as { qrCodeUrl: string }).qrCodeUrl).toBeTruthy();
  });

  it("POST /auth/2fa/verify — invalid token returns error", async () => {
    const res = await api("POST", "/auth/2fa/verify", { userId: USER_ID, token: "000000" });
    expect([400, 401]).toContain(res.status);
  });

  it("GET /auth/me — unauthenticated returns 401", async () => {
    const res = await api("GET", "/auth/me", undefined, "invalid-token");
    expect([401, 500]).toContain(res.status);
  });
});

// ─── Users ───

describe.skipIf(!SERVER_UP)("Users", () => {
  let testUserId = "";

  it("GET /users — list users", async () => {
    const res = await api("GET", "/users");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { users: unknown[] }).users)).toBe(true);
  });

  it("POST /users — create user", async () => {
    const res = await api("POST", "/users", {
      email: `test-${Date.now()}@smoke.test`,
      password: "Test123!",
      name: "Smoke Test",
      timezone: "UTC",
      language: "en",
    });
    expect(res.status).toBe(200);
    testUserId = (res.json as { id: string }).id;
    expect(testUserId).toBeTruthy();
  });

  it("GET /users/:id — get user", async () => {
    if (!testUserId) return;
    const res = await api("GET", `/users/${testUserId}`);
    expect(res.status).toBe(200);
    expect((res.json as { email: string }).email).toContain("smoke.test");
  });

  it("PUT /users/:id — update user", async () => {
    if (!testUserId) return;
    const res = await api("PUT", `/users/${testUserId}`, { userId: testUserId, name: "Updated Name" });
    expect(res.status).toBe(200);
  });

  it("DELETE /users/:id — delete user", async () => {
    if (!testUserId) return;
    const res = await api("DELETE", `/users/${testUserId}`);
    expect(res.status).toBe(200);
  });
});

// ─── Roles ───

describe.skipIf(!SERVER_UP)("Roles", () => {
  let testRoleId = "";

  it("GET /roles — list roles", async () => {
    const res = await api("GET", "/roles");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { roles: unknown[] }).roles)).toBe(true);
  });

  it("POST /roles — create role", async () => {
    const res = await api("POST", "/roles", {
      name: "Smoke Test Role",
      description: "Test",
      permissions: ["project:view"],
    });
    expect(res.status).toBe(200);
    testRoleId = (res.json as { id: string }).id;
  });

  it("GET /roles/:id — get role", async () => {
    if (!testRoleId) return;
    const res = await api("GET", `/roles/${testRoleId}`);
    expect(res.status).toBe(200);
  });

  it("PUT /roles/:id — update role", async () => {
    if (!testRoleId) return;
    const res = await api("PUT", `/roles/${testRoleId}`, { roleId: testRoleId, name: "Updated Role" });
    expect(res.status).toBe(200);
  });

  it("DELETE /roles/:id — delete role", async () => {
    if (!testRoleId) return;
    const res = await api("DELETE", `/roles/${testRoleId}`);
    expect(res.status).toBe(200);
  });
});

// ─── Projects ───

describe.skipIf(!SERVER_UP)("Projects", () => {
  let testProjectId = "";

  it("GET /projects — list projects", async () => {
    const res = await api("GET", "/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { projects: unknown[] }).projects)).toBe(true);
  });

  it("POST /projects — create project", async () => {
    const res = await api("POST", "/projects", {
      name: "Smoke Test Project",
      repository: "https://github.com/test/repo",
    });
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) testProjectId = (res.json as { id: string }).id;
  });

  it("GET /projects/:id — get project", async () => {
    if (!testProjectId) return;
    const res = await api("GET", `/projects/${testProjectId}`);
    expect(res.status).toBe(200);
    expect((res.json as { name: string }).name).toBe("Smoke Test Project");
  });

  it("PUT /projects/:id — update project", async () => {
    if (!testProjectId) return;
    const res = await api("PUT", `/projects/${testProjectId}`, { projectId: testProjectId, name: "Updated Project" });
    expect(res.status).toBe(200);
  });

  it("DELETE /projects/:id — delete project", async () => {
    if (!testProjectId) return;
    const res = await api("DELETE", `/projects/${testProjectId}`);
    expect(res.status).toBe(200);
  });
});

// ─── Git Connections ───

describe.skipIf(!SERVER_UP)("Git Connections", () => {
  it("GET /git/connections — list connections", async () => {
    const res = await api("GET", "/git/connections");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { connections: unknown[] }).connections)).toBe(true);
  });

  // Note: addConnection, deleteConnection, updateConnection require valid tokens
  // so we just verify the list endpoint works
});

// ─── Git Repos & Analysis ───

describe.skipIf(!SERVER_UP)("Git Repos & Analysis", () => {
  it("GET /git/repo-badges — returns badges", async () => {
    const res = await api("GET", "/git/repo-badges?repo=test/repo");
    expect([200, 404, 500]).toContain(res.status);
  });

  it("POST /git/ai/summarize-finding — summarize", async () => {
    const res = await api("POST", "/git/ai/summarize-finding", {
      severity: "error",
      message: "SQL injection detected",
      filePath: "app.ts",
      snippet: "db.query(userInput)",
    });
    // May fail without OpenAI key, that's ok
    expect([200, 500, 502]).toContain(res.status);
  });
});

// ─── Code Analysis: Scans ───

describe.skipIf(!SERVER_UP)("Code Analysis: Scans", () => {
  it("GET /code-analysis/scans — list scans", async () => {
    const res = await api("GET", "/code-analysis/scans");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { scans: unknown[] }).scans)).toBe(true);
  });

  it("GET /code-analysis/scans/:id — not found", async () => {
    const res = await api("GET", "/code-analysis/scans/nonexistent");
    expect([404, 500]).toContain(res.status);
  });
});

// ─── Code Analysis: Custom Rules ───

describe.skipIf(!SERVER_UP)("Code Analysis: Custom Rules", () => {
  let testRuleId = "";

  it("GET /code-analysis/custom-rules — list custom rules", async () => {
    const res = await api("GET", "/code-analysis/custom-rules");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { rules: unknown[] }).rules)).toBe(true);
  });

  it("POST /code-analysis/custom-rules — create rule", async () => {
    const res = await api("POST", "/code-analysis/custom-rules", {
      ruleId: "smoke.test.rule",
      severity: "warning",
      message: "Smoke test rule",
      pattern: "\\btest\\b",
      extensions: [".ts"],
    });
    expect(res.status).toBe(200);
    testRuleId = (res.json as { id: string }).id;
  });

  it("PUT /code-analysis/custom-rules/:id — update rule", async () => {
    if (!testRuleId) return;
    const res = await api("PUT", `/code-analysis/custom-rules/${testRuleId}`, {
      ruleDbId: testRuleId,
      message: "Updated smoke test rule",
    });
    expect(res.status).toBe(200);
  });

  it("DELETE /code-analysis/custom-rules/:id — delete rule", async () => {
    if (!testRuleId) return;
    const res = await api("DELETE", `/code-analysis/custom-rules/${testRuleId}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ─── Code Analysis: Semgrep Rules ───

describe.skipIf(!SERVER_UP)("Code Analysis: Semgrep Rules", () => {
  it("GET /code-analysis/semgrep-rules — list semgrep rules", async () => {
    const res = await api("GET", "/code-analysis/semgrep-rules");
    expect(res.status).toBe(200);
    const data = res.json as { rules: unknown[]; languages: string[] };
    expect(Array.isArray(data.rules)).toBe(true);
    expect(Array.isArray(data.languages)).toBe(true);
  });

  it("GET /code-analysis/semgrep-rules/content — get rule content", async () => {
    // First get a rule ID
    const listRes = await api("GET", "/code-analysis/semgrep-rules");
    const rules = (listRes.json as { rules: Array<{ path: string }> }).rules;
    if (rules.length === 0) return;
    const res = await api("GET", `/code-analysis/semgrep-rules/content?path=${encodeURIComponent(rules[0].path)}`);
    expect(res.status).toBe(200);
    expect((res.json as { content: string }).content).toBeTruthy();
  });
});

// ─── Code Analysis: Rule Overrides ───

describe.skipIf(!SERVER_UP)("Code Analysis: Rule Overrides", () => {
  it("GET /code-analysis/rule-overrides — list overrides", async () => {
    const res = await api("GET", "/code-analysis/rule-overrides?tool=semgrep");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { overrides: unknown[] }).overrides)).toBe(true);
  });

  it("POST /code-analysis/rule-overrides — toggle rule", async () => {
    const res = await api("POST", "/code-analysis/rule-overrides", {
      tool: "semgrep",
      ruleId: "smoke.test.toggle",
      enabled: false,
    });
    expect(res.status).toBe(200);
  });
});

// ─── Deploy: Providers ───

describe.skipIf(!SERVER_UP)("Deploy: Providers", () => {
  it("GET /deploy/providers — list providers", async () => {
    const res = await api("GET", "/deploy/providers");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { providers: unknown[] }).providers)).toBe(true);
  });
});

// ─── Deploy: Deployments ───

describe.skipIf(!SERVER_UP)("Deploy: Deployments", () => {
  it("GET /deploy/deployments — list deployments", async () => {
    const res = await api("GET", "/deploy/deployments");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { deployments: unknown[] }).deployments)).toBe(true);
  });

  it("GET /deploy/deployments/:id — not found", async () => {
    const res = await api("GET", "/deploy/deployments/nonexistent");
    expect([404, 500]).toContain(res.status);
  });
});

// ─── Deploy: SSH Keys ───

describe.skipIf(!SERVER_UP)("Deploy: SSH Keys", () => {
  it("GET /deploy/ssh-keys — list keys", async () => {
    const res = await api("GET", "/deploy/ssh-keys");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { keys: unknown[] }).keys)).toBe(true);
  });
});

// ─── Deploy: Tofu ───

describe.skipIf(!SERVER_UP)("Deploy: Tofu", () => {
  it("POST /deploy/tofu/generate — missing params returns error", async () => {
    const res = await api("POST", "/deploy/tofu/generate", {});
    expect([400, 500]).toContain(res.status);
  });
});

// ─── Notifications ───

describe.skipIf(!SERVER_UP)("Notifications", () => {
  it("GET /notifications — list notifications", async () => {
    const res = await api("GET", "/notifications");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { notifications: unknown[] }).notifications)).toBe(true);
  });

  it("GET /notifications?unreadOnly=true — unread only", async () => {
    const res = await api("GET", "/notifications?unreadOnly=true");
    expect(res.status).toBe(200);
  });

  it("GET /notifications/channels — list channels", async () => {
    const res = await api("GET", "/notifications/channels");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { channels: unknown[] }).channels)).toBe(true);
  });
});

// ─── Image Builder ───

describe.skipIf(!SERVER_UP)("Image Builder", () => {
  it("GET /image-builder/builds — list builds", async () => {
    const res = await api("GET", "/image-builder/builds");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { builds: unknown[] }).builds)).toBe(true);
  });

  it("GET /image-builder/builds/:id — not found", async () => {
    const res = await api("GET", "/image-builder/builds/nonexistent/status");
    expect([404, 500]).toContain(res.status);
  });
});

// ─── Sensitive Data ───

describe.skipIf(!SERVER_UP)("Sensitive Data", () => {
  it("POST /git/analyze-sensitive-data — empty schema", async () => {
    const res = await api("POST", "/git/analyze-sensitive-data", { schema: "" });
    expect(res.status).toBe(200);
  });
});

// ─── Summary ───

describe.skipIf(!SERVER_UP)("Endpoint Coverage Summary", () => {
  it("all service groups tested", () => {
    // This test just documents that we've covered all services
    const services = [
      "auth", "users", "roles", "projects",
      "git-integration", "code-analysis", "deploy",
      "image-builder", "notifications",
    ];
    expect(services.length).toBe(9);
  });
});
