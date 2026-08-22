import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  DeployInfraStatus,
  DeployStatusLink,
  InfraStatusLink,
} from "../pages/ProjectDetail/sections/ProjectPostureLine";
import {
  deployClause,
  findingsClause,
  infraClause,
} from "../pages/ProjectDetail/postureClauses";
import type { Deployment, Project } from "@/types";
import type { Scan } from "@/types/scan";

/**
 * The line a user reads before deciding not to look any further. Its one hard
 * rule (docs/delivery/project-detail-ia.md): it degrades honestly. Asserting
 * "No critical findings" from a failed request would be the worst thing it
 * could do, so most of these cover exactly that.
 */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const deploy = (over: Partial<Deployment> = {}) =>
  ({ id: "d1", status: "success", createdAt: hoursAgo(2), deployStrategy: "managed", ...over }) as Deployment;
const scan = (errors: number) =>
  ({ id: "s1", status: "completed", summary: { errors, warnings: 0, infos: 0 } }) as Scan;
const project = (over: Partial<Project> = {}) =>
  ({ id: "p1", name: "acme", infraState: "live", createdAt: hoursAgo(500), ...over }) as Project;

describe("deploy clause", () => {
  it("says the status is unavailable rather than claiming never deployed", () => {
    expect(deployClause([], "Network error", true)).toMatchObject({
      text: "Deploy status unavailable",
      tone: "warning",
    });
  });

  it("reports an error even when the load flag never flipped", () => {
    expect(deployClause([], "boom", false)?.text).toBe("Deploy status unavailable");
  });

  it("renders nothing until the first response settles", () => {
    // Silence is honest; "Never deployed" during load is not.
    expect(deployClause([], "", false)).toBeNull();
  });

  it("says never deployed only when the fetch genuinely returned nothing", () => {
    expect(deployClause([], "", true)).toMatchObject({ text: "Never deployed", tone: "neutral" });
  });

  it("marks a failed deploy as danger", () => {
    expect(deployClause([deploy({ status: "failed" })], "", true)).toMatchObject({ tone: "danger" });
  });

  it("links to the tab that resolves it", () => {
    expect(deployClause([deploy()], "", true)?.tab).toBe("deployments");
  });
});

describe("findings clause", () => {
  it("never claims safety from an error", () => {
    const clause = findingsClause([], "503", true);
    expect(clause?.text).toBe("Scan status unavailable");
    expect(clause?.text).not.toContain("No critical findings");
  });

  it("renders nothing until the first response settles", () => {
    expect(findingsClause([], "", false)).toBeNull();
  });

  it("distinguishes never-scanned from clean", () => {
    expect(findingsClause([], "", true)?.text).toBe("Not scanned yet");
    expect(findingsClause([scan(0)], "", true)?.text).toBe("No critical findings");
  });

  it("counts criticals and pluralises", () => {
    expect(findingsClause([scan(1)], "", true)).toMatchObject({ text: "1 critical finding", tone: "danger" });
    expect(findingsClause([scan(3)], "", true)).toMatchObject({ text: "3 critical findings", tone: "danger" });
  });
});

describe("infra clause", () => {
  it("names the strategy from the last successful deploy", () => {
    expect(infraClause(project(), [deploy({ deployStrategy: "managed" })]).text).toBe("Running on ECS Fargate");
  });

  it("ignores a failed deploy when naming the strategy", () => {
    const deploys = [deploy({ status: "failed", deployStrategy: "vps" }), deploy({ deployStrategy: "managed" })];
    expect(infraClause(project(), deploys).text).toBe("Running on ECS Fargate");
  });

  it("falls back to a generic noun rather than rendering undefined", () => {
    expect(infraClause(project(), []).text).toBe("Running on infrastructure");
  });

  it("reports torn-down and absent infrastructure distinctly", () => {
    expect(infraClause(project({ infraState: "torn_down" }), []).text).toBe("Infrastructure torn down");
    expect(infraClause(project({ infraState: "none" }), []).text).toBe("No infrastructure");
  });
});

describe("rendered line", () => {
  const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it("renders deploy and infra as links to their tabs", () => {
    at(<DeployInfraStatus project={project()} deploys={[deploy()]} loaded />);
    expect(screen.getByRole("link", { name: /^Deployed/ })).toHaveAttribute("href", "/?tab=deployments");
    expect(screen.getByRole("link", { name: "Running on ECS Fargate" })).toHaveAttribute("href", "/?tab=settings");
  });

  it("shows the failure, not a reassurance, when the deploy fetch failed", () => {
    at(<DeployStatusLink deploys={[]} error="offline" loaded />);
    expect(screen.getByText("Deploy status unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Never deployed")).not.toBeInTheDocument();
  });

  it("still shows infra state while the two fetches are in flight", () => {
    at(<InfraStatusLink project={project()} deploys={[]} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Running on/ })).toBeInTheDocument();
  });
});
