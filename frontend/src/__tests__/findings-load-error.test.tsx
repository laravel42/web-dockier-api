import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Finding } from "@/types";

/**
 * A failed findings request left counts null and the list empty, which on a
 * completed scan rendered "No security findings — looking clean." The error is
 * now shown with a retry, and never as a clean result.
 */
vi.mock("@/context/PermissionsContext", () => ({ usePermissions: () => ({ has: () => true }) }));
vi.mock("@/hooks/useInfiniteScroll", () => ({ useInfiniteScroll: () => ({ current: null }) }));

const FindingsList = (await import("../pages/ScanDetail/sections/FindingsList")).default;

const base: ComponentProps<typeof FindingsList> = {
  findings: [],
  findingCounts: null,
  findingsLoading: false,
  findingsLoadingMore: false,
  hasMoreFindings: false,
  onLoadMore: vi.fn(),
  findingsError: "",
  onRetry: vi.fn(),
  scanCompleted: true,
  severityFilter: "",
  providerFilter: "",
  skippedEngines: [],
  fileContents: {},
  pmIntegrations: [],
  hasConnectionId: false,
  mrCreating: null,
  onCreateIssue: vi.fn(),
  onCreateMR: vi.fn(),
};

describe("findings load errors", () => {
  it("shows the error and a retry instead of a clean result", () => {
    const onRetry = vi.fn();
    render(<FindingsList {...base} findingsError="Failed to load findings" onRetry={onRetry} />);
    expect(screen.queryByText(/looking clean/i)).toBeNull();
    expect(screen.getByText("Failed to load findings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded rows when the next page fails, and retries that page", () => {
    const onLoadMore = vi.fn();
    const finding = { id: "f1", scanId: "s", ruleId: "r", severity: "error", message: "Hardcoded secret", filePath: "a.ts", startLine: 1, endLine: 1, snippet: "", provider: "semgrep" } as unknown as Finding;
    render(<FindingsList {...base} findings={[finding]} findingCounts={{ total: 2 } as never} findingsError="Failed to load findings" onLoadMore={onLoadMore} />);
    expect(screen.getByText("a.ts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("still says clean when the load succeeded with nothing", () => {
    render(<FindingsList {...base} findingCounts={{ total: 0 } as never} />);
    expect(screen.getByText(/looking clean/i)).toBeTruthy();
  });
});
