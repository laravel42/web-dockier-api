import Link from "next/link";

import { CaretRight } from "@/components/icons/lucide-icons";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="text-muted-foreground flex items-center gap-2 text-sm"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const content =
          item.href && !isLast ? (
            <Link
              href={item.href}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className={isLast ? "text-foreground" : ""}>
              {item.label}
            </span>
          );

        return (
          <div key={`${item.label}-${idx}`} className="flex items-center gap-2">
            {idx > 0 ? (
              <CaretRight className="text-muted-foreground h-4 w-4" />
            ) : null}
            {content}
          </div>
        );
      })}
    </nav>
  );
}
