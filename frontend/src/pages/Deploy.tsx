import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { deployApi, projectsApi, gitApi } from "../services/api";
import DevIcon from "../components/DevIcon";

const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

interface Deployment {
  id: string;
  providerId: string;
  repo: string;
  branch: string;
  status: string;
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId?: string;
  platform?: string;
}

function repoKey(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) return parts.join("/");
  } catch {}
  return repoUrl;
}

export default function Deploy() {
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectLangs, setProjectLangs] = useState<Record<string, Array<{ name: string; category: string; confidence: number }>>>({});
  const fetchedLangsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dRes, projRes] = await Promise.all([
          deployApi.listDeployments(),
          projectsApi.list(),
        ]);
        setDeployments(dRes.deployments);
        setProjects(projRes.projects);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Fetch tech badges from analysis_cache for each project
  useEffect(() => {
    if (projects.length === 0) return;
    for (const p of projects) {
      if (!p.repository || fetchedLangsRef.current.has(p.id)) continue;
      fetchedLangsRef.current.add(p.id);
      const key = repoKey(p.repository);
      gitApi.getRepoBadges(key, p.branch || undefined)
        .then((res) => {
          if (res.badges && res.badges.length > 0) {
            setProjectLangs(prev => ({ ...prev, [p.id]: res.badges }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

  // Match deployments to projects by repo key
  const projectByRepo: Record<string, Project> = {};
  for (const p of projects) {
    const key = repoKey(p.repository);
    projectByRepo[key] = p;
  }

  // Group deployments by repo
  const grouped = deployments.reduce<Record<string, Deployment[]>>((acc, d) => {
    (acc[d.repo] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Deployments</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : deployments.length === 0 ? (
        <div className={`${cardCls} p-12 text-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
          <p className="text-sm text-text-muted mb-4">No deployments yet. Deploy from a project page to get started.</p>
          <button onClick={() => navigate("/projects")} className={btnSecondary}>Go to Projects</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Object.entries(grouped)
            .sort(([, a], [, b]) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime())
            .map(([repo, repoDeploys]) => {
              const proj = projectByRepo[repo];
              const sorted = repoDeploys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const latest = sorted[0];
              const statusDot = latest.status === "success" ? "bg-success-500"
                : latest.status === "failed" ? "bg-danger-500"
                : latest.status === "building" || latest.status === "deploying" ? "bg-primary-500"
                : "bg-secondary-400";

              return (
                <div
                  key={repo}
                  onClick={() => navigate(`/deploy/${latest.id}`)}
                  className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
                >
                  {/* Header: rocket icon + deploy count */}
                  <div className="flex items-center gap-3 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    </svg>
                    <span className="text-sm text-text-secondary truncate">{sorted.length} deploy{sorted.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Project name */}
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-text truncate">{proj?.name || repo}</h3>
                    {(() => {
                      const badges = proj ? projectLangs[proj.id] : null;
                      if (badges && badges.length > 0) {
                        const langIconMap: Record<string, string> = {
                          JavaScript: "javascript", TypeScript: "typescript", Python: "python", PHP: "php",
                          Java: "java", Go: "go", Ruby: "ruby", Rust: "rust", "C#": "csharp", "C++": "cplusplus",
                          C: "c", Kotlin: "kotlin", Swift: "swift", Shell: "bash", HTML: "html5", CSS: "css3",
                          Vue: "vuejs", SCSS: "sass", Dockerfile: "docker", Elixir: "elixir", Dart: "dart",
                          "Node.js": "nodejs", React: "react", Angular: "angularjs", Laravel: "laravel",
                          Django: "django", Rails: "rails", "Next.js": "nextjs", Express: "express",
                          Flask: "flask", Spring: "spring", ".NET": "dot-net",
                        };
                        const langLabel: Record<string, string> = {
                          JavaScript: "JS", TypeScript: "TS", Python: "PY", "C++": "C++", "C#": "C#",
                          Dockerfile: "Docker", Shell: "SH", Kotlin: "KT", Swift: "SW", Scala: "SC",
                          HTML: "HTML", CSS: "CSS", SCSS: "SCSS", "Node.js": "Node",
                        };
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {badges.slice(0, 4).map((b) => (
                              <span key={b.name} className="inline-flex items-center gap-1.5 px-1 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0 whitespace-nowrap">
                                <DevIcon src={langIconMap[b.name] || b.name.toLowerCase()} className="w-4 h-4" />
                                {langLabel[b.name] || b.name}
                              </span>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Last deploy status + branch */}
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                      <span className="text-xs text-text-muted">
                        Last deploy: {new Date(latest.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      {latest.branch}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
