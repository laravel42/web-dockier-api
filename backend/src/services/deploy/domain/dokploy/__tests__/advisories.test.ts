import { describe, expect, it } from "vitest";
import {
  createAdvisoryCollector,
  renderAdvisories,
  missingStartScriptAdvisory,
  injectedPortHostAdvisory,
  migrationsSkippedAdvisory,
  domainPortCorrectedAdvisory,
} from "../advisories.js";

describe("createAdvisoryCollector", () => {
  it("collects advisories in insertion order", () => {
    const c = createAdvisoryCollector();
    c.add(missingStartScriptAdvisory("node ./dist/server/entry.mjs", "astro"));
    c.add(injectedPortHostAdvisory(3000));
    expect(c.list().map((a) => a.code)).toEqual(["missing-start-script", "injected-port-host"]);
  });

  it("deduplicates by code (a fix reported from two places appears once)", () => {
    const c = createAdvisoryCollector();
    c.add(injectedPortHostAdvisory(3000));
    c.add(injectedPortHostAdvisory(3000));
    expect(c.list()).toHaveLength(1);
  });

  it("starts empty", () => {
    expect(createAdvisoryCollector().list()).toEqual([]);
  });
});

describe("renderAdvisories", () => {
  it("returns no lines when there is nothing to report", () => {
    expect(renderAdvisories([])).toEqual([]);
  });

  it("renders a numbered summary with recommendations", () => {
    const lines = renderAdvisories([
      missingStartScriptAdvisory("node ./dist/server/entry.mjs", "astro"),
      injectedPortHostAdvisory(3000),
    ]);
    const text = lines.join("\n");

    // Makes clear the deploy worked, and that these are informational.
    expect(text).toMatch(/deployment succeeded/i);
    expect(text).toMatch(/2 automatic adjustments/);
    // Numbered items with actionable recommendations.
    expect(text).toContain("1. ");
    expect(text).toContain("2. ");
    expect(text).toContain('Add "start": "node ./dist/server/entry.mjs"');
    expect(text).toMatch(/process\.env\.PORT/);
  });

  it("uses singular wording for a single advisory", () => {
    const text = renderAdvisories([migrationsSkippedAdvisory()]).join("\n");
    expect(text).toMatch(/1 automatic adjustment\b/);
  });

  it("omits the arrow line for an advisory with no recommendation", () => {
    const lines = renderAdvisories([domainPortCorrectedAdvisory(80, 3000)]);
    expect(lines.some((l) => l.trim().startsWith("→"))).toBe(false);
    expect(lines.join("\n")).toContain("corrected it to 3000");
  });

  it("names the framework when known", () => {
    const text = renderAdvisories([missingStartScriptAdvisory("node x.mjs", "astro")]).join("\n");
    expect(text).toContain("astro app");
  });
});
