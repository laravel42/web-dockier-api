import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Project } from "@/types";

/**
 * A scheduled job's heartbeat is managed from the job, and the backend refuses to
 * delete it from Observe. The menu says who manages it instead of offering a
 * Delete that is only refused after the confirmation.
 */
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => true, loading: false }),
}));

const heartbeat = (id: string, scheduledJob: { id: string; name: string } | null) => ({
  id, projectId: "p1", name: id, frequency: "hourly", gracePeriod: "after_5_minutes", status: "healthy",
  lastPingedAt: null, pingUrl: `https://api/heartbeats/${id}/ping`, createdAt: "", updatedAt: "", scheduledJob,
});
vi.mock("@/services/observe", () => ({
  observeApi: {
    listHeartbeats: vi.fn(async () => ({
      heartbeats: [heartbeat("job-beat", { id: "j1", name: "Backups" }), heartbeat("manual-beat", null)],
    })),
    getLog: vi.fn(),
    listActivity: vi.fn(),
  },
}));

const ProjectObserveTab = (await import("../pages/ProjectDetail/sections/ProjectObserveTab")).default;

/** Radix opens its menu on a keyboard Enter; jsdom has no pointer capture for the mouse path. */
async function openMenu(name: string) {
  const trigger = await screen.findByRole("button", { name: `Actions for ${name}` });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

describe("heartbeat actions", () => {
  it("names the managing job instead of offering Delete", async () => {
    render(<MemoryRouter initialEntries={["/?section=heartbeats"]}><ProjectObserveTab project={{ id: "p1" } as Project} /></MemoryRouter>);
    const menu = await openMenu("job-beat");
    expect(within(menu).queryByRole("menuitem", { name: /Delete/ })).toBeNull();
    expect(within(menu).getByText(/Managed by the scheduled job "Backups"/)).toBeTruthy();
  });

  it("still offers Delete for a heartbeat created in Observe", async () => {
    render(<MemoryRouter initialEntries={["/?section=heartbeats"]}><ProjectObserveTab project={{ id: "p1" } as Project} /></MemoryRouter>);
    const menu = await openMenu("manual-beat");
    expect(within(menu).getByRole("menuitem", { name: /Delete/ })).toBeTruthy();
  });
});
