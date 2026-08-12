import { SubHeader } from "@/components/layout/sub-header";

const ORIGINAL = "original";

interface Props {
  children: React.ReactNode;
}

export default function OriginalTasksGroupLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubHeader
        section="Tasks"
        searchName="original-tasks-search"
        searchAriaLabel="Search tasks"
        sectionSegment={ORIGINAL}
        breadcrumbPreset="original-tasks"
      />
      <div className="min-h-0 flex-1 overflow-auto has-[>[data-layout=fixed]]:flex has-[>[data-layout=fixed]]:overflow-hidden">
        {children}
      </div>
    </div>
  );
}
