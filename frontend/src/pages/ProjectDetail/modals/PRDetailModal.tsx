import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import MarkdownViewer from "@/components/MarkdownViewer";
import { MarkdownBodyFrame, type MarkdownBodyView } from "@/components/MarkdownBodyFrame";
import { timeAgo } from "@/utils/timeAgo";
import type { RepoPullRequest } from "@/types";
import GitBranchIcon from "@/components/icons/outlined/GitBranchIcon";
import Spinner from "@/components/Spinner";

interface GeneratedReview {
  summary: string;
  comments: Array<{ path: string; line: number; body: string; severity: string }>;
  approved: boolean;
}

interface Props {
  pr: RepoPullRequest | null;
  onClose: () => void;
  onReviewWithAI: (pr: RepoPullRequest) => Promise<GeneratedReview>;
}

export default function PRDetailModal({ pr, onClose, onReviewWithAI }: Props) {
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<GeneratedReview | null>(null);
  const [error, setError] = useState("");
  const [bodyView, setBodyView] = useState<MarkdownBodyView>("preview");

  // Reset state when a different PR is selected
  useEffect(() => {
    setReviewResult(null);
    setError("");
    setBodyView("preview");
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
              <h3 className="text-base/snug font-semibold text-text ">{pr.title}</h3>
              <div className="mt-1 text-sm text-text-muted">
                #{pr.number} opened {timeAgo(pr.createdAt)}
                {pr.author && ` by ${pr.author}`}
              </div>
            </div>
            {pr.draft && (
              <span className="rounded-sm border border-border bg-secondary-50/50 px-2 py-0.5 text-xs font-medium text-text-muted shrink-0">
                Draft
              </span>
            )}
          </div>

          {/* PR body / description */}
          {pr.body && (
            <MarkdownBodyFrame
              view={bodyView}
              onViewChange={setBodyView}
              className="max-h-80"
              preview={<MarkdownViewer markdown={pr.body} />}
              raw={
                <textarea
                  readOnly
                  value={pr.body}
                  aria-label="Pull request body (raw markdown)"
                  className="block w-full min-h-[12rem] resize-none border-0 bg-transparent p-0 font-mono text-xs/relaxed text-text outline-none"
                />
              }
            />
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
                  {reviewResult.comments.length} comment{reviewResult.comments.length !== 1 ? "s" : ""} ready to review
                </span>
              </div>
              <p className="text-sm text-text mt-1">{reviewResult.summary}</p>

            </div>
          )}

          {/* Reviewing state */}
          {reviewing && (
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary-50/30 p-4">
              <Spinner className="size-5" />
              <div>
                <p className="text-sm font-medium text-text">Reading the diff…</p>
                <p className="mt-0.5 text-xs text-text-muted">Comments are generated for your review. Nothing is posted yet.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            {/*
              Readable before it is true. This used to appear only in the spinner,
              which is to say only once the model was already running.
            */}
            <p className="text-xs/relaxed text-text-muted">
              Reads the full diff and drafts review comments. You see every comment and
              choose which to post — comments appear publicly on this pull request, under
              your account, only after you confirm.
            </p>
            <div className="flex items-center justify-end gap-2">
            <Button
              variant="primary"
              className="h-8 border border-primary-foreground/20"
              onClick={handleReview}
              disabled={reviewing || !!reviewResult}
              loading={reviewing}
            >
              {reviewResult ? "Comments generated" : "Draft review with AI"}
            </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
