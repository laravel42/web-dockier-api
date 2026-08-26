import type { ReactNode } from "react";

interface TabPanelHeaderProps {
  title: string;
  description?: string;
  linkText?: string;
  linkHref?: string;
}

/** Shared scroll/shell wrapper for project-detail tab panels. */
export const tabPanelContentCls =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-auto pr-1";

/** Page-level tab heading: 20px title + muted payoff line. */
export function TabPanelHeader({
  title,
  description,
  linkText,
  linkHref,
}: TabPanelHeaderProps) {
  return (
    <div className="mb-2">
      <h2 className="!text-[20px] font-semibold text-text">{title}</h2>
      {description && (
        <p className="mt-1 text-xs/relaxed text-text-muted">
          {description}
          {linkText && linkHref && (
            <>
              {" "}
              <a
                href={linkHref}
                {...(linkHref.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-primary-500 hover:text-primary-400 transition-colors"
              >
                {linkText}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** In-tab subsection heading (below TabPanelHeader). */
export function TabPanelSectionTitle({
  title,
  suffix,
}: {
  title: string;
  suffix?: ReactNode;
}) {
  return (
    <h3 className="text-sm font-semibold text-text">
      {title}
      {suffix}
    </h3>
  );
}
