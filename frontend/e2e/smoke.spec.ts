import { test, expect } from "@playwright/test";
import { mockAuthenticatedApi, seedAuthStorage } from "./fixtures/mock-api";

test.describe("smoke", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send sign-in code" })).toBeVisible();
  });

  test("dashboard renders with mocked auth", async ({ page }) => {
    await seedAuthStorage(page);
    await mockAuthenticatedApi(page, { projects: [] });

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: /AI-native DevSecOps/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connect repository" })).toBeVisible();
  });

  test("projects list loads with mocked auth", async ({ page }) => {
    await seedAuthStorage(page);
    await mockAuthenticatedApi(page);

    await page.goto("/projects");

    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByText("Smoke Test Project")).toBeVisible();
  });
});
