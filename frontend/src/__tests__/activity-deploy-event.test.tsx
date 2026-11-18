import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Project } from "@/types";

/**
 * Deploys now appear in Activity. Their detail is the deployment's log, so the
 * event links there; it used to say "Deploying pushed code" for every deploy,
 * whatever started it, above a raw JSON of its metadata.
 */
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => true, loading: false }),
}));
vi.mock("@/services/observe", () => ({
  observeApi: {
    listActivity: vi.fn(async () => ({
      activity: [{
        id: "a1", projectId: "p1", userId: "u1", actorName: "Oscar", eventType: "deploy_failed",
        description: "Build failed for acme/app (main)", metadata: { deployId: "dep-1" }, createdAt: new Date().toISOString(),
      }],
      pagination: { total: 1, limit: 50, offset: 0 },
    })),
    listHeartbeats: vi.fn(),
    getLog: vi.fn(),
  },
}));
vi.mock("@/services/commands", () => ({ commandsApi: { get: vi.fn() } }));

const ProjectObserveTab = (await import("../pages/ProjectDetail/sections/ProjectObserveTab")).default;

describe("a deploy event in Activity", () => {
  it("names what happened and links to the deployment", async () => {
    render(<MemoryRouter initialEntries={["/?section=activity"]}><ProjectObserveTab project={{ id: "p1" } as Project} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Build failed for acme\/app/ }));
    expect(screen.getByText("Deployment failed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View the deployment and its log" }).getAttribute("href")).toBe("/deploy/dep-1");
  });
});
