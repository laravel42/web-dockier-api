import { describe, expect, it, vi } from "vitest";

/**
 * The deploy detail page's project fallback used to search only the first page
 * of projects (50), so a deploy of a later project rendered with no project.
 */
const list = vi.hoisted(() => vi.fn());
vi.mock("@/services/api", () => ({ projectsApi: { list }, deployApi: {}, gitApi: {} }));

const { findProject } = await import("../pages/DeployDetail/useDeployDetail");

const projects = Array.from({ length: 230 }, (_, i) => ({ id: `p${i}`, repository: `o/r${i}` }));
list.mockImplementation(({ limit, offset }: { limit: number; offset: number }) =>
  Promise.resolve({ projects: projects.slice(offset, offset + limit), pagination: { total: projects.length, limit, offset } }),
);

describe("findProject", () => {
  it("finds a project past the first page and stops paging once found", async () => {
    list.mockClear();
    expect((await findProject((p) => p.id === "p150"))?.id).toBe("p150");
    expect(list.mock.calls.map((c) => c[0].offset)).toEqual([0, 100]);
  });

  it("returns undefined after the last page, without paging forever", async () => {
    list.mockClear();
    expect(await findProject((p) => p.id === "missing")).toBeUndefined();
    expect(list.mock.calls.map((c) => c[0].offset)).toEqual([0, 100, 200]);
  });
});
