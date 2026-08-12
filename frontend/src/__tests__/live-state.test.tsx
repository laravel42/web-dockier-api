import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecentDeploys from "../pages/ProjectDetail/sections/RecentDeploys";
import RecentScans from "../pages/ProjectDetail/sections/RecentScans";
import { isDeployLive, isScanLive, WATCH_INTERVAL_MS } from "../pages/ProjectDetail/hooks/useProjectDeploys";
import type { Deployment, Provider } from "@/types";
import type { Scan } from "@/types/scan";

/**
 * The bug: `.catch(() => {})` left `recentDeploys` empty, and the panel reported
 * that as "This project hasn't been deployed yet." A timed-out request told the
 * user something false about their own project.
 */

const deploy = (over: Partial<Deployment> = {}) =>
  ({
    id: "d1",
    projectId: "p1",
    status: "success",
    branch: "main",
    commitHash: "abc1234",
    createdAt: new Date(2026, 0, 1).toISOString(),
    providerId: "pr1",
    ...over,
  }) as Deployment;

const scan = (over: Partial<Scan> = {}) =>
  ({
    id: "s1",
    status: "completed",
    branch: "main",
    commitSha: "abc1234",
    createdAt: new Date(2026, 0, 1).toISOString(),
    summary: { errors: 0, warnings: 0, infos: 0 },
    ...over,
  }) as Scan;

const providers: Provider[] = [{ id: "pr1", provider: "aws", label: "AWS" } as Provider];

describe("RecentDeploys — failed vs never happened", () => {
  it("renders the error state, not the empty state, when the fetch failed", () => {
    render(
      <RecentDeploys deploys={[]} allProviders={providers} navigate={vi.fn()} error="Network request failed" />,
    );
    expect(screen.getByText("Couldn't load deploys")).toBeInTheDocument();
    expect(screen.getByText("Network request failed")).toBeInTheDocument();
    // The false claim must be nowhere on screen.
    expect(screen.queryByText(/hasn't been deployed yet/)).not.toBeInTheDocument();
  });

  it("offers Retry from the error state", async () => {
    const onRetry = vi.fn();
    render(
      <RecentDeploys deploys={[]} allProviders={providers} navigate={vi.fn()} error="boom" onRetry={onRetry} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("still shows the empty state when the fetch genuinely returned nothing", () => {
    render(<RecentDeploys deploys={[]} allProviders={providers} navigate={vi.fn()} />);
    expect(screen.getByText(/hasn't been deployed yet/)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load deploys")).not.toBeInTheDocument();
  });

  it("gives the empty state a deploy action (D3) instead of pointing off-screen", () => {
    const onDeploy = vi.fn();
    render(
      <RecentDeploys deploys={[]} allProviders={providers} navigate={vi.fn()} onDeploy={onDeploy} />,
    );
    // "Use Deploy above" is useless once the user has scrolled to this panel.
    expect(screen.queryByText(/Use Deploy above/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deploy this project" })).toBeInTheDocument();
  });

  it("prefers the error state even if some deploys are already on screen", () => {
    render(
      <RecentDeploys deploys={[deploy()]} allProviders={providers} navigate={vi.fn()} error="stale" />,
    );
    expect(screen.getByText("Couldn't load deploys")).toBeInTheDocument();
  });
});

describe("RecentScans — failed vs never happened", () => {
  it("renders the error state, not the empty state, when the fetch failed", () => {
    render(<RecentScans scans={[]} navigate={vi.fn()} projectId="p1" error="503 Service Unavailable" />);
    expect(screen.getByText("Couldn't load scans")).toBeInTheDocument();
    expect(screen.queryByText(/No security scans have been run/)).not.toBeInTheDocument();
  });

  it("still shows the empty state with its CTA when there are genuinely no scans", () => {
    render(<RecentScans scans={[]} navigate={vi.fn()} projectId="p1" />);
    expect(screen.getByText(/No security scans have been run/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run first scan" })).toBeInTheDocument();
  });

  it("offers Retry from the error state", async () => {
    const onRetry = vi.fn();
    render(<RecentScans scans={[]} navigate={vi.fn()} projectId="p1" error="boom" onRetry={onRetry} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders scans normally when there is no error", () => {
    render(<RecentScans scans={[scan()]} navigate={vi.fn()} projectId="p1" />);
    expect(screen.queryByText("Couldn't load scans")).not.toBeInTheDocument();
  });
});

describe("live-state detection", () => {
  it("treats every settled deploy status as terminal", () => {
    for (const status of ["success", "failed", "destroyed", "cancelled"] as const) {
      expect(isDeployLive(deploy({ status })), status).toBe(false);
    }
  });

  it("treats in-flight deploy statuses as live", () => {
    for (const status of ["pending", "building", "deploying"] as const) {
      expect(isDeployLive(deploy({ status })), status).toBe(true);
    }
  });

  it("treats settled and in-flight scans correctly", () => {
    expect(isScanLive(scan({ status: "completed" as Scan["status"] }))).toBe(false);
    expect(isScanLive(scan({ status: "failed" as Scan["status"] }))).toBe(false);
    expect(isScanLive(scan({ status: "running" as Scan["status"] }))).toBe(true);
    expect(isScanLive(scan({ status: "pending" as Scan["status"] }))).toBe(true);
  });

  it("watches at the cadence the scan controller already uses, not a new one", () => {
    // Same class of work — a long server job someone is waiting on. The Commands
    // tab's 3s is for seconds-long commands and is deliberately not reused here.
    expect(WATCH_INTERVAL_MS).toBe(4_000);
  });
});
