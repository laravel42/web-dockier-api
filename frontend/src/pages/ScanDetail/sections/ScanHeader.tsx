import { statusBadgeColors as statusColors } from "@/utils/styles";
import Button from "@/components/ui/Button";
import type { Scan, Project } from "@/types";
import { ChevronLeftIcon, ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  scan: Scan;
  project: Project | null;
  liveStatus?: string;
  onBack: () => void;
  onNavigateProject: () => void;
  actions?: ReactNode;
}

export default function ScanHeader({ scan, project, liveStatus, onBack, onNavigateProject, actions }: Props) {
  const status = liveStatus ?? scan.status;
  return (
    <>
      <Button variant="ghost" onClick={onBack} iconLeft={<ChevronLeftIcon className="size-4" />} className="mb-6">
        Back to Security Scans
      </Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-500">
            <ShieldCheckIcon className="size-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-text">Scan Results</h1>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[status] || "bg-secondary-100 text-text-muted"}`}>
                {status}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3">
              {project && (
                <button onClick={onNavigateProject} className="text-sm text-primary-500 transition-colors hover:text-primary-700">
                  {project.name}
                </button>
              )}
              <span className="truncate font-mono text-sm text-text-muted">{scan.repo}</span>
            </div>
          </div>
        </div>
        {actions ? <div className="min-w-0">{actions}</div> : null}
      </div>
    </>
  );
}
