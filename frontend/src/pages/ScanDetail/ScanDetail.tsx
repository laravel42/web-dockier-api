import Button from "@/components/ui/Button";
import { useEffect, useState } from "react";
import { useScanDetail } from "./useScanDetail";
import { useIssueModal } from "./useIssueModal";
import { useFixModal } from "./useFixModal";
import ScanHeader from "./sections/ScanHeader";
import SummaryCards from "./sections/SummaryCards";
import FindingsList, { ProviderFilters } from "./sections/FindingsList";
import ScanSidebar from "./sections/ScanSidebar";
import ScanProgressPanel from "./sections/ScanProgressPanel";
import EngineOutcomePanel from "./sections/EngineOutcomePanel";
import EmptyScanState from "./sections/EmptyScanState";
import CreateIssueModal from "./sections/CreateIssueModal";
import FixWithAIModal from "./sections/FixWithAIModal";
import PageLoading from "@/components/ui/PageLoading";
import PageError from "@/components/ui/PageError";
import type { ScanProgress } from "@/types";

export default function ScanDetail() {
  const core = useScanDetail();
  const issue = useIssueModal(core.project);
  const fix = useFixModal(core.project);
  const [progressHold, setProgressHold] = useState(false);
  const [heldProgress, setHeldProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    setHeldProgress(null);
    setProgressHold(false);
  }, [core.scanId]);

  useEffect(() => {
    if (core.scanProgress) setHeldProgress(core.scanProgress);
  }, [core.scanProgress]);

  useEffect(() => {
    if (core.scanRunning) {
      setProgressHold(true);
      return;
    }
    if (!progressHold) return;
    const timer = window.setTimeout(() => setProgressHold(false), 800);
    return () => window.clearTimeout(timer);
  }, [core.scanRunning, progressHold]);

  const progressToShow = core.scanProgress ?? (progressHold ? heldProgress : null);

  if (core.loading) {
    return <PageLoading />;
  }

  if (core.pageError || (!core.scan && !core.project)) {
    return (
      <div>
        <PageError message={core.pageError || "Scan not found"} />
        <div className="text-center mt-4">
          <Button variant="secondary" onClick={() => core.navigate("/security")}>
            Back to Security Scans
          </Button>
        </div>
      </div>
    );
  }

  if (!core.scan && core.project) {
    return (
      <EmptyScanState
        project={core.project}
        onBack={() => core.navigate("/security")}
        scanId={core.scanId}
        allScans={core.allScans}
        allScansLoading={core.allScansLoading}
        scanError={core.scanError}
        onRunScan={core.handleRunScan}
        onSelectScan={(id) => core.navigate(`/security/${id}`)}
        runScanBusy={core.runScanBusy}
      />
    );
  }

  if (!core.scan) {
    return <PageLoading />;
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <ScanHeader
          scan={core.scan}
          project={core.project}
          liveStatus={core.liveStatus}
          onBack={() => core.navigate("/security")}
          onNavigateProject={() => core.project && core.navigate(`/projects/${core.project.id}`)}
          actions={(
            <ProviderFilters
              findingCounts={core.findingCounts}
              providerFilter={core.providerFilter}
              onProviderFilterChange={core.setProviderFilter}
            />
          )}
        />

        {progressToShow && (core.scanRunning || progressHold) && (
          <div className="mb-4 rounded-card border border-primary/20 bg-primary/5 px-4 py-3">
            <ScanProgressPanel
              key={core.scanId}
              progress={progressToShow}
              active={core.scanRunning}
            />
          </div>
        )}

        {core.displaySummary && (
          <SummaryCards
            summary={core.displaySummary}
            severityFilter={core.severityFilter}
            providerFilter={core.providerFilter}
            findingCounts={core.findingCounts}
            findingsTotal={core.findingsTotal}
            onFilterChange={core.handleSeverityFilter}
            scanRunning={core.scanRunning}
            progress={core.scanProgress}
          />
        )}
        <EngineOutcomePanel
          scanId={core.scanId}
          scanStatus={core.scan?.status ?? core.liveStatus}
        />
        <FindingsList
          findings={core.findings}
          findingsTotal={core.findingsTotal}
          findingCounts={core.findingCounts}
          findingsLoading={core.findingsLoading}
          findingsLoadingMore={core.findingsLoadingMore}
          hasMoreFindings={core.hasMoreFindings}
          onLoadMore={core.loadMoreFindings}
          scanCompleted={core.scan.status === "completed"}
          severityFilter={core.severityFilter}
          providerFilter={core.providerFilter}
          fileContents={core.fileContents}
          pmIntegrations={issue.pmIntegrations}
          hasConnectionId={!!core.project?.connectionId}
          mrCreating={fix.mrCreating}
          onCreateIssue={issue.openIssueModal}
          onCreateMR={fix.openFixModal}
        />

        <CreateIssueModal
          open={issue.issueModal.open}
          onClose={issue.closeIssueModal}
          repoUrl={core.project?.repository || ""}
          pmIntegrations={issue.pmIntegrations}
          issueIntegration={issue.issueIntegration}
          onIntegrationChange={issue.handleIntegrationChange}
          pmProjects={issue.pmProjects}
          pmProjectsLoading={issue.pmProjectsLoading}
          selectedPmProject={issue.selectedPmProject}
          pmTeamLabel={issue.pmTeamLabel}
          pmProjectLabel={issue.pmProjectLabel}
          pmSubProjects={issue.pmSubProjects}
          pmSubProjectsLoading={issue.pmSubProjectsLoading}
          selectedPmSubProject={issue.selectedPmSubProject}
          onSubProjectChange={issue.setSelectedPmSubProject}
          onTeamChange={issue.handleTeamChange}
          issueTitle={issue.issueTitle}
          onTitleChange={issue.setIssueTitle}
          titleGenerating={issue.titleGenerating}
          issueDescription={issue.issueDescription}
          onDescriptionChange={issue.setIssueDescription}
          pmMembers={issue.pmMembers}
          selectedPmAssignee={issue.selectedPmAssignee}
          onAssigneeChange={issue.setSelectedPmAssignee}
          gitMembers={issue.gitMembers}
          selectedGitAssignee={issue.selectedGitAssignee}
          onGitAssigneeChange={issue.setSelectedGitAssignee}
          issueCreating={issue.issueCreating}
          issueSuccess={issue.issueSuccess}
          issueSuccessUrl={issue.issueSuccessUrl}
          issueError={issue.issueError}
          onDismissError={() => issue.setIssueError("")}
          onSubmit={issue.handleCreateIssue}
        />

        <FixWithAIModal
          open={fix.fixModal.open}
          finding={fix.fixModal.finding}
          onClose={fix.closeFixModal}
          fixLoading={fix.fixLoading}
          fixResult={fix.fixResult}
          fixError={fix.fixError}
          onDismissError={() => fix.setFixError("")}
          repoMembers={fix.repoMembers}
          mrTitle={fix.mrTitle}
          onTitleChange={fix.setMrTitle}
          titleGenerating={fix.titleGenerating}
          mrDescription={fix.mrDescription}
          onDescriptionChange={fix.setMrDescription}
          mrAssignee={fix.mrAssignee}
          onAssigneeChange={fix.setMrAssignee}
          mrReviewer={fix.mrReviewer}
          onReviewerChange={fix.setMrReviewer}
          onSubmit={fix.handleSubmitMR}
        />
      </div>

      <ScanSidebar
        scanId={core.scanId}
        allScans={core.allScans}
        allScansLoading={core.allScansLoading}
        scanError={core.scanError}
        hasConnectionId={!!core.project?.connectionId}
        onRunScan={core.handleRunScan}
        onSelectScan={(id) => core.navigate(`/security/${id}`)}
        runScanBusy={core.runScanBusy}
      />
    </div>
  );
}
