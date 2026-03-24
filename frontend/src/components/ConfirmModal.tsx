import Modal from "./Modal";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
}

export default function ConfirmModal({ open, onClose, onConfirm, title = "Confirm Delete", message = "Are you sure? This action cannot be undone.", confirmLabel = "Delete" }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} compact>
      <p className="text-sm text-text-secondary mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-text-secondary rounded-[var(--radius-btn)] hover:bg-secondary-50 transition-colors">Cancel</button>
        <button onClick={() => { onConfirm(); onClose(); }} className="h-9 px-4 bg-danger-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-danger-700 transition-colors">{confirmLabel}</button>
      </div>
    </Modal>
  );
}
