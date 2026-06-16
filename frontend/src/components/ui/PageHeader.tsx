import type { ReactNode } from "react";
import { typePageDesc, typePageTitle } from "../../utils/styles";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-2 mb-6 ${className}`}>
      <div className="min-w-0">
        <h1 className={typePageTitle}>{title}</h1>
        {description && <p className={`${typePageDesc} mt-0.5`}>{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
