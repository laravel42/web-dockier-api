import { SubHeader } from "@/components/layout/sub-header";

const ORIGINAL = "original";

interface Props {
  children: React.ReactNode;
}

export default function OriginalSettingsGroupLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubHeader
        section="Settings"
        searchName="original-settings-search"
        searchAriaLabel="Search settings"
        sectionSegment={ORIGINAL}
        breadcrumbPreset="original-settings"
      />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
