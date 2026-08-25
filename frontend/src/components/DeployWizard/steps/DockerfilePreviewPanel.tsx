import { useState } from "react";
import { SparklesIcon, CheckIcon, TriangleAlertIcon, FileCodeIcon } from "lucide-react";
import Spinner from "@/components/Spinner";
import DockerfileIcon from "@/components/icons/filled/DockerfileIcon";
import type { DockerfilePreviewResult } from "@/services/deploy";

interface Props {
  preview: DockerfilePreviewResult | null;
  loading: boolean;
  error: string;
  /** When the user opted to use their own repo Dockerfile, we don't preview/review. */
  useRepoDockerfile: boolean;
}

function DockerfileBlock({ content }: { content: string }) {
  return (
    <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-text-secondary">
      {content}
    </pre>
  );
}

export default function DockerfilePreviewPanel({ preview, loading, error, useRepoDockerfile }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);

  // The user maintains their own Dockerfile — nothing to generate or review.
  if (useRepoDockerfile) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2">
          <DockerfileIcon className="size-4 text-primary-500" />
          <span className="text-sm font-medium text-text">Using your repository Dockerfile</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Dockier will build with the Dockerfile committed in your repo. The AI review only runs on Dockier-generated Dockerfiles.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        <Spinner className="size-4" />
        <span className="text-sm text-text-muted">Analyzing your repository…</span>
      </div>
    );
  }

  // Non-blocking: a preview failure never stops the deploy.
  if (error) {
    return (
      <div className="rounded-lg border border-caution-line bg-caution-surface px-3 py-2 text-xs text-caution-ink">
        {error}. You can still continue and deploy.
      </div>
    );
  }

  if (!preview) return null;

  const footnote = (
    <p className="mt-2 text-[11px] text-text-muted">
      Preview of the current branch — the deploy regenerates the Dockerfile against the commit it builds.
    </p>
  );

  // Only the generated path reaches here: a repo-sourced preview is short-circuited
  // by the `useRepoDockerfile` card above (the backend reports source "repo" only
  // when that flag is set), so there is no separate repo branch to render.
  const header = (() => {
    if (preview.revised) {
      return (
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary-500" />
          <span className="text-sm font-medium text-text">AI improved your Dockerfile</span>
        </div>
      );
    }
    // A skipped review is NOT an approval — fall through to the neutral header
    // so the skip note below is the only claim made about the review.
    if (preview.aiEnabled && !preview.skipReason) {
      return (
        <div className="flex items-center gap-2">
          <CheckIcon className="size-4 text-success-ink" />
          <span className="text-sm font-medium text-text">Dockerfile looks good — no changes needed</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <FileCodeIcon className="size-4 text-primary-500" />
        <span className="text-sm font-medium text-text">Generated Dockerfile</span>
      </div>
    );
  })();

  return (
    <div>
      {header}

      {/* AI change list (revised only) */}
      {preview.revised && preview.changes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {preview.changes.map((c, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <SparklesIcon className="mt-0.5 size-3 shrink-0 text-primary-500" />
              <span className="text-text-secondary">
                <span className="font-medium text-text">{c.what}</span>
                {c.why ? <span className="text-text-muted"> — {c.why}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Review skipped/unavailable note */}
      {preview.aiEnabled && !preview.revised && preview.skipReason && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
          <TriangleAlertIcon className="size-3" />
          AI review was skipped ({preview.skipReason}) — showing the generated Dockerfile.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          {preview.revised ? "Final Dockerfile" : "Dockerfile"}
        </p>
        {preview.revised && (
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="text-xs text-primary-500 hover:underline"
          >
            {showOriginal ? "Hide original" : "View original"}
          </button>
        )}
      </div>

      <DockerfileBlock content={showOriginal ? preview.mechanicalDockerfile : preview.finalDockerfile} />
      {showOriginal && (
        <p className="mt-1 text-[11px] text-text-muted">Original (before AI review).</p>
      )}
      {footnote}
    </div>
  );
}
