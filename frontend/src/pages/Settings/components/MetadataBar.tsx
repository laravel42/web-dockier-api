import type { ReactNode } from "react";

export interface MetadataItem {
  label: string;
  value: ReactNode;
}

interface Props {
  items: MetadataItem[];
  /** Optional trailing action (e.g., enable/disable button) */
  action?: ReactNode;
}

/**
 * Horizontal metadata bar used in settings edit modals.
 * Displays key/value pairs separated by vertical dividers.
 */
export default function MetadataBar({ items, action }: Props) {
  return (
    <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
      {items.map((item, i) => (
        <div key={i} className={i > 0 ? "flex items-center gap-6" : undefined}>
          {i > 0 && <div className="w-px h-8 bg-border" />}
          <div>
            <span className="uppercase tracking-wide text-text-muted font-semibold">{item.label}</span>
            <p className="text-text font-medium mt-0.5">{item.value}</p>
          </div>
        </div>
      ))}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
