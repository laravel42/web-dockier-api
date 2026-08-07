import type { ReactNode } from "react";
import Button from "./Button";
import { cardCls, typeBodyMuted, typePanelTitle } from "@/utils/styles";

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
      {title && <h2 className={`${typePanelTitle} mb-2`}>{title}</h2>}
      <p className={typeBodyMuted}>{description}</p>
      {action && (
        <Button variant="outline" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
