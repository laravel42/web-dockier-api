/**
 * A client-side timeout during infrastructure teardown is NOT a failed teardown.
 *
 * The request is one HTTP call into a long synchronous backend operation
 * (delete the Dokploy resource, verify it, remove the server, terminate the VM).
 * Aborting the fetch does not cancel any of that, so the deletes carry on and
 * usually complete. The old behaviour showed "Failed to tear down
 * infrastructure" while Dokploy was already empty, which invites a retry
 * against resources that are gone.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ApiError } from "@/services/api-error";

const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock("@/context/useToast", () => ({ useToast: () => toast }));

const teardownInfrastructure = vi.fn();
vi.mock("@/services/projects", () => ({
  projectsApi: { teardownInfrastructure: (id: string) => teardownInfrastructure(id) },
}));

const { useInfraTeardown } = await import("@/pages/ProjectDetail/hooks/useInfraTeardown");

beforeEach(() => vi.clearAllMocks());

describe("useInfraTeardown — client timeout", () => {
  it("reports work in progress and re-fetches, rather than reporting a failure", async () => {
    teardownInfrastructure.mockRejectedValue(
      new ApiError("Request timed out. Please check your connection and try again.", 0, "TIMEOUT", true),
    );
    const onComplete = vi.fn();

    const { result } = renderHook(() => useInfraTeardown("p-1", "live", onComplete));
    await act(async () => void (await result.current.handleTeardown()));

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/still running/i));
    // The page must re-read whatever state the backend actually reached.
    expect(onComplete).toHaveBeenCalled();
  });

  it("still surfaces a real failure", async () => {
    teardownInfrastructure.mockRejectedValue(new ApiError("Boom", 500));
    const onComplete = vi.fn();

    const { result } = renderHook(() => useInfraTeardown("p-1", "live", onComplete));
    await act(async () => void (await result.current.handleTeardown()));

    expect(toast.error).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
