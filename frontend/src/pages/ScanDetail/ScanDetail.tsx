import { btnSecondary } from "../../utils/styles";
import { useScanDetail } from "./useScanDetail";
import { useIssueModal } from "./useIssueModal";
import { useFixModal } from "./useFixModal";
import ScanHeader from "./sections/ScanHeader";
import SummaryCards from "./sections/SummaryCards";
import FindingsList from "./sections/FindingsList";
import ScanSidebar from "./sections/ScanSidebar";
import EmptyScanState from "./sections/EmptyScanState";
import CreateIssueModal from "./sections/CreateIssueModal";
import FixWithAIModal from "./sections/FixWithAIModal";

export default function ScanDetail() {
  const core = useScanDetail();
  const issue = useIssueModal(core.project);
  const fix = useFixModal(core.project);

  if (core.loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (core.error || (!core.scan && !core.project)) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{core.error || "Scan not found"}</p>
        <button onClick={() => core.navigate("/security")} className={btnSecondary}>Back to Security Scans</button>
      </div>
    );
  }

  // Project loaded but no scan selected
  if (!core.scan && core.project) {
    return (
      <EmptyScanState
        project={core.project}
        onBack={() => core.navigate("/security")}
        scanId={core.scanId}
        allScans={core.allScans}
        allScansLoading={core.allScansLoading}
        findings={core.findings}
        scanRunning={core.scanRunning}
        scanProgress={core.scanProgress}
        scanError={core.scanError}
        onRunScan={core.handleRunScan}
        onSelectScan={(id) => core.navigate(`/security/${id}`)}
      />
    );
  }

  if (!core.scan) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <ScanHeader
          scan={core.scan}
          project={core.project}
          onBack={() => core.navigate("/security")}
          onNavigateProject={() => core.project && core.navigate(`/projects/${core.project.id}`)}
        />

        {core.scan.summary && (
          <SummaryCards
            summary={core.scan.summary}
            severityFilter={core.severityFilter}
            onFilterChange={core.handleSeverityFilter}
          />
        )}

        <FindingsList
          findings={core.findings}
          findingsLoading={core.findingsLoading}
          scanCompleted={core.scan.status === "completed"}
          severityFilter={core.severityFilter}
          providerFilter={core.providerFilter}
          onProviderFilterChange={core.setProviderFilter}
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

      {/* Sidebar */}
      <ScanSidebar
        scanId={core.scanId}
        allScans={core.allScans}
        allScansLoading={core.allScansLoading}
        findings={core.findings}
        scanRunning={core.scanRunning}
        scanProgress={core.scanProgress}
        scanError={core.scanError}
        hasConnectionId={!!core.project?.connectionId}
        onRunScan={core.handleRunScan}
        onSelectScan={(id) => core.navigate(`/security/${id}`)}
      />
    </div>
  );
}
