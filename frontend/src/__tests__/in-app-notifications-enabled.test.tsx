import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/**
 * A failed poll used to flip `enabled` to false, and every poll re-armed `loading`.
 * The Notifications page redirects on "not enabled" and spins on "loading", so a
 * flaky request threw the user off the page and a healthy one flashed a spinner.
 */
const listChannels = vi.hoisted(() => vi.fn());
vi.mock("@/services/api", () => ({ notificationsApi: { listChannels } }));
vi.mock("../services/api", () => ({ notificationsApi: { listChannels } }));
vi.mock("../context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => true, loading: false }),
}));

const { useInAppNotificationsEnabled, notifyInAppNotificationsChanged } = await import(
  "../hooks/useInAppNotificationsEnabled"
);

describe("useInAppNotificationsEnabled", () => {
  it("keeps the last known value and never re-enters loading when a refresh fails", async () => {
    listChannels.mockResolvedValueOnce({ channels: [{ type: "in_app", enabled: true }] });
    const { result } = renderHook(() => useInAppNotificationsEnabled());
    await waitFor(() => expect(result.current).toEqual({ enabled: true, loading: false }));

    listChannels.mockRejectedValueOnce(new Error("boom"));
    await act(async () => notifyInAppNotificationsChanged());

    await waitFor(() => expect(listChannels).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({ enabled: true, loading: false });
  });
});
