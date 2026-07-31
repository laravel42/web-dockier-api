import { cardCls } from "../../../utils/styles";
import Button from "../../../components/ui/Button";
import ScanSidebar from "./ScanSidebar";
import type { Scan, Project } from "../../../types";
import ChevronLeftIcon from "../../../components/icons/outlined/ChevronLeftIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";

interface Props {
  project: Project;
  onBack: () => void;
  // sidebar props
  scanId: string | undefined;
  allScans: Scan[];
  allScansLoading: boolean;
  scanError: string;
  onRunScan: () => void;
  onSelectScan: (id: string) => void;
}

export default function EmptyScanState({
  project, onBack,
  scanId, allScans, allScansLoading,
  scanError,
  onRunScan, onSelectScan,
}: Props) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <Button variant="ghost" onClick={onBack} iconLeft={<ChevronLeftIcon className="size-4" />} className="mb-6">
          All Scans
        </Button>
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight mb-2">{project.name}</h1>
        <div className={`${cardCls} p-12 text-center mt-6`}>
          <ShieldCheckIcon className="size-12  mx-auto text-text-muted mb-4" />
          <p className="text-sm text-text-muted mb-1">No security scans yet for this project.</p>
          <p className="text-sm text-text-muted">Click "Run new scan" to get started.</p>
        </div>
      </div>
      <ScanSidebar
        scanId={scanId}
        allScans={allScans}
        allScansLoading={allScansLoading}
        scanError={scanError}
        hasConnectionId={!!project.connectionId}
        onRunScan={onRunScan}
        onSelectScan={onSelectScan}
      />
    </div>
  );
}
