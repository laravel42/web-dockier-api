import { useState } from "react";
import type { RepoAnalysis } from "../../../components/DeployWizard";
import { markdownToHtml } from "../../../utils/markdownToHtml";
import { cardCls } from "../../../utils/styles";
import Spinner from "../../../components/Spinner";

interface Props {
  analysis: RepoAnalysis | null;
  analysisLoading: boolean;
}

const TABS = [
  { key: "overview",     label: "Overview",              icon: "📋" },
  { key: "howItWorks",   label: "How It Works",          icon: "⚙️" },
  { key: "techStack",    label: "Tech Stack",            icon: "🧩" },
  { key: "architecture", label: "Architecture",          icon: "🏗️" },
  { key: "dataStorage",  label: "Data & Storage",        icon: "🗄️" },
  { key: "codeQuality",  label: "Code Quality",          icon: "✅" },
  { key: "security",     label: "Security",              icon: "🔐" },
  { key: "deployment",   label: "Deployment",            icon: "🚀" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function ProjectDescription({ analysis, analysisLoading }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const sections = analysis?.aiAnalysis?.sections;
  const description = analysis?.aiAnalysis?.description;
  const summary = analysis?.aiAnalysis?.summary
    || (analysis?.techStack?.length
      ? `${analysis.primaryLanguage || analysis.techStack[0]?.name} project using ${analysis.techStack.slice(0, 4).map(t => t.name).join(", ")}${analysis.hasDocker ? ". Docker-ready" : ""}${analysis.hasCi ? " with CI/CD configured" : ""}.`
      : null);

  if (analysisLoading) {
    return (
      <div className={`${cardCls} p-8 mb-6`}>
        <div className="flex items-center gap-3">
          <Spinner className="w-5 h-5" />
          <span className="text-sm text-text-muted">Analyzing project…</span>
        </div>
      </div>
    );
  }

  // If we have sections, render tabbed UI
  if (sections && Object.values(sections).some(v => v)) {
    const availableTabs = TABS.filter(t => sections[t.key]);

    return (
      <div className={`${cardCls} mb-6 overflow-hidden`}>
        <div className="h-1 bg-gradient-to-r from-primary-500 via-primary-400 to-primary-300" />

        <div className="px-5 pt-4 pb-5">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-md bg-primary-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-text">Project Overview</h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 overflow-x-auto pb-2 mb-3 border-b border-border scrollbar-none">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? "bg-primary-100 text-primary-700"
                    : "text-text-muted hover:text-text hover:bg-secondary-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="notion-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(sections[activeTab] || "") }} />
        </div>

        <style>{notionStyles}</style>
      </div>
    );
  }

  // Fallback: single description or summary
  if (!description && !summary) return null;

  return (
    <div className={`${cardCls} mb-6 overflow-hidden`}>
      <div className="h-1 bg-gradient-to-r from-primary-500 via-primary-400 to-primary-300" />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-md bg-primary-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-text">Project Overview</h2>
        </div>
        {description ? (
          <div className="notion-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(description) }} />
        ) : (
          <p className="text-sm text-text leading-relaxed">{summary}</p>
        )}
      </div>
      <style>{notionStyles}</style>
    </div>
  );
}

const notionStyles = `
  .notion-content h1 { font-size: 1.125rem; font-weight: 700; color: var(--color-text); margin-top: 1rem; margin-bottom: 0.25rem; line-height: 1.3; }
  .notion-content h2 { font-size: 0.95rem; font-weight: 600; color: var(--color-text); margin-top: 1rem; margin-bottom: 0.25rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--color-border); line-height: 1.4; }
  .notion-content h2:first-child { margin-top: 0; }
  .notion-content h3 { font-size: 0.875rem; font-weight: 600; color: var(--color-text); margin-top: 0.75rem; margin-bottom: 0.25rem; }
  .notion-content p { font-size: 0.8125rem; line-height: 1.6; color: var(--color-text-secondary, var(--color-text)); margin-bottom: 0.375rem; }
  .notion-content ul, .notion-content ol { margin: 0.25rem 0 0.5rem 0; padding-left: 0; list-style: none; }
  .notion-content li { font-size: 0.8125rem; line-height: 1.6; color: var(--color-text-secondary, var(--color-text)); padding: 0.0625rem 0 0.0625rem 1.125rem; position: relative; }
  .notion-content ul li::before { content: ""; position: absolute; left: 0.25rem; top: 0.625rem; width: 4px; height: 4px; border-radius: 50%; background: var(--color-primary-400, #818cf8); }
  .notion-content ol { counter-reset: item; }
  .notion-content ol li { counter-increment: item; }
  .notion-content ol li::before { content: counter(item) "."; position: absolute; left: 0; font-size: 0.75rem; font-weight: 600; color: var(--color-primary-500, #6366f1); }
  .notion-content strong { font-weight: 600; color: var(--color-text); }
  .notion-content em { font-style: italic; }
  .notion-content code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.75rem; background: var(--color-secondary-100, #f1f5f9); color: var(--color-primary-600, #4f46e5); padding: 0.0625rem 0.3rem; border-radius: 0.1875rem; }
  .notion-content a { color: var(--color-primary-500, #6366f1); text-decoration: none; }
  .notion-content a:hover { text-decoration: underline; }
  .notion-content hr { border: none; border-top: 1px solid var(--color-border); margin: 0.75rem 0; }
`;
