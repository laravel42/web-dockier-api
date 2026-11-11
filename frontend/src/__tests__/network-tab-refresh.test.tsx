import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Adding or deleting a rule refetches the lists. That refetch used to swap the
 * whole tab for a spinner, unmounting every section; it must keep them on screen.
 */
const net = vi.hoisted(() => ({
  listSecurityRules: vi.fn(),
  listRedirectRules: vi.fn(),
  apply: vi.fn(),
  deleteRedirectRule: vi.fn(),
}));
vi.mock("@/services/network", () => ({ networkApi: net }));
vi.mock("@/context/PermissionsContext", () => ({
  usePermissions: () => ({ has: () => true, loading: false }),
}));

const ProjectNetworkTab = (await import("../pages/ProjectDetail/sections/ProjectNetworkTab")).default;

describe("ProjectNetworkTab refresh", () => {
  it("keeps the rules on screen while refetching after a delete", async () => {
    const redirect = { id: "rd1", fromPath: "/old", toPath: "/new", type: "permanent" };
    net.listSecurityRules.mockResolvedValue({ rules: [] });
    net.listRedirectRules.mockResolvedValue({ rules: [redirect] });
    net.deleteRedirectRule.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProjectNetworkTab project={{ id: "p1" } as never} />);

    await screen.findByText("/old");
    // Make the refetch hang so the "loading" window stays observable.
    net.listRedirectRules.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: /remove|delete/i, hidden: false }));
    await user.click(await screen.findByRole("button", { name: /^delete redirect$/i }));

    await waitFor(() => expect(net.deleteRedirectRule).toHaveBeenCalled());
    expect(screen.queryByText(/Loading network rules/)).not.toBeInTheDocument();
  });
});
