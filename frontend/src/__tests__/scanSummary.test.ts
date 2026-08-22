import { describe, expect, it } from "vitest";
import { scanFindingSeverityDotClass } from "@/utils/scanSummary";

describe("scanFindingSeverityDotClass", () => {
  it("is red when the scan has errors", () => {
    expect(scanFindingSeverityDotClass({ errors: 2, warnings: 4 })).toBe("bg-danger-500");
  });

  it("is yellow when the scan has warnings and no errors", () => {
    expect(scanFindingSeverityDotClass({ errors: 0, warnings: 3 })).toBe("bg-warning-500");
  });

  it("is green when there are no errors or warnings", () => {
    expect(scanFindingSeverityDotClass({ errors: 0, warnings: 0 })).toBe("bg-success-500");
    expect(scanFindingSeverityDotClass(null)).toBe("bg-success-500");
  });
});
