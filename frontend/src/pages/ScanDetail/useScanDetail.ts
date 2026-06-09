import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, gitApi } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import { useScanLiveState, useScanProgress } from "../../context/ScanProgressContext";
import type { Scan, Finding, Project, ScanProgress, ScanSummary } from "../../types";
import { displayFindingPath } from "../../utils/scanPaths";

const DEFAULT_SCAN_PROGRESS: ScanProgress = {
  phase: "cloning",
  filesScanned: 0,
  filesInRepo: 0,
  findingsCount: 0,
};

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export function useScanDetail() {
  const { scanId, projectId: routeProjectId } = useParams<{ scanId?: string; projectId?: string }>();
  const navigate = useNavigate();
  const { seedFromScan, setOptimisticRunning, clearScanState } = useScanProgress();
  const live = useScanLiveState(scanId);

  const [scan, setScan] = useState<Scan | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [pageError, setPageError] = useState("");
  const [findingsError, setFindingsError] = useState("");

  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [allScansLoading, setAllScansLoading] = useState(false);

  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const fetchingFiles = useRef(new Set<string>());

  const [runScanError, setRunScanError] = useState("");
  const terminalHandledRef = useRef<string | null>(null);

  const apiTerminal = Boolean(scan?.status && TERMINAL_STATUSES.has(scan.status));
  const liveTerminal = Boolean(live?.status && TERMINAL_STATUSES.has(live.status));
  const scanRunning =
    !apiTerminal
    && !liveTerminal
    && ((live?.status === "running" || live?.status === "pending")
      || (scan?.status === "running" || scan?.status === "pending"));
  const scanProgress = scanRunning
    ? (live?.progress ?? scan?.summary?.progress ?? DEFAULT_SCAN_PROGRESS)
    : null;

  const displaySummary = useMemo((): ScanSummary | null => {
    const apiSummary = scan?.summary;
    const liveSummary = live?.summary;
    if (!apiSummary && !liveSummary) return null;

    if (scanRunning) {
      const progress = live?.progress ?? apiSummary?.progress;
      const base = liveSummary ?? apiSummary!;
      return {
        ...base,
        filesScanned: progress?.filesScanned ?? base.filesScanned ?? 0,
        filesInRepo: progress?.filesInRepo ?? base.filesInRepo ?? 0,
        totalFindings: progress?.findingsCount ?? base.totalFindings ?? 0,
        progress,
      };
    }

    if (liveSummary && live?.status && TERMINAL_STATUSES.has(live.status)) {
      return { ...apiSummary, ...liveSummary, progress: undefined };
    }

    return apiSummary ?? liveSummary ?? null;
  }, [scan?.summary, live?.summary, live?.progress, live?.status, scanRunning]);

  const scanError =
    runScanError
    || live?.error
    || (scan?.status === "failed" ? scan.summary?.error || "Scan failed" : "");

  const fetchFindings = useCallback(async (id: string, severity?: string) => {
    setFindingsLoading(true);
    setFindingsError("");
    try {
      const res = await codeAnalysisApi.listFindings(id, severity || undefined);
      setFindings(res.findings);
    } catch (err) {
      setFindingsError(getErrorMessage(err, "Failed to load findings"));
    } finally {
      setFindingsLoading(false);
    }
  }, []);

  const refreshAllScans = useCallback(async (projectId: string) => {
    setAllScansLoading(true);
    try {
      const res = await codeAnalysisApi.listScans(projectId);
      setAllScans(res.scans);
    } catch {
      /* ignore */
    } finally {
      setAllScansLoading(false);
    }
  }, []);

  useEffect(() => {
    setRunScanError("");
    setPageError("");
    setFindingsError("");
    terminalHandledRef.current = null;
  }, [scanId]);

  useEffect(() => {
    if (scanId) {
      setLoading(true);
      codeAnalysisApi.getScan(scanId)
        .then(async (s) => {
          setScan(s);
          seedFromScan(s);
          try {
            const p = await projectsApi.get(s.projectId);
            setProject(p);
            await refreshAllScans(s.projectId);
          } catch {
            /* ignore */
          }
          return s;
        })
        .catch((err: unknown) => setPageError(getErrorMessage(err, "Failed to load scan")))
        .finally(() => setLoading(false));
      fetchFindings(scanId);
    } else if (routeProjectId) {
      setLoading(true);
      projectsApi.get(routeProjectId)
        .then(async (p) => {
          setProject(p);
          try {
            const res = await codeAnalysisApi.listScans(routeProjectId);
            setAllScans(res.scans);
            if (res.scans.length > 0) {
              const latest = [...res.scans].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )[0];
              navigate(`/security/${latest.id}`, { replace: true });
            }
          } catch {
            /* ignore */
          } finally {
            setAllScansLoading(false);
          }
        })
        .catch((err: unknown) => setPageError(getErrorMessage(err, "Failed to load project")))
        .finally(() => setLoading(false));
    }
  }, [scanId, routeProjectId, seedFromScan, fetchFindings, refreshAllScans, navigate]);

  // Apply terminal live updates immediately, then refresh from API once.
  useEffect(() => {
    if (!scanId || !live) return;
    if (!TERMINAL_STATUSES.has(live.status)) return;

    if (live.summary) {
      setScan((prev) => {
        if (!prev || prev.id !== scanId) return prev;
        if (prev.status === live.status && prev.summary === live.summary) return prev;
        return { ...prev, status: live.status, summary: live.summary! };
      });
    }

    if (scan?.status === live.status && scan?.summary?.totalFindings === live.summary?.totalFindings) {
      return;
    }

    const key = `${scanId}:${live.status}`;
    if (terminalHandledRef.current === key) return;
    terminalHandledRef.current = key;

    codeAnalysisApi.getScan(scanId).then((s) => {
      setScan(s);
      seedFromScan(s);
    }).catch(() => {});

    if (live.status === "completed") {
      fetchFindings(scanId, severityFilter || undefined);
    }
    if (project) refreshAllScans(project.id);
  }, [live?.status, live?.summary, scanId, scan?.status, scan?.summary?.totalFindings, severityFilter, fetchFindings, project, refreshAllScans, seedFromScan]);

  useEffect(() => {
    if (!project || findings.length === 0) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const uniqueFiles = [...new Set(findings.map((f) => displayFindingPath(f.filePath)))];
    const toFetch = uniqueFiles.filter((fp) => !fileContents[fp] && !fetchingFiles.current.has(fp));
    if (toFetch.length === 0) return;
    toFetch.forEach((fp) => {
      fetchingFiles.current.add(fp);
      gitApi.getFileContent(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", fp)
        .then((res) => setFileContents((prev) => ({ ...prev, [fp]: res.content })))
        .catch(() => { fetchingFiles.current.delete(fp); });
    });
  }, [findings, project, fileContents]);

  const handleSeverityFilter = (severity: string) => {
    setSeverityFilter(severity);
  };

  const handleRunScan = async () => {
    if (!project) return;
    setRunScanError("");
    let createdScanId: string | undefined;
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const newScan = await codeAnalysisApi.createScan({
        projectId: project.id,
        connectionId: project.connectionId,
        repo,
        branch: project.branch || "main",
      });
      createdScanId = newScan.id;

      setOptimisticRunning(newScan.id);

      await codeAnalysisApi.runScan(newScan.id, (() => {
        try {
          const t = JSON.parse(localStorage.getItem("scan_tools") || "{}");
          return {
            enableSemgrep: t.semgrep !== false,
            enableSonarqube: t.sonarqube !== false,
            enableCustomRules: t.customRules !== false,
          };
        } catch {
          return {};
        }
      })());

      setScan({ ...newScan, status: "running" });
      if (scanId !== newScan.id) {
        navigate(`/security/${newScan.id}`);
      }
      await refreshAllScans(project.id);
    } catch (err: unknown) {
      setRunScanError(getErrorMessage(err, "Scan failed"));
      if (createdScanId) clearScanState(createdScanId);
    }
  };

  return {
    scanId,
    navigate,
    scan,
    project,
    findings,
    fileContents,
    loading,
    findingsLoading,
    pageError,
    findingsError,
    severityFilter,
    handleSeverityFilter,
    providerFilter,
    setProviderFilter,
    allScans,
    allScansLoading,
    scanRunning,
    scanProgress,
    displaySummary,
    scanError,
    handleRunScan,
  };
}
