import { useState } from "react";
import type { Project } from "../../../types";
import { cardCls } from "../../../utils/styles";
import { getRepoKey } from "../../../utils/parseOwnerRepo";
import ClipboardIcon from "../../../components/icons/outlined/ClipboardIcon";
import CheckIcon from "../../../components/icons/outlined/CheckIcon";
import ExternalLinkIcon from "../../../components/icons/outlined/ExternalLinkIcon";

interface Props {
  project: Project;
  deployUrl?: string;
}

function CopyableMonoValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5 mt-0.5 max-w-full">
      <span className="inline-block px-2 py-0.5 rounded bg-secondary-50 border border-border text-[11px] text-text-muted font-mono select-all">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        className="shrink-0 p-0.5 rounded text-text-muted hover:text-text transition-colors"
      >
        {copied ? <CheckIcon className="size-3.5 text-primary-500" /> : <ClipboardIcon className="size-3.5" />}
      </button>
    </span>
  );
}

export default function ProjectDetailsCard({ project, deployUrl }: Props) {
  const repoKey = project.repository ? getRepoKey(project.repository) : null;

  return (
    <div className={`${cardCls} p-5 h-full flex flex-col`}>
      <h2 className="text-sm font-semibold text-text mb-4">Details</h2>
      <div className="flex-1 flex flex-col space-y-3">
        <div>
          <p className="text-xs text-text-muted">Project ID</p>
          <CopyableMonoValue value={project.id} label="project ID" />
        </div>
        {repoKey && (
          <div>
            <p className="text-xs text-text-muted">Repository path</p>
            <CopyableMonoValue value={repoKey} label="repository path" />
          </div>
        )}
        {deployUrl && (
          <div className="mt-auto pt-3 border-t border-border min-h-[3.75rem]">
            <p className="text-xs text-text-muted">Deployment URL</p>
            <a
              href={deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-primary-500 hover:text-primary-700 transition-colors break-all"
            >
              {deployUrl}
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
