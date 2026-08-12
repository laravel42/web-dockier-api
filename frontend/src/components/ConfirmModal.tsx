import { useEffect, useState } from "react";
import Modal from "./Modal";
import Button from "./ui/Button";
import { getErrorMessage } from "@/utils/errors";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * May be async. The modal stays open until it resolves, and stays open showing
   * the error if it rejects — so a failed delete is never invisible.
   */
  onConfirm: () => void | Promise<void>;
  title?: string;
  message?: string;
  confirmLabel?: string;
  /** Destructive tier — see docs/delivery/blast-radius-tiers.md. */
  destructive?: boolean;
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm Delete",
  message = "Are you sure? This action cannot be undone.",
  confirmLabel = "Delete",
  destructive = true,
}: ConfirmModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // A reopened modal must not inherit the previous attempt's error.
  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const handleConfirm = async () => {
    setPending(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      // Deliberately stays open. The caller's row is still on screen, and closing
      // here would tell the user the action succeeded when it did not.
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title={title}>
      <p className="text-sm text-text-secondary">{message}</p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleConfirm()}
          loading={pending}
          className={
            destructive
              ? "bg-danger-700 text-white hover:bg-danger-700/90"
              : undefined
          }
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
