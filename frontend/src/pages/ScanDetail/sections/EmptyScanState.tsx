import { cardCls } from "../../../utils/styles";
import ScanSidebar from "./ScanSidebar";
import type { Scan, Project, ScanProgress } from "../types";
import ChevronLeftIcon from "../../../components/icons/outlined/ChevronLeftIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";

interface Props {
  project: Project;
  onBack: () => void;
  // sidebar props
  scanId: string | undefined;
  allScans: Scan[];
  allScansLoading: boolean;
  scanRunning: boolean;
  scanProgress: ScanProgress | null;
  scanError: string;
  onRunScan: () => void;
  onSelectScan: (id: string) => void;
}

export default function EmptyScanState({
  project, onBack,
  scanId, allScans, allScansLoading,
  scanRunning, scanProgress, scanError,
  onRunScan, onSelectScan,
}: Props) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
          <ChevronLeftIcon className="w-4 h-4" />
          All Scans
        </button>
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight mb-2">{project.name}</h1>
        <div className={`${cardCls} p-12 text-center mt-6`}>
          <ShieldCheckIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <p className="text-sm text-text-muted mb-1">No security scans yet for this project.</p>
          <p className="text-sm text-text-muted">Click "Run new scan" to get started.</p>
        </div>
      </div>
      <ScanSidebar
        scanId={scanId}
        allScans={allScans}
        allScansLoading={allScansLoading}
        scanRunning={scanRunning}
        scanProgress={scanProgress}
        scanError={scanError}
        hasConnectionId={!!project.connectionId}
        onRunScan={onRunScan}
        onSelectScan={onSelectScan}
      />
    </div>
  );
}
