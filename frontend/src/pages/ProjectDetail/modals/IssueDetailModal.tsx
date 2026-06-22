import { useState } from "react";
import Modal from "../../../components/Modal";
import { btnPrimary, btnSecondary, btnDanger } from "../../../utils/styles";
import { timeAgo } from "../../../utils/timeAgo";
import type { RepoIssue } from "../../../types";
import AlertCircleIcon from "../../../components/icons/outlined/AlertCircleIcon";
import ChatBubbleIcon from "../../../components/icons/outlined/ChatBubbleIcon";
import Spinner from "../../../components/Spinner";

interface Props {
  issue: RepoIssue | null;
  onClose: () => void;
  onCloseIssue: (issueNumber: number) => Promise<void>;
  onFixWithAI: (issue: RepoIssue) => Promise<void>;
  fixResult: { prUrl: string; prNumber: number; summary: string; filesChanged: number } | null;
}

function Label({ name, color }: { name: string; color: string }) {
  if (color) {
    return (
      <span
        className="rounded-full border px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${color}20`, borderColor: `${color}55`, color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border bg-secondary-50/50 px-2 py-0.5 text-xs font-medium text-text-muted">
      {name}
    </span>
  );
}

export default function IssueDetailModal({ issue, onClose, onCloseIssue, onFixWithAI, fixResult }: Props) {
  const [closing, setClosing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState("");

  const handleClose = async () => {
    if (!issue) return;
    setClosing(true);
    setError("");
    try {
      await onCloseIssue(issue.number);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to close issue");
    } finally {
      setClosing(false);
    }
  };

  const handleFixWithAI = async () => {
    if (!issue) return;
    setFixing(true);
    setError("");
    try {
      await onFixWithAI(issue);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create fix branch");
    } finally {
      setFixing(false);
    }
  };

  return (
    <Modal open={issue !== null} onClose={onClose} title="Issue Details">
      {issue && (
        <div className="space-y-4">
          {/* Issue header */}
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="size-5 text-emerald-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-text leading-snug">{issue.title}</h3>
              <div className="mt-1 text-sm text-text-muted">
                #{issue.number} opened {timeAgo(issue.createdAt)}
                {issue.author && ` by ${issue.author}`}
              </div>
            </div>
          </div>

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {issue.labels.map((label) => (
                <Label key={label.name} name={label.name} color={label.color} />
              ))}
            </div>
          )}

          {/* Issue body / description */}
          {issue.body && (
            <div className="rounded-lg border border-border/50 bg-secondary-50/30 p-3 max-h-60 overflow-y-auto">
              <pre className="text-sm text-text whitespace-pre-wrap break-words font-sans leading-relaxed">
                {issue.body}
              </pre>
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 text-sm text-text-muted">
            {issue.comments > 0 && (
              <span className="flex items-center gap-1.5">
                <ChatBubbleIcon className="size-4" />
                {issue.comments} comment{issue.comments !== 1 ? "s" : ""}
              </span>
            )}
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
            >
              View on repository →
            </a>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
              {error}
            </div>
          )}

          {/* Fix result */}
          {fixResult && (
            <div className="rounded-lg border border-success-500/30 bg-success-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="size-4 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-success-500">Pull request created</span>
              </div>
              <p className="text-sm text-text">{fixResult.summary}</p>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>{fixResult.filesChanged} file{fixResult.filesChanged !== 1 ? "s" : ""} changed</span>
                <a
                  href={fixResult.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  View PR #{fixResult.prNumber} →
                </a>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-4 border-t border-border/50">
            <button
              type="button"
              onClick={handleFixWithAI}
              disabled={fixing || closing || !!fixResult}
              className={btnPrimary}
            >
              {fixing ? <Spinner className="size-3.5" /> : null}
              {fixResult ? "Fix Created" : fixing ? "Generating fix…" : "Fix with AI"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={closing || fixing}
              className={`${btnDanger} h-8 px-3 inline-flex items-center gap-1.5`}
            >
              {closing ? <Spinner className="size-3.5" /> : null}
              Close Issue
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
