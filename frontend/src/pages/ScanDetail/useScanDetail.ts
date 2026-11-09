import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const FINDINGS_PAGE_SIZE = 40;
/** Cap on concurrent repo file reads — a full findings page is 40 distinct files,
 *  and firing those at once is what gets the git provider to rate-limit us. */
const MAX_PARALLEL_FILE_FETCHES = 6;
import { useParams, useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, gitApi } from "@/services/api";
import { getErrorMessage, isApiError } from "@/utils/errors";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { loadScanTools, scanToolFlags } from "@/utils/scanTools";
import { useConfirmableAction } from "@/hooks/useConfirmableAction";
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
  /** Files whose fetch failed for a reason other than 404 (rate limit, network,
   *  revoked token). The finding stays in the list — only its preview is lost —
   *  and we do not retry, so the capped queue cannot spin. */
  const previewUnavailable = useRef(new Set<string>());
  /** Bumped when a file fetch settles, so the capped queue advances even when
   *  the attempt changed no other state. */
  const [fileFetchTick, setFileFetchTick] = useState(0);
  const findingsFetchOffsetRef = useRef(0);

  const [runScanError, setRunScanError] = useState("");
  const [runScanStarting, setRunScanStarting] = useState(false);
  const terminalHandledRef = useRef<string | null>(null);
  const scanRef = useRef(scan);
  scanRef.current = scan;
  const findingsRef = useRef(findings);
  findingsRef.current = findings;

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

  // A cancelled scan ended the way its user asked; it is not an error to show
  // in red, only a fact the sidebar states plainly.
  const scanCancelled = Boolean(
    (scanMatchesUrl && scan?.summary?.cancelled) || live?.summary?.cancelled,
  );
  const scanError =
    runScanError
    || (scanCancelled ? "" : live?.error)
    || (scan?.status === "failed" && !scanCancelled ? scan.summary?.error || "Scan failed" : "");

  const findingsRequestIdRef = useRef(0);

  const fetchFindings = useCallback(async (
    id: string,
    options: {
      severity?: string;
      provider?: "semgrep" | "sonarqube" | "custom";
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
      // The rows are cleared, the counts are NOT. The list changes with the
      // filter, so stale rows would be wrong; the counts do not — the API
      // computes them per scan and ignores severity and provider
      // (getSecurityFindingCounts in domain/findings.ts). Blanking them made
      // every tab's number vanish and come back on each switch, discarding a
      // value for one identical to it. They are reset where they genuinely go
      // stale instead: the [scanId] effect below.
      setFindings([]);
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
      // Computed outside the updater: a state updater must stay pure, and React
      // may invoke it twice (StrictMode) or replay it while rendering.
      const deduped = dedupeFindings(append ? [...findingsRef.current, ...res.findings] : res.findings);
      findingsRef.current = deduped;
      setFindings(deduped);
      findingsFetchOffsetRef.current = offset + res.findings.length;
      setFindingCounts(res.counts);
      setHasMoreFindings(res.hasMore);
    } catch (err) {
      if (requestId !== findingsRequestIdRef.current) return;
      setFindingsError(getErrorMessage(err, "Failed to load findings"));
    } finally {
      // A `return` inside `finally` swallows any in-flight exception, so guard
      // the body with a condition instead. Only clear the loading flags when
      // this is still the current request — a newer one owns them otherwise.
      if (requestId === findingsRequestIdRef.current) {
        setFindingsLoading(false);
        setFindingsLoadingMore(false);
      }
    }
  }, []);

  const loadMoreFindings = useCallback(() => {
    if (!scanId || findingsLoading || findingsLoadingMore || !hasMoreFindings) return;
    fetchFindings(scanId, {
      severity: severityFilter || undefined,
      provider: (providerFilter || undefined) as "semgrep" | "sonarqube" | "custom" | undefined,
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
      // A silent refresh never raised the flag, so it must not lower one that a
      // visible load is still holding.
      if (!options?.silent) setAllScansLoading(false);
    }
  }, []);

  useEffect(() => {
    setRunScanError("");
    setPageError("");
    setFindingsError("");
    terminalHandledRef.current = null;
    setFindings([]);
    setFindingCounts(null);
    setHasMoreFindings(false);
    findingsFetchOffsetRef.current = 0;
    fetchingFiles.current.clear();
    missingFiles.current.clear();
    previewUnavailable.current.clear();
    setFileContents({});
  }, [scanId]);

  useEffect(() => {
    if (!scanId) return;
    if (scan?.id === scanId && (scan.status === "running" || scan.status === "pending")) return;
    fetchFindings(scanId, {
      severity: severityFilter || undefined,
      provider: (providerFilter || undefined) as "semgrep" | "sonarqube" | "custom" | undefined,
    });
  }, [scanId, scan?.id, scan?.status, severityFilter, providerFilter, fetchFindings]);

  // An engine with no findings deliberately keeps its tab selected. This used
  // to clear the filter instead, which moved the user somewhere they had not
  // asked to go and left them to work out why — "SonarQube found nothing" and
  // "you are now looking at everything" are different answers to the question
  // they asked. FindingsList says the former in its empty state.

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
          setAllScansLoading(true);
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
          provider: (providerFilter || undefined) as "semgrep" | "sonarqube" | "custom" | undefined,
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
    const toFetch = uniqueFiles
      .filter(
        (fp) =>
          !fileContents[fp]
          && !fetchingFiles.current.has(fp)
          && !missingFiles.current.has(fp.toLowerCase())
          && !previewUnavailable.current.has(fp),
      )
      .slice(0, Math.max(0, MAX_PARALLEL_FILE_FETCHES - fetchingFiles.current.size));
    if (toFetch.length === 0) return;
    toFetch.forEach((fp) => {
      fetchingFiles.current.add(fp);
      gitApi.getFileContent(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", fp)
        .then((res) => {
          setFileContents((prev) => ({ ...prev, [fp]: res.content }));
        })
        .catch((err: unknown) => {
          // A 404 means the file is genuinely gone at this ref, so the finding is
          // stale and comes out of the list. Anything else (rate limit, network,
          // expired token) says nothing about the finding — never drop a real
          // result because the preview fetch failed.
          if (isApiError(err) && err.status === 404) {
            missingFiles.current.add(fp.toLowerCase());
            setFindings((prev) =>
              prev.filter((finding) => displayFindingPath(finding.filePath) !== fp),
            );
            return;
          }
          previewUnavailable.current.add(fp);
        })
        .finally(() => {
          fetchingFiles.current.delete(fp);
          setFileFetchTick((t) => t + 1);
        });
    });
  }, [findings, project, fileContents, fileFetchTick]);

  /**
   * Severity and provider are independent filters and compose.
   *
   * This used to clear the provider, so picking a severity while on an engine's
   * tab threw you back to All — you could not ask for "Semgrep errors", which is
   * the narrowing a user wants most. Nothing required it: the API applies both
   * filters independently, and resolveFilteredCounts already switches the
   * severity cards to the selected provider's own breakdown so they keep showing
   * real, clickable numbers while both are active.
   */
  const handleSeverityFilter = (severity: string) => {
    setSeverityFilter((prev) => (prev === severity ? "" : severity));
  };

  // The request only records intent; the scan stops within a few seconds, when
  // the backend notices it. Until then the sidebar says "Cancelling…" rather
  // than letting the user press the button again.
  const [cancelRequestedFor, setCancelRequestedFor] = useState<string | null>(null);
  const cancelConfirm = useConfirmableAction(
    async () => {
      if (!scanId) return;
      await codeAnalysisApi.cancelScan(scanId);
      setCancelRequestedFor(scanId);
    },
    { errorFallback: "Could not cancel the scan" },
  );
  const cancelling = scanRunning && cancelRequestedFor !== null && cancelRequestedFor === scanId;
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

      const started = await codeAnalysisApi.runScan(newScan.id, scanToolFlags(loadScanTools()));
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
    scanCancelled,
    cancelConfirm,
    cancelling,
    handleRunScan,
    runScanBusy,
  };
}
