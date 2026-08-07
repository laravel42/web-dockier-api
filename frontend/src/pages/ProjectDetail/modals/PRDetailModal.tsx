import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import { btnPrimary, btnSecondary } from "@/utils/styles";
import { timeAgo } from "@/utils/timeAgo";
import type { RepoPullRequest } from "@/types";
import GitBranchIcon from "@/components/icons/outlined/GitBranchIcon";
import Spinner from "@/components/Spinner";

interface ReviewResult {
  summary: string;
  comments: Array<{ path: string; line: number; body: string; severity: string }>;
  approved: boolean;
  reviewUrl: string;
}

interface Props {
  pr: RepoPullRequest | null;
  onClose: () => void;
  onReviewWithAI: (pr: RepoPullRequest) => Promise<ReviewResult>;
}

export default function PRDetailModal({ pr, onClose, onReviewWithAI }: Props) {
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");

  // Reset state when a different PR is selected
  useEffect(() => {
    setReviewResult(null);
    setError("");
  }, [pr?.number]);

  const handleReview = async () => {
    if (!pr) return;
    setReviewing(true);
    setError("");
    try {
      const result = await onReviewWithAI(pr);
      setReviewResult(result);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to review PR");
    } finally {
      setReviewing(false);
    }
  };

  const handleClose = () => {
    setReviewResult(null);
    setError("");
    onClose();
  };

  return (
    <Modal open={pr !== null} onClose={handleClose} title="Pull Request Details" size="lg">
      {pr && (
        <div className="space-y-4">
          {/* PR header */}
          <div className="flex items-start gap-3">
            <GitBranchIcon className="size-5 text-primary-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-text leading-snug">{pr.title}</h3>
              <div className="mt-1 text-sm text-text-muted">
                #{pr.number} opened {timeAgo(pr.createdAt)}
                {pr.author && ` by ${pr.author}`}
              </div>
            </div>
            {pr.draft && (
              <span className="rounded-full border border-border bg-secondary-50/50 px-2 py-0.5 text-xs font-medium text-text-muted shrink-0">
                Draft
              </span>
            )}
          </div>

          {/* PR body / description */}
          {pr.body && (
            <div className="rounded-lg border border-border/50 bg-secondary-50/30 p-3 max-h-40 overflow-y-auto">
              <pre className="text-sm text-text whitespace-pre-wrap break-words font-sans leading-relaxed">
                {pr.body}
              </pre>
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <a
              href={pr.url}
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

          {/* Review result */}
          {reviewResult && (
            <div className={`rounded-lg border p-3 ${reviewResult.approved ? "border-success-500/30 bg-success-500/5" : "border-warning-500/30 bg-warning-500/5"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-medium ${reviewResult.approved ? "text-success-500" : "text-warning-500"}`}>
                  {reviewResult.approved ? "✓ Approved" : "⚠ Changes requested"}
                </span>
                <span className="text-xs text-text-muted">
                  {reviewResult.comments.length} comment{reviewResult.comments.length !== 1 ? "s" : ""} posted on PR
                </span>
              </div>
              <p className="text-sm text-text mt-1">{reviewResult.summary}</p>
              {reviewResult.reviewUrl && (
                <a
                  href={reviewResult.reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  View review on repository →
                </a>
              )}
            </div>
          )}

          {/* Reviewing state */}
          {reviewing && (
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary-50/30 p-4">
              <Spinner className="size-5" />
              <div>
                <p className="text-sm font-medium text-text">Reviewing pull request…</p>
                <p className="text-xs text-text-muted mt-0.5">AI is analyzing the diff and posting comments directly on the PR</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={handleReview}
              disabled={reviewing || !!reviewResult}
              className={btnPrimary}
            >
              {reviewing ? <Spinner className="size-3.5" /> : null}
              {reviewResult ? "Review Posted" : reviewing ? "Reviewing…" : "Review with AI"}
            </button>
            <div className="flex-1" />
            <button type="button" onClick={handleClose} className={btnSecondary}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
