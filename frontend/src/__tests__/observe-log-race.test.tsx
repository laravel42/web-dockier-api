import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/types";

/**
 * Each log read is an SSH round-trip of seconds. Switching log type while the
 * previous read was still in flight showed the slower, older log under the new label.
 */
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => false, loading: false }),
}));

const getLog = vi.hoisted(() => vi.fn());
vi.mock("@/services/observe", () => ({
  observeApi: { getLog, listHeartbeats: vi.fn(), listActivity: vi.fn() },
}));

const ProjectObserveTab = (await import("../pages/ProjectDetail/sections/ProjectObserveTab")).default;

describe("Observe logs", () => {
  it("ignores a read that finished after the user picked another log", async () => {
    let resolveSite!: (v: object) => void;
    getLog.mockImplementation((_id: string, type: string) =>
      type === "site"
        ? new Promise((r) => { resolveSite = r; })
        : Promise.resolve({ type, content: "nginx line", size: 10, lastModified: null }),
    );

    render(
      <MemoryRouter initialEntries={["/?section=logs"]}>
        <ProjectObserveTab project={{ id: "p1" } as Project} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Log to view"), { target: { value: "nginx_access" } });
    expect(await screen.findByText("nginx line")).toBeTruthy();

    await act(async () => resolveSite({ type: "site", content: "stale site line", size: 15, lastModified: null }));
    expect(screen.queryByText("stale site line")).toBeNull();
    expect(screen.getByText("nginx line")).toBeTruthy();
  });
});
