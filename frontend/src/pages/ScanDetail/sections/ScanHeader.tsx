import { statusBadgeColors as statusColors } from "../../../utils/styles";
import Button from "../../../components/ui/Button";
import ChevronLeftIcon from "../../../components/icons/outlined/ChevronLeftIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import type { Scan, Project } from "../../../types";

interface Props {
  scan: Scan;
  project: Project | null;
  liveStatus?: string;
  onBack: () => void;
  onNavigateProject: () => void;
}

export default function ScanHeader({ scan, project, liveStatus, onBack, onNavigateProject }: Props) {
  const status = liveStatus ?? scan.status;
  return (
    <>
      <Button variant="ghost" onClick={onBack} iconLeft={<ChevronLeftIcon className="size-4" />} className="mb-6">
        Back to Security Scans
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-12  rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
            <ShieldCheckIcon className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-text">Scan Results</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[status] || "bg-secondary-100 text-text-muted"}`}>
                {status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {project && (
                <button onClick={onNavigateProject} className="text-sm text-primary-500 hover:text-primary-700 transition-colors">
                  {project.name}
                </button>
              )}
              <span className="text-sm text-text-muted font-mono">{scan.repo}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
