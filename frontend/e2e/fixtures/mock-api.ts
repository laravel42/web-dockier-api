import type { Page, Route } from "@playwright/test";
import { E2E_TOKEN, E2E_USER_ID } from "./auth";

const mockMe = {
  userId: E2E_USER_ID,
  email: "e2e@dockier.test",
  name: "E2E User",
  tenantId: "e2e-tenant",
  roleId: "e2e-role",
  roleName: "Owner",
  systemKey: "owner",
  isOwner: true,
  permissions: [
    "project:view",
    "project:create",
    "project:delete",
    "project:edit",
    "deploy:view",
    "deploy:create",
    "deploy:manage",
    "scan:view",
    "scan:manage",
  ],
  memberships: [],
};

const mockProject = {
  id: "proj-e2e-1",
  name: "Smoke Test Project",
  repository: "acme/smoke-test",
  branch: "main",
  connectionId: "conn-e2e-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function isApiRequest(route: Route): boolean {
  const type = route.request().resourceType();
  return type === "fetch" || type === "xhr";
}

export interface MockApiOptions {
  projects?: Array<typeof mockProject>;
}

/** Intercept API calls so smoke tests run without a live backend. */
export async function mockAuthenticatedApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  const projects = options.projects ?? [mockProject];

  await page.route("**/auth/me", (route) => {
    if (!isApiRequest(route)) return route.continue();
    return json(route, mockMe);
  });

  await page.route("**/projects", (route) => {
    if (!isApiRequest(route)) return route.continue();
    if (route.request().method() === "GET") {
      return json(route, { projects });
    }
    return route.fallback();
  });

  await page.route("**/deploy/deployments**", (route) => {
    if (!isApiRequest(route)) return route.continue();
    return json(route, { deployments: [] });
  });
  await page.route("**/deploy/providers", (route) => {
    if (!isApiRequest(route)) return route.continue();
    return json(route, { providers: [] });
  });
  await page.route("**/code-analysis/scans**", (route) => {
    if (!isApiRequest(route)) return route.continue();
    return json(route, { scans: [] });
  });
  await page.route("**/git/repo-badges**", (route) => {
    if (!isApiRequest(route)) return route.continue();
    return json(route, { badges: [] });
  });
  await page.route("**/git/repo-favicon**", (route) => {
    if (!isApiRequest(route)) return route.continue();
    return json(route, { favicon: null, deployId: null });
  });
}

export async function seedAuthStorage(page: Page): Promise<void> {
  await page.addInitScript(
    ({ token, userId }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("userId", userId);
    },
    { token: E2E_TOKEN, userId: E2E_USER_ID },
  );
}
