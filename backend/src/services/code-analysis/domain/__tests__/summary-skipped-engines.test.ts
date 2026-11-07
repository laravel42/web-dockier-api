import { describe, expect, it } from "vitest";
import { parseSummary } from "../mappers.js";

/**
 * summarySchema is a plain z.object, which silently drops keys it does not
 * list. A summary written with skippedEngines but read through a schema that
 * lacks the key looks identical to a scan where every engine ran.
 */
describe("parseSummary — skippedEngines", () => {
  const base = { totalFindings: 3, errors: 1, warnings: 2, infos: 0, filesScanned: 10, filesInRepo: 10 };

  it("keeps the engines that did not run, with their reason", () => {
    const skippedEngines = [{ engine: "sonarqube", reason: "sonar-scanner failed: Connect to localhost:9100 failed" }];
    expect(parseSummary({ ...base, skippedEngines }).skippedEngines).toEqual(skippedEngines);
  });

  it("leaves it absent for a scan where every engine ran", () => {
    expect(parseSummary(base).skippedEngines).toBeUndefined();
  });
});
