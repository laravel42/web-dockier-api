import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * Switching projects while the first is still loading: the slow response for the
 * old project used to land last and replace the page with the wrong project.
 */
const params = vi.hoisted(() => ({ current: { projectId: "A" } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useParams: () => params.current,
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/projects/x", state: null }),
}));

const get = vi.hoisted(() => vi.fn());
vi.mock("@/services/api", () => ({ projectsApi: { get } }));

const { useProjectData } = await import("../pages/ProjectDetail/hooks/useProjectData");

describe("useProjectData project switching", () => {
  it("ignores the old project's late response", async () => {
    const resolvers: Record<string, (p: unknown) => void> = {};
    get.mockImplementation((id: string) =>
      id === "A" ? new Promise((res) => { resolvers.A = res; }) : Promise.resolve({ id: "B", name: "B" }),
    );

    const { result, rerender } = renderHook(() => useProjectData());
    params.current = { projectId: "B" };
    rerender();
    await waitFor(() => expect(result.current.project?.id).toBe("B"));

    resolvers.A({ id: "A", name: "A" });
    await new Promise((r) => setTimeout(r, 20));

    expect(result.current.project?.id).toBe("B");
    expect(result.current.loading).toBe(false);
  });
});
