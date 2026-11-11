import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Settings tabs used to let a rejected save escape as an unhandled rejection,
 * leaving the user with no feedback. Pinned: the failure reaches a toast, and
 * UsersTab does not open the editor on fallback defaults (saving those would
 * overwrite the user's real language and timezone).
 */
const api = vi.hoisted(() => ({
  usersApi: { list: vi.fn(), get: vi.fn() },
  rolesApi: { list: vi.fn(), create: vi.fn() },
}));
vi.mock("@/services/api", () => api);

const toastError = vi.fn();
vi.mock("@/context/useToast", () => ({ useToast: () => ({ error: toastError, success: vi.fn() }) }));
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => true, roleId: "r0", refresh: vi.fn() }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ userId: "u0" }) }));
vi.mock("@/components/RoleFormModal", () => ({
  default: ({ open, onSubmit }: { open: boolean; onSubmit: (d: object) => void }) =>
    open ? <button onClick={() => onSubmit({ name: "x", description: "", permissions: [] })}>submit role</button> : null,
}));

const RolesTab = (await import("../pages/settings/RolesTab")).default;
const UsersTab = (await import("../pages/settings/UsersTab")).default;

beforeEach(() => vi.clearAllMocks());

describe("settings save errors", () => {
  it("RolesTab reports a failed create instead of throwing", async () => {
    api.rolesApi.list.mockResolvedValue({ roles: [] });
    api.rolesApi.create.mockRejectedValue(new Error("Role name taken"));
    const user = userEvent.setup();
    render(<RolesTab />);

    await user.click(await screen.findByRole("button", { name: /add role/i }));
    await user.click(screen.getByText("submit role"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Role name taken"));
  });

  it("UsersTab does not open the editor when the user cannot be loaded", async () => {
    api.usersApi.list.mockResolvedValue({
      users: [{ id: "u1", email: "a@b.co", name: "Ada", roleId: "r1", roleName: "Dev", isOwner: false, createdAt: "2026-01-01T00:00:00Z" }],
    });
    api.rolesApi.list.mockResolvedValue({ roles: [] });
    api.usersApi.get.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<UsersTab />);

    await user.click(await screen.findByText("Ada"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("boom"));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
