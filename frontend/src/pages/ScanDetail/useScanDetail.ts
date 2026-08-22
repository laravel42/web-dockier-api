import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const FINDINGS_PAGE_SIZE = 40;
import { useParams, useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, gitApi } from "@/services/api";
import { getErrorMessage } from "@/utils/errors";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { useScanLiveState, useScanProgress } from "@/context/ScanProgressContext";
import type { Scan, Finding, Project, ScanProgress, ScanSummary, SecurityFindingCounts } from "@/types";
import { displayFindingPath } from "@/pages/ScanDetail/utils/scanPaths";
import { dedupeFindings } from "@/pages/ScanDetail/utils/dedupeFindings";
import { withFindingCounts, countsFromSummary, severityBucketTotal } from "@/pages/ScanDetail/utils/findingCounts";

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
  const { seedFromScan, setOptimisticRunning, clearScanState, trackScan } = useScanProgress();
  const live = useScanLiveState(scanId);

  const [scan, setScan] = useState<Scan | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsTotal, setFindingsTotal] = useState(0);
  const [findingCounts, setFindingCounts] = useState<SecurityFindingCounts | null>(null);
  const [hasMoreFindings, setHasMoreFindings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [findingsLoadingMore, setFindingsLoadingMore] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [pageError, setPageError] = useState("");
  const [findingsError, setFindingsError] = useState("");

  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [allScansLoading, setAllScansLoading] = useState(false);

  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const fetchingFiles = useRef(new Set<string>());
  const missingFiles = useRef(new Set<string>());
  const findingsFetchOffsetRef = useRef(0);

  const [runScanError, setRunScanError] = useState("");
  const [runScanStarting, setRunScanStarting] = useState(false);
  const terminalHandledRef = useRef<string | null>(null);
  const missingFilesStorageKeyRef = useRef<string>("");
  const scanRef = useRef(scan);
  scanRef.current = scan;

  const scanMatchesUrl = !scan || !scanId || scan.id === scanId;
  const scanRunning =
    (scanMatchesUrl && (scan?.status === "running" || scan?.status === "pending"))
    || live?.status === "running"
    || live?.status === "pending";
  const runScanBusy =
    runScanStarting
    || scanRunning
    || allScans.some((s) => s.status === "running" || s.status === "pending");
  const scanProgress = scanRunning
    ? (live?.progress ?? live?.summary?.progress ?? (scanMatchesUrl ? scan?.summary?.progress : undefined) ?? DEFAULT_SCAN_PROGRESS)
    : null;

  const displaySummary = useMemo((): ScanSummary | null => {
    const apiSummary = scan?.summary;
    const liveSummary = live?.summary;
    if (!apiSummary && !liveSummary) return null;

    if (scanRunning) {
      const progress = live?.progress ?? liveSummary?.progress ?? (scanMatchesUrl ? apiSummary?.progress : undefined);
      const base = liveSummary ?? (scanMatchesUrl ? apiSummary : null);
      if (!base && !progress) return null;
      return {
        totalFindings: progress?.findingsCount ?? base?.totalFindings ?? 0,
        errors: base?.errors ?? 0,
        warnings: base?.warnings ?? 0,
        infos: base?.infos ?? 0,
        filesScanned: progress?.filesScanned ?? base?.filesScanned ?? 0,
        filesInRepo: progress?.filesInRepo ?? base?.filesInRepo ?? 0,
        error: base?.error,
        progress,
      };
    }

    if (liveSummary && live?.status && TERMINAL_STATUSES.has(live.status)) {
      const merged = { ...apiSummary, ...liveSummary, progress: undefined };
      const apiBuckets = apiSummary ? severityBucketTotal(apiSummary) : 0;
      const liveBuckets = severityBucketTotal(liveSummary);
      if (apiSummary && apiBuckets > liveBuckets) {
        return {
          ...merged,
          errors: apiSummary.errors,
          warnings: apiSummary.warnings,
          infos: apiSummary.infos,
          totalFindings: Math.max(merged.totalFindings, apiSummary.totalFindings, apiBuckets),
        };
      }
      return merged;
    }

    return apiSummary ?? liveSummary ?? null;
  }, [scan?.summary, live?.summary, live?.progress, live?.status, scanRunning, scanMatchesUrl]);

  const scanError =
    runScanError
    || live?.error
    || (scan?.status === "failed" ? scan.summary?.error || "Scan failed" : "");

  const findingsRequestIdRef = useRef(0);

  const fetchFindings = useCallback(async (
    id: string,
    options: {
      severity?: string;
      provider?: "semgrep" | "bearer" | "custom" | "codeql";
      append?: boolean;
      offset?: number;
    } = {},
  ) => {
    const { severity, provider, append = false, offset = 0 } = options;
    const requestId = ++findingsRequestIdRef.current;
    if (append) {
      setFindingsLoadingMore(true);
    } else {
      setFindingsLoading(true);
      setFindings([]);
      setFindingsTotal(0);
      setFindingCounts(null);
      setHasMoreFindings(false);
    }
    setFindingsError("");
    try {
      const res = await codeAnalysisApi.listFindings(id, {
        severity: severity || undefined,
        provider: provider || undefined,
        limit: FINDINGS_PAGE_SIZE,
        offset,
      });
      if (requestId !== findingsRequestIdRef.current) return;
      setFindings((prev) => {
        const deduped = dedupeFindings(append ? [...prev, ...res.findings] : res.findings);
        setFindingsTotal(res.hasMore ? res.total : deduped.length);
        return deduped;
      });
      findingsFetchOffsetRef.current = offset + res.findings.length;
      setFindingCounts(res.counts);
      setHasMoreFindings(res.hasMore);
    } catch (err) {
      if (requestId !== findingsRequestIdRef.current) return;
      setFindingsError(getErrorMessage(err, "Failed to load findings"));
    } finally {
      if (requestId !== findingsRequestIdRef.current) return;
      setFindingsLoading(false);
      setFindingsLoadingMore(false);
    }
  }, []);

  const loadMoreFindings = useCallback(() => {
    if (!scanId || findingsLoading || findingsLoadingMore || !hasMoreFindings) return;
    fetchFindings(scanId, {
      severity: severityFilter || undefined,
      provider: (providerFilter || undefined) as "semgrep" | "bearer" | "custom" | "codeql" | undefined,
      append: true,
      offset: findingsFetchOffsetRef.current,
    });
  }, [scanId, findingsLoading, findingsLoadingMore, hasMoreFindings, fetchFindings, severityFilter, providerFilter]);

  const refreshAllScans = useCallback(async (projectId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setAllScansLoading(true);
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
    setFindings([]);
    setFindingsTotal(0);
    setFindingCounts(null);
    setHasMoreFindings(false);
    findingsFetchOffsetRef.current = 0;
    fetchingFiles.current.clear();
    missingFiles.current.clear();
    setFileContents({});
  }, [scanId]);

  useEffect(() => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const key = `scan-missing-files:${project.connectionId}:${parsed.owner}/${parsed.repo}:${project.branch || "main"}`;
    missingFilesStorageKeyRef.current = key;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw) as string[];
      missingFiles.current = new Set(saved);
    } catch {
      missingFiles.current = new Set();
    }
  }, [project]);

  useEffect(() => {
    if (!scanId) return;
    if (scan?.id === scanId && (scan.status === "running" || scan.status === "pending")) return;
    fetchFindings(scanId, {
      severity: severityFilter || undefined,
      provider: (providerFilter || undefined) as "semgrep" | "bearer" | "custom" | "codeql" | undefined,
    });
  }, [scanId, scan?.id, scan?.status, severityFilter, providerFilter, fetchFindings]);

  useEffect(() => {
    if (!findingCounts || !providerFilter) return;
    const providerTotal = findingCounts[providerFilter as keyof SecurityFindingCounts];
    if (typeof providerTotal === "number" && providerTotal === 0) {
      setProviderFilter("");
    }
  }, [findingCounts, providerFilter]);

  useEffect(() => {
    if (scanId) {
      if (scanRef.current?.id === scanId) {
        setLoading(false);
        return;
      }
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

  useEffect(() => {
    if (!scanId || !scanRunning) return;
    trackScan(scanId);
  }, [scanId, scanRunning, trackScan]);

  // Mirror live progress into scan record so cards/header stay in sync with polls/WS.
  useEffect(() => {
    if (!scanId || !scanRunning || !live?.progress) return;
    setScan((prev) => {
      if (!prev || prev.id !== scanId) return prev;
      const p = live.progress!;
      const prevP = prev.summary?.progress;
      if (
        prevP
        && prevP.phase === p.phase
        && prevP.filesScanned === p.filesScanned
        && prevP.filesInRepo === p.filesInRepo
        && prevP.findingsCount === p.findingsCount
        && prevP.currentFile === p.currentFile
        && prevP.scanner === p.scanner
      ) {
        return prev;
      }
      return {
        ...prev,
        status: live.status ?? prev.status,
        summary: {
          ...prev.summary,
          filesScanned: p.filesScanned,
          filesInRepo: p.filesInRepo,
          totalFindings: Math.max(prev.summary?.totalFindings ?? 0, p.findingsCount),
          progress: p,
        },
      };
    });
  }, [scanId, scanRunning, live?.status, live?.progress]);

  // Apply terminal live updates immediately, then refresh from API once.
  useEffect(() => {
    if (!scanId || !live) return;
    if (!TERMINAL_STATUSES.has(live.status)) return;

    if (live.summary) {
      setScan((prev) => {
        if (!prev || prev.id !== scanId) return prev;
        if (prev.status === live.status && prev.summary === live.summary) return prev;
        const liveBuckets = severityBucketTotal(live.summary!);
        const prevBuckets = severityBucketTotal(prev.summary);
        return {
          ...prev,
          status: live.status,
          summary: {
            ...prev.summary,
            ...live.summary!,
            errors: liveBuckets >= prevBuckets ? live.summary!.errors : prev.summary.errors,
            warnings: liveBuckets >= prevBuckets ? live.summary!.warnings : prev.summary.warnings,
            infos: liveBuckets >= prevBuckets ? live.summary!.infos : prev.summary.infos,
            totalFindings: Math.max(prev.summary.totalFindings, live.summary!.totalFindings),
            progress: undefined,
          },
        };
      });
    }

    const key = `${scanId}:${live.status}`;
    if (terminalHandledRef.current === key) return;
    terminalHandledRef.current = key;

    void (async () => {
      try {
        const s = await codeAnalysisApi.getScan(scanId);
        setScan(s);
        seedFromScan(s);
        setAllScans((prev) =>
          prev.map((row) => (row.id === s.id ? { ...row, status: s.status, summary: s.summary } : row)),
        );
      } catch {
        /* ignore */
      }

      if (live.status === "completed") {
        await fetchFindings(scanId, {
          severity: severityFilter || undefined,
          provider: (providerFilter || undefined) as "semgrep" | "bearer" | "custom" | "codeql" | undefined,
        });
      }
      if (project) await refreshAllScans(project.id, { silent: true });
    })();
  }, [live, scanId, severityFilter, providerFilter, fetchFindings, project, refreshAllScans, seedFromScan]);

  useEffect(() => {
    if (!project || findings.length === 0) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const uniqueFiles = [...new Set(findings.map((f) => displayFindingPath(f.filePath)))];
    const toFetch = uniqueFiles.filter(
      (fp) => !fileContents[fp] && !fetchingFiles.current.has(fp) && !missingFiles.current.has(fp.toLowerCase()),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((fp) => {
      fetchingFiles.current.add(fp);
      gitApi.getFileContent(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", fp)
        .then((res) => {
          setFileContents((prev) => ({ ...prev, [fp]: res.content }));
        })
        .catch(() => {
          // Missing files (404) are expected for stale findings; avoid retry loops
          // and remove those findings from the current list entirely.
          const normalized = fp.toLowerCase();
          missingFiles.current.add(normalized);
          if (missingFilesStorageKeyRef.current) {
            try {
              localStorage.setItem(
                missingFilesStorageKeyRef.current,
                JSON.stringify(Array.from(missingFiles.current)),
              );
            } catch {
              // ignore persistence errors
            }
          }
          setFindings((prev) =>
            prev.filter((finding) => displayFindingPath(finding.filePath) !== fp),
          );
          setFindingsTotal((prev) => Math.max(0, prev - 1));
        })
        .finally(() => {
          fetchingFiles.current.delete(fp);
        });
    });
  }, [findings, project, fileContents]);

  const handleSeverityFilter = (severity: string) => {
    setProviderFilter("");
    setSeverityFilter((prev) => (prev === severity ? "" : severity));
  };

  const handleRunScan = async () => {
    if (!project || runScanBusy) return;
    setRunScanError("");
    setRunScanStarting(true);
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
      const runningScan: Scan = { ...newScan, status: "running" };

      setOptimisticRunning(newScan.id);
      setAllScans((prev) => [runningScan, ...prev.filter((s) => s.id !== runningScan.id)]);
      if (scanId !== newScan.id) {
        navigate(`/security/${newScan.id}`);
      }
      setScan(runningScan);

      const started = await codeAnalysisApi.runScan(newScan.id, (() => {
        try {
          const t = JSON.parse(localStorage.getItem("scan_tools") || "{}");
          return {
            enableSemgrep: false,
            enableBearer: t.bearer !== false,
            enableSonarqube: t.bearer !== false,
            enableCustomRules: t.customRules !== false,
            enableCodeql: t.codeql !== false,
            enableSensitiveData: false,
          };
        } catch {
          return {};
        }
      })());
      const confirmed: Scan = {
        ...runningScan,
        status: started.status === "pending" ? "pending" : "running",
        summary: started.summary ?? runningScan.summary,
      };
      setScan(confirmed);
      seedFromScan(confirmed);

      await refreshAllScans(project.id, { silent: true });
    } catch (err: unknown) {
      setRunScanError(getErrorMessage(err, "Scan failed"));
      if (createdScanId) clearScanState(createdScanId);
    } finally {
      setRunScanStarting(false);
    }
  };

  const sidebarScans = useMemo(
    () => allScans.map((s) => {
      if (s.id !== scanId) return s;
      const status = (scan?.id === s.id ? scan.status : s.status);
      let next = status === s.status ? s : { ...s, status };
      if (scan?.id === s.id) next = withFindingCounts(next, countsFromSummary(scan.summary));
      if (live?.summary) next = withFindingCounts(next, countsFromSummary(live.summary));
      return withFindingCounts(next, findingCounts);
    }),
    [allScans, scanId, scan, live?.summary, findingCounts],
  );

  return {
    scanId,
    navigate,
    scan,
    project,
    findings,
    findingsTotal,
    findingCounts,
    hasMoreFindings,
    loadMoreFindings,
    fileContents,
    loading,
    findingsLoading,
    findingsLoadingMore,
    pageError,
    findingsError,
    severityFilter,
    handleSeverityFilter,
    providerFilter,
    setProviderFilter,
    allScans: sidebarScans,
    allScansLoading,
    scanRunning,
    scanProgress,
    displaySummary,
    liveStatus: live?.status,
    scanError,
    handleRunScan,
    runScanBusy,
  };
}
