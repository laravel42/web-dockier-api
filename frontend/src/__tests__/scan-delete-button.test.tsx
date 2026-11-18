import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Delete sits with the scan's other actions in the sidebar. It needs scan:manage
 * (what the DELETE route checks), and is hidden while the scan runs, because the
 * backend refuses that: a running scan has to be cancelled first.
 */
const perms = vi.hoisted(() => ({ granted: new Set<string>(), isOwner: false }));
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: (p: string) => perms.granted.has(p), isOwner: perms.isOwner, loading: false }),
}));

const ScanSidebar = (await import("../pages/ScanDetail/sections/ScanSidebar")).default;

const base = {
  scanId: "s1",
  allScans: [],
  allScansLoading: false,
  scanError: "",
  hasConnectionId: true,
  onRunScan: vi.fn(),
  onSelectScan: vi.fn(),
};

beforeEach(() => {
  perms.granted = new Set(["scan:run", "scan:manage"]);
  perms.isOwner = false;
});

describe("Delete scan button", () => {
  it("opens the confirmation for a finished scan", () => {
    const onDeleteScan = vi.fn();
    render(<ScanSidebar {...base} onDeleteScan={onDeleteScan} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete scan" }));
    expect(onDeleteScan).toHaveBeenCalledTimes(1);
  });

  it("is hidden while the scan runs", () => {
    render(<ScanSidebar {...base} scanRunning onCancelScan={vi.fn()} onDeleteScan={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete scan" })).toBeNull();
  });

  it("is hidden without scan:manage, even for someone who can run scans", () => {
    perms.granted = new Set(["scan:run"]);
    render(<ScanSidebar {...base} onDeleteScan={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete scan" })).toBeNull();
  });
});
