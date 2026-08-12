import { test, expect, type Page } from "@playwright/test";
import { mockAuthenticatedApi, seedAuthStorage } from "./fixtures/mock-api";

/**
 * AIL G2 — browser evidence.
 *
 * Seventeen of the detector's rules only run against a rendered page, and had
 * never run against this product. These cover the ones that matter most on
 * Project Detail, at the three widths the task names.
 *
 * Two of them close gaps that static analysis genuinely could not:
 *  - F3 claimed `aria-orientation` follows the rendered axis. Only a browser can
 *    say whether the sidebar is a column at 1440 and a strip at 375.
 *  - F2 claimed moving the focus rule into `@layer base` stopped controls
 *    rendering two focus indicators. Only a browser resolves the cascade.
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const PROJECT_URL = "/projects/proj-e2e-1";

async function openProjectDetail(page: Page) {
  await seedAuthStorage(page);
  await mockAuthenticatedApi(page);
  await page.goto(PROJECT_URL);
  await expect(page.getByRole("tablist", { name: "Project sections" })).toBeVisible();
}

for (const vp of VIEWPORTS) {
  test.describe(`Project Detail @ ${vp.width}px (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("the page does not scroll horizontally", async ({ page }) => {
      await openProjectDetail(page);
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      // 1px of tolerance for sub-pixel rounding on fractional device widths.
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test("announced tab orientation matches the rendered axis", async ({ page }) => {
      await openProjectDetail(page);
      const tablist = page.getByRole("tablist", { name: "Project sections" });

      const tabs = tablist.getByRole("tab");
      const first = await tabs.first().boundingBox();
      const second = await tabs.nth(1).boundingBox();
      expect(first, "first tab must be laid out").not.toBeNull();
      expect(second, "second tab must be laid out").not.toBeNull();

      // Stacked => vertical; side by side => horizontal.
      const renderedVertical = second!.y > first!.y + first!.height / 2;
      const announced = await tablist.getAttribute("aria-orientation");
      expect(announced).toBe(renderedVertical ? "vertical" : "horizontal");
    });

    test("every tab is a usable tap target", async ({ page }) => {
      await openProjectDetail(page);
      const tabs = page.getByRole("tablist", { name: "Project sections" }).getByRole("tab");
      const count = await tabs.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const box = await tabs.nth(i).boundingBox();
        if (!box) continue; // scrolled out of the strip; not a target right now
        expect(box.height, `tab ${i} height`).toBeGreaterThanOrEqual(24);
      }
    });

    test("a focused tab shows exactly one focus indicator", async ({ page }) => {
      await openProjectDetail(page);
      const tab = page.getByRole("tablist", { name: "Project sections" }).getByRole("tab").first();
      await tab.focus();

      const style = await tab.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
      });

      const hasOutline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const hasRing = style.boxShadow !== "none" && style.boxShadow !== "";
      // F2: the base rule supplies an outline for controls with no ring of their
      // own. What must never happen is both at once.
      expect(hasOutline || hasRing, "focused tab must show an indicator").toBe(true);
      expect(hasOutline && hasRing, "focused tab must not double up").toBe(false);
    });
  });
}

test.describe("Project Detail @ 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the nav is grouped, and group headings are not tab stops", async ({ page }) => {
    await openProjectDetail(page);
    const tablist = page.getByRole("tablist", { name: "Project sections" });

    // C2: clusters are visible on desktop…
    await expect(tablist.getByText("Understand", { exact: true })).toBeVisible();
    await expect(tablist.getByText("Risk", { exact: true })).toBeVisible();

    // …but aria-hidden, so the tablist still owns only its tabs.
    const roles = await tablist.evaluate((el) =>
      Array.from(el.querySelectorAll("*"))
        .map((n) => n.getAttribute("role"))
        .filter((r): r is string => r !== null),
    );
    expect(new Set(roles)).toEqual(new Set(["presentation", "tab"]));
  });

  test("the Runtime cluster is absent until the project has shipped", async ({ page }) => {
    // The mock returns no deployments, so this project has never shipped.
    await openProjectDetail(page);
    const tablist = page.getByRole("tablist", { name: "Project sections" });
    for (const label of ["Processes", "Network", "Domains", "Observe"]) {
      await expect(tablist.getByRole("tab", { name: label })).toHaveCount(0);
    }
    await expect(tablist.getByRole("tab", { name: "Overview" })).toBeVisible();
  });

  test("arrow keys move between tabs across a group boundary", async ({ page }) => {
    await openProjectDetail(page);
    const tablist = page.getByRole("tablist", { name: "Project sections" });
    await tablist.getByRole("tab").first().focus();

    await page.keyboard.press("ArrowDown");
    await expect(tablist.getByRole("tab", { selected: true })).toHaveAccessibleName("Activity");

    // Understand -> Risk. Auto-retrying assertion: a bare textContent() read
    // races the re-render that follows the URL change.
    await page.keyboard.press("ArrowDown");
    await expect(tablist.getByRole("tab", { selected: true })).toHaveAccessibleName("Security");
    await expect(tablist.getByRole("tab", { name: "Security" })).toBeFocused();
  });
});
