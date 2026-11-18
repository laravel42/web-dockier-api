import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { scanStatusDot } from "@/utils/scanSummary";
import ScanStatusDot from "@/components/ScanStatusDot";
import type { ScanSummary } from "@/types";

/**
 * Five list views each built a scan's status dot with their own ternary: a
 * pending scan was blue in two and grey in three, and none said what the color
 * meant, so status was color-only. One helper now gives the color and the words.
 */
const s = (errors: number, warnings: number, extra: Partial<ScanSummary> = {}) =>
  ({ totalFindings: errors + warnings, errors, warnings, infos: 0, filesScanned: 1, filesInRepo: 1, ...extra }) as ScanSummary;

describe("scanStatusDot", () => {
  it.each([
    ["completed", s(2, 1), "bg-danger-500", "Completed with errors"],
    ["completed", s(0, 3), "bg-warning-500", "Completed with warnings"],
    ["completed", s(0, 0), "bg-success-500", "Completed, no errors or warnings"],
    ["failed", s(0, 0), "bg-danger-500", "Failed"],
    ["failed", s(0, 0, { cancelled: true }), "bg-warning-500", "Cancelled"],
    ["running", s(0, 0), "bg-primary-500", "Running"],
    ["pending", s(0, 0), "bg-secondary-400", "Pending"],
  ])("%s → %s", (status, summary, className, label) => {
    expect(scanStatusDot(status, summary)).toEqual({ className, label });
  });

  it("colors a completed scan by the findings it is given, not the newest scan's", () => {
    expect(scanStatusDot("completed", s(0, 0), s(1, 0)).label).toBe("Completed with errors");
  });

  it("renders the meaning as accessible text and a tooltip", () => {
    render(<ScanStatusDot status="failed" summary={s(0, 0, { cancelled: true })} />);
    const dot = screen.getByRole("img", { name: "Cancelled" });
    expect(dot.getAttribute("title")).toBe("Cancelled");
  });
});
