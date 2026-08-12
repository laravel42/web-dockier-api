import { SubHeader } from "@/components/layout/sub-header";

const DEVELOPERS = "developers";

const devtoolsStringOverrides = {
  "api-keys": "API Keys",
  "events-&-logs": "Events & Logs",
} as const;

interface Props {
  children: React.ReactNode;
}

export default function DevelopersDevToolsGroupLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubHeader
        section="Developers"
        searchName="developers-search"
        searchAriaLabel="Search developers"
        sectionSegment={DEVELOPERS}
        breadcrumbPreset="developers"
        breadcrumbOverrides={devtoolsStringOverrides}
      />
      <div className="min-h-0 flex-1 overflow-auto has-[>[data-layout=fixed]]:flex has-[>[data-layout=fixed]]:overflow-hidden">
        {children}
      </div>
    </div>
  );
}
