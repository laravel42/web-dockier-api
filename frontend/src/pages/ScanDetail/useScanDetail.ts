import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, gitApi } from "../../services/api";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import type { Scan, Finding, Project, ScanProgress } from "../../types";

export function useScanDetail() {
  const { scanId, projectId: routeProjectId } = useParams<{ scanId?: string; projectId?: string }>();
  const navigate = useNavigate();

  const [scan, setScan] = useState<Scan | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [error, setError] = useState("");

  // Sidebar: all scans for this project
  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [allScansLoading, setAllScansLoading] = useState(false);

  // Run new scan state
  const [scanRunning, setScanRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState("");

  // File contents cache for code preview
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const fetchingFiles = useRef(new Set<string>());

  // ── Data loading ───────────────────────────────────────────────

  const fetchFindings = async (id: string, severity?: string) => {
    setFindingsLoading(true);
    try {
      const res = await codeAnalysisApi.listFindings(id, severity || undefined);
      setFindings(res.findings);
    } catch {}
    finally { setFindingsLoading(false); }
  };

  useEffect(() => {
    if (scanId) {
      setLoading(true);
      codeAnalysisApi.getScan(scanId)
        .then(async (s) => {
          setScan(s);
          try {
            const p = await projectsApi.get(s.projectId);
            setProject(p);
            setAllScansLoading(true);
            codeAnalysisApi.listScans(s.projectId)
              .then((res) => setAllScans(res.scans))
              .catch(() => {})
              .finally(() => setAllScansLoading(false));
          } catch {}
          return s;
        })
        .catch((err: any) => setError(err.message || "Failed to load scan"))
        .finally(() => setLoading(false));
      fetchFindings(scanId);
    } else if (routeProjectId) {
      setLoading(true);
      projectsApi.get(routeProjectId)
        .then(async (p) => {
          setProject(p);
          setAllScansLoading(true);
          codeAnalysisApi.listScans(routeProjectId)
            .then((res) => {
              setAllScans(res.scans);
              if (res.scans.length > 0) {
                const latest = res.scans.sort((a: Scan, b: Scan) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                navigate(`/security/${latest.id}`, { replace: true });
              }
            })
            .catch(() => {})
            .finally(() => setAllScansLoading(false));
        })
        .catch((err: any) => setError(err.message || "Failed to load project"))
        .finally(() => setLoading(false));
    }
  }, [scanId, routeProjectId]);

  // Fetch file contents for code preview
  useEffect(() => {
    if (!project || findings.length === 0) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const uniqueFiles = [...new Set(findings.map(f => f.filePath))];
    const toFetch = uniqueFiles.filter(fp => !fileContents[fp] && !fetchingFiles.current.has(fp));
    if (toFetch.length === 0) return;
    toFetch.forEach(fp => {
      fetchingFiles.current.add(fp);
      gitApi.getFileContent(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", fp)
        .then(res => setFileContents(prev => ({ ...prev, [fp]: res.content })))
        .catch(() => { fetchingFiles.current.delete(fp); });
    });
  }, [findings, project]);

  // ── Actions ────────────────────────────────────────────────────

  const handleSeverityFilter = (severity: string) => {
    setSeverityFilter(severity);
  };

  const handleRunScan = async () => {
    if (!project) return;
    setScanRunning(true);
    setScanError("");
    setScanProgress({ phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 });
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const newScan = await codeAnalysisApi.createScan({
        projectId: project.id,
        connectionId: project.connectionId,
        repo,
        branch: project.branch || "main",
      });
      await codeAnalysisApi.runScan(newScan.id, (() => {
        try { const t = JSON.parse(localStorage.getItem("scan_tools") || "{}"); return { enableSemgrep: t.semgrep !== false, enableCustomRules: t.customRules !== false }; }
        catch { return {}; }
      })());

      const poll = async () => {
        try {
          const s = await codeAnalysisApi.getScan(newScan.id);
          const progress = s.summary?.progress as ScanProgress | undefined;
          if (progress) setScanProgress(progress);

          if (s.status === "completed" || s.status === "failed") {
            setScanRunning(false);
            setScanProgress(null);
            if (s.status === "failed") {
              setScanError((s.summary as any)?.error || "Scan failed");
            } else {
              setScan(s);
              fetchFindings(newScan.id, severityFilter || undefined);
              if (scanId !== newScan.id) navigate(`/security/${newScan.id}`);
            }
            codeAnalysisApi.listScans(project.id).then((res) => setAllScans(res.scans)).catch(() => {});
            return;
          }
          setTimeout(poll, 1000);
        } catch {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 500);
    } catch (err: any) {
      setScanError(err.message || "Scan failed");
      setScanRunning(false);
    }
  };

  return {
    scanId, navigate,
    scan, project, findings, fileContents,
    loading, findingsLoading, error,
    severityFilter, handleSeverityFilter,
    providerFilter, setProviderFilter,
    allScans, allScansLoading,
    scanRunning, scanProgress, scanError,
    handleRunScan,
  };
}
