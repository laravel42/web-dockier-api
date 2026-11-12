import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Cancelling stops the status poll with cleanup(). A status request already in
 * flight used to land afterwards and write "deploying" back over "cancelled",
 * with no poll left to correct it: the wizard sat on a spinner until closed.
 */
const api = vi.hoisted(() => ({ createDeployment: vi.fn(), getDeployment: vi.fn(), update: vi.fn() }));
vi.mock("@/services/api", () => ({
  deployApi: { createDeployment: api.createDeployment, getDeployment: api.getDeployment },
  projectsApi: { update: api.update },
}));

const { useStandardDeploy } = await import("../components/DeployWizard/useStandardDeploy");

afterEach(() => vi.useRealTimers());

describe("useStandardDeploy", () => {
  it("drops a status response that lands after cleanup", async () => {
    vi.useFakeTimers();
    api.createDeployment.mockResolvedValue({ id: "d1" });
    let resolveStatus!: (d: unknown) => void;
    api.getDeployment.mockReturnValue(new Promise((res) => { resolveStatus = res; }));
    const statuses: string[] = [];
    const onStateUpdate = vi.fn((fn: (prev: never) => { deployStatus?: string }) => {
      const next = fn({ deployStatus: "pending", deployLogs: [], deployAppUrl: "" } as never);
      if (next.deployStatus) statuses.push(next.deployStatus);
    });

    const { result } = renderHook(() => useStandardDeploy());
    await act(() =>
      result.current.start({
        state: { deployStrategy: "vps", compose: {}, selectedProviderId: "p1", servicesModes: {} } as never,
        project: { id: "proj", name: "n", repository: "o/r", branch: "main", connectionId: "c1" },
        analysis: null,
        repo: "o/r",
        onStateUpdate,
        onError: vi.fn(),
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(1000)); // the poll's request is now in flight
    expect(api.getDeployment).toHaveBeenCalledTimes(1);
    statuses.length = 0;

    act(() => result.current.cleanup()); // the user cancels
    resolveStatus({ status: "deploying", logs: "", appUrl: "" });
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(statuses).toEqual([]);
    expect(api.getDeployment).toHaveBeenCalledTimes(1);
  });
});
