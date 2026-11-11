import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ScanSidebar from "../pages/ScanDetail/sections/ScanSidebar";
import ScanHeader from "../pages/ScanDetail/sections/ScanHeader";
import { applyMessage } from "../context/scanProgressState";
import { effectiveScanStatus, failedScanDotClass } from "../utils/scanSummary";
import type { Scan } from "@/types";

let canRun = true;
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => canRun, isOwner: false, loading: false }),
}));

/**
 * Cancelling a running scan, and showing one that was.
 *
 * The request only records intent; the scan stops a few seconds later when the
 * backend notices. So the button has to turn into "Cancelling…" instead of
 * inviting a second click, and a cancelled scan has to read as the user's own
 * decision rather than as a red error.
 */
function renderSidebar(overrides: Partial<React.ComponentProps<typeof ScanSidebar>> = {}) {
  const onCancelScan = vi.fn();
  render(
    <ScanSidebar
      scanId="s1"
      allScans={[]}
      allScansLoading={false}
      scanError=""
      hasConnectionId
      onRunScan={vi.fn()}
      onSelectScan={vi.fn()}
      scanRunning
      cancelling={false}
      onCancelScan={onCancelScan}
      {...overrides}
    />,
  );
  return { onCancelScan };
}

describe("cancel button", () => {
  it("is offered while a scan is running, and asks before doing anything", () => {
    const { onCancelScan } = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));

    // The page opens its confirmation from this; it is not the request itself.
    expect(onCancelScan).toHaveBeenCalledTimes(1);
  });

  it("is not offered when no scan is running", () => {
    renderSidebar({ scanRunning: false });
    expect(screen.queryByRole("button", { name: /cancel scan/i })).toBeNull();
  });

  it("is not offered to someone who cannot run scans", () => {
    canRun = false;
    try {
      renderSidebar();
      expect(screen.queryByRole("button", { name: /cancel scan/i })).toBeNull();
    } finally {
      canRun = true;
    }
  });

  it("turns into a disabled 'Cancelling…' once the request went through", () => {
    renderSidebar({ cancelling: true });

    const button = screen.getByRole("button", { name: /cancelling/i });
    expect(button).toBeDisabled();
  });
});

describe("a cancelled scan", () => {
  it("says it was cancelled, in plain text rather than as an error", () => {
    renderSidebar({ scanRunning: false, scanCancelled: true, scanError: "" });

    expect(screen.getByText(/this scan was cancelled/i)).toBeInTheDocument();
  });

  it("does not add that note to a scan that simply failed", () => {
    renderSidebar({ scanRunning: false, scanCancelled: false, scanError: "Failed to insert findings" });

    expect(screen.queryByText(/was cancelled/i)).toBeNull();
    expect(screen.getByText("Failed to insert findings")).toBeInTheDocument();
  });
});

/**
 * summaryFromRecord rebuilt the summary field by field, so anything it did not
 * list was dropped on the way from the WebSocket — a cancelled scan would have
 * looked like any other failure the moment the live message replaced the API's.
 */
describe("live status message", () => {
  const status = (summary: Record<string, unknown>) =>
    applyMessage(undefined, { type: "status", scanId: "s1", status: "failed", summary });

  it("carries the cancelled flag", () => {
    expect(status({ error: "Scan cancelled", cancelled: true }).summary?.cancelled).toBe(true);
  });

  it("carries the engines that did not run", () => {
    const skippedEngines = [{ engine: "sonarqube", reason: "could not be reached" }];
    expect(status({ skippedEngines }).summary?.skippedEngines).toEqual(skippedEngines);
  });

  it("carries a summary field this file does not know about", () => {
    // The list of fields used to be closed, so each new one (cancelled, then
    // skippedEngines) reached the page only after a reload.
    const summary = status({ totalFindings: 3, someFutureField: "x" }).summary as unknown as Record<string, unknown>;
    expect(summary.someFutureField).toBe("x");
  });

  it("leaves both keys absent otherwise, so a merge cannot erase the API's values", () => {
    const summary = status({ totalFindings: 3 }).summary!;
    expect("cancelled" in summary).toBe(false);
    expect("skippedEngines" in summary).toBe(false);
  });
});

/**
 * A cancelled scan is stored as `failed`, so every place that shows a status has
 * to look at `summary.cancelled` or a scan the user stopped reads as one that
 * broke: a red dot in the lists, "failed" in the header.
 */
describe("showing a cancelled scan", () => {
  const scan = (status: Scan["status"], cancelled?: boolean): Scan => ({
    id: `${status}-${cancelled}`,
    projectId: "p",
    repo: "a/b",
    branch: "main",
    status,
    summary: {
      totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0,
      ...(cancelled ? { cancelled: true } : {}),
    },
    commitSha: "",
    commitMessage: "",
    commitAuthor: "",
    commitDate: "",
    createdAt: "2026-11-07T00:00:00Z",
    updatedAt: "2026-11-07T00:00:00Z",
  });

  it("reads 'cancelled' only for a failed scan that was cancelled", () => {
    expect(effectiveScanStatus("failed", { cancelled: true })).toBe("cancelled");
    expect(effectiveScanStatus("failed", {})).toBe("failed");
    expect(effectiveScanStatus("failed", null)).toBe("failed");
    // A scan that completed keeps its status whatever the flag says.
    expect(effectiveScanStatus("completed", { cancelled: true })).toBe("completed");
  });

  it("colors the dot amber, not red", () => {
    expect(failedScanDotClass({ cancelled: true })).toBe("bg-warning-500");
    expect(failedScanDotClass({})).toBe("bg-danger-500");
  });

  it("gives the history dot of a cancelled scan the amber color and a broken one the red", () => {
    const { container } = render(
      <ScanSidebar
        scanId="x"
        allScans={[scan("failed", true), scan("failed", false)]}
        allScansLoading={false}
        scanError=""
        hasConnectionId
        onRunScan={vi.fn()}
        onSelectScan={vi.fn()}
      />,
    );

    const dots = Array.from(container.querySelectorAll("span.size-2.rounded-full"));
    expect(dots.map((d) => (d.className.includes("bg-warning-500") ? "amber" : d.className.includes("bg-danger-500") ? "red" : "other"))).toEqual([
      "amber",
      "red",
    ]);
  });

  it("labels the header 'cancelled' instead of 'failed'", () => {
    render(
      <ScanHeader scan={scan("failed", true)} project={null} liveStatus="failed" onBack={vi.fn()} onNavigateProject={vi.fn()} />,
    );
    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(screen.queryByText("failed")).toBeNull();
  });

  it("still labels a broken scan 'failed'", () => {
    render(
      <ScanHeader scan={scan("failed", false)} project={null} onBack={vi.fn()} onNavigateProject={vi.fn()} />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
