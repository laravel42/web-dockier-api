import type { ReactNode } from "react";
import { btnSecondary, cardCls } from "../../utils/styles";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className={`${cardCls} p-12 text-center`}>
      {icon && <div className="mb-4 flex justify-center text-text-muted">{icon}</div>}
      {title && (
        <h2 className="text-sm font-semibold text-text mb-2">{title}</h2>
      )}
      <p className="text-sm text-text-muted">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`${btnSecondary} mt-4`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
