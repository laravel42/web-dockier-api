import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
}

/**
 * Hero header for settings edit modals — large icon + name + description.
 */
export default function SettingsHeroHeader({ icon, title, description }: Props) {
  return (
    <div className="flex items-center gap-5">
      <div className="size-14 rounded-xl flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-text">{title}</p>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
    </div>
  );
}
