/**
 * Two things that are invisible until a tenant grows, and so have to be pinned
 * by a test rather than by looking at the page:
 *
 *  - The deploy panel must ask the server for ONE project's deployments.
 *    `GET /deploy/deployments` defaults to the tenant's newest 20
 *    (`paginationQuerySchema`), so filtering client-side made an older
 *    project look like it had never shipped — which also hid the whole
 *    Runtime cluster from the nav.
 *  - Deleting a project must invalidate the repo-level caches, which are keyed
 *    by `owner/repo` and therefore outlive the project.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Project } from "@/types";

const listDeployments = vi.fn();
const listScans = vi.fn();
const invalidateStackCache = vi.fn();
const invalidateStatsCache = vi.fn();
const invalidateAnalysisCache = vi.fn();
const deleteProject = vi.fn();

vi.mock("@/services/api", () => ({
  deployApi: {
    listProviders: () => Promise.resolve({ providers: [] }),
    listDeployments: (params?: unknown) => listDeployments(params),
  },
  codeAnalysisApi: { listScans: (id: string) => listScans(id) },
  gitApi: {
    invalidateStackCache: (key: string) => Promise.resolve(invalidateStackCache(key)),
    invalidateStatsCache: (key: string) => Promise.resolve(invalidateStatsCache(key)),
    invalidateAnalysisCache: (key: string) => Promise.resolve(invalidateAnalysisCache(key)),
  },
}));

vi.mock("@/services/projects", () => ({
  projectsApi: { delete: (id: string) => deleteProject(id) },
}));

vi.mock("@/context/useToast", () => ({
  useToast: () => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

const { useProjectDeploys } = await import("@/pages/ProjectDetail/hooks/useProjectDeploys");
const { useProjectDelete } = await import("@/pages/ProjectDetail/hooks/useProjectDelete");

const project = { id: "p-1", repository: "https://github.com/acme/web" } as Project;

beforeEach(() => {
  vi.clearAllMocks();
  listDeployments.mockResolvedValue({ deployments: [] });
  listScans.mockResolvedValue({ scans: [] });
  deleteProject.mockResolvedValue(undefined);
});

describe("useProjectDeploys", () => {
  it("asks the server for this project's deployments, not the tenant's", async () => {
    renderHook(() => useProjectDeploys(project, "p-1"));
    await waitFor(() => expect(listDeployments).toHaveBeenCalled());
    expect(listDeployments).toHaveBeenCalledWith({ projectId: "p-1", limit: 5 });
  });

  it("marks the fetch as settled so the panel can tell loading from empty", async () => {
    const { result } = renderHook(() => useProjectDeploys(project, "p-1"));
    expect(result.current.deploysLoaded).toBe(false);
    await waitFor(() => expect(result.current.deploysLoaded).toBe(true));
    expect(result.current.recentDeploys).toEqual([]);
  });
});

describe("useProjectDelete", () => {
  it("invalidates the repo-keyed caches before deleting", async () => {
    const { result } = renderHook(() => useProjectDelete("p-1", "Web", project.repository));
    act(() => result.current.setConfirmName("Web"));
    await act(async () => void (await result.current.handleDelete()));

    expect(invalidateStackCache).toHaveBeenCalledWith("acme/web");
    expect(invalidateStatsCache).toHaveBeenCalledWith("acme/web");
    expect(invalidateAnalysisCache).toHaveBeenCalledWith("acme/web");
    expect(deleteProject).toHaveBeenCalledWith("p-1");
  });

  it("still deletes when cache invalidation blows up", async () => {
    invalidateStackCache.mockImplementation(() => { throw new Error("cache service down"); });

    const { result } = renderHook(() => useProjectDelete("p-1", "Web", project.repository));
    act(() => result.current.setConfirmName("Web"));
    await act(async () => void (await result.current.handleDelete()));

    expect(deleteProject).toHaveBeenCalledWith("p-1");
  });

  it("deletes a project with no repository at all", async () => {
    const { result } = renderHook(() => useProjectDelete("p-1", "Web"));
    act(() => result.current.setConfirmName("Web"));
    await act(async () => void (await result.current.handleDelete()));

    expect(invalidateStackCache).not.toHaveBeenCalled();
    expect(deleteProject).toHaveBeenCalledWith("p-1");
  });

  it("does nothing until the typed name matches", async () => {
    const { result } = renderHook(() => useProjectDelete("p-1", "Web", project.repository));
    await act(async () => void (await result.current.handleDelete()));
    expect(deleteProject).not.toHaveBeenCalled();
    expect(invalidateStackCache).not.toHaveBeenCalled();
  });
});
