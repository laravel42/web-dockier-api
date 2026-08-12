"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SubHeader } from "@/components/layout/sub-header";
import { cn } from "@/lib/utils";

const adminNav = [
  { name: "General Settings", href: "/administration" },
  { name: "Rules", href: "/administration/rules" },
  { name: "Quality Profiles", href: "/administration/quality-profiles" },
  { name: "Quality Gates", href: "/administration/quality-gates" },
];

export default function AdministrationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden">
      <SubHeader
        section="Administration"
        searchName="administration"
        searchAriaLabel="Search Administration"
        sectionSegment="administration"
        breadcrumbPreset="original-settings"
      />
      
      <div className="border-b px-4 sm:px-6">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {adminNav.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  "whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors"
                )}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20">
        {children}
      </div>
    </div>
  );
}
