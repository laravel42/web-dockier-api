import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmModal from "../components/ConfirmModal";

/**
 * The bug these cover: ConfirmModal used to call `onConfirm(); onClose();`
 * synchronously, so a rejected delete closed the modal and the failure was
 * invisible — the row stayed on screen and the user believed it had gone.
 */
describe("ConfirmModal", () => {
  const setup = (onConfirm: () => void | Promise<void>) => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete domain"
        message="Traffic to this domain stops immediately."
        confirmLabel="Delete domain"
      />,
    );
    return { onClose, user: userEvent.setup() };
  };

  it("closes once a successful confirm resolves", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { onClose, user } = setup(onConfirm);

    await user.click(screen.getByRole("button", { name: "Delete domain" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("stays open and shows the error when confirm rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Domain is in use by an active deployment"));
    const { onClose, user } = setup(onConfirm);

    await user.click(screen.getByRole("button", { name: "Delete domain" }));

    // The failure is announced, not swallowed.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Domain is in use by an active deployment");

    // And the modal is still up, so the user knows the row did not go away.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Traffic to this domain stops immediately.")).toBeInTheDocument();
  });

  it("waits for a slow confirm rather than closing immediately", async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const { onClose, user } = setup(onConfirm);

    await user.click(screen.getByRole("button", { name: "Delete domain" }));

    expect(onClose).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("clears a previous error when reopened", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Nope"));
    const onClose = vi.fn();
    const { rerender } = render(
      <ConfirmModal open onClose={onClose} onConfirm={onConfirm} confirmLabel="Delete" />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    rerender(<ConfirmModal open={false} onClose={onClose} onConfirm={onConfirm} confirmLabel="Delete" />);
    rerender(<ConfirmModal open onClose={onClose} onConfirm={onConfirm} confirmLabel="Delete" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
