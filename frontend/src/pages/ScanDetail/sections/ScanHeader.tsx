import { statusBadgeColors as statusColors } from "../../../utils/styles";
import type { Scan, Project } from "../../../types";

interface Props {
  scan: Scan;
  project: Project | null;
  onBack: () => void;
  onNavigateProject: () => void;
}

export default function ScanHeader({ scan, project, onBack, onNavigateProject }: Props) {
  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Security Scans
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-text">Scan Results</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[scan.status] || "bg-secondary-100 text-text-muted"}`}>
                {scan.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {project && (
                <button onClick={onNavigateProject} className="text-sm text-primary-500 hover:text-primary-700 transition-colors">
                  {project.name}
                </button>
              )}
              <span className="text-sm text-text-muted font-mono">{scan.repo}</span>
              <span className="text-xs text-text-muted">{scan.branch}</span>
              <span className="text-xs text-text-muted">{new Date(scan.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
