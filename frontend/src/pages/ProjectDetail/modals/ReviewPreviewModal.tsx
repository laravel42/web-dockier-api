import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { getErrorMessage } from "@/utils/errors";
import type { ReviewComment } from "@/services/git";

/**
 * Review comments land publicly on a colleague's pull request. Their author sees
 * them here first, and can drop any of them before posting.
 *
 * The old flow generated and posted in one call, so the first anyone saw of a
 * comment was on the PR — including the teammate it was addressed to.
 */

const SEVERITY: Record<ReviewComment["severity"], { label: string; cls: string; order: number }> = {
  critical: { label: "Critical", cls: "border-danger-line bg-danger-surface text-danger-ink", order: 0 },
  warning: { label: "Warning", cls: "border-warning-line bg-warning-surface text-warning-ink", order: 1 },
  suggestion: { label: "Suggestion", cls: "border-info-line bg-info-surface text-info-ink", order: 2 },
  praise: { label: "Praise", cls: "border-success-line bg-success-surface text-success-ink", order: 3 },
};

export interface GeneratedReview {
  summary: string;
  comments: ReviewComment[];
  approved: boolean;
}

interface Props {
  open: boolean;
  review: GeneratedReview | null;
  prNumber: number;
  onClose: () => void;
  onPost: (comments: ReviewComment[], approved: boolean) => Promise<void>;
}

const keyOf = (c: ReviewComment, i: number) => `${c.path}:${c.line}:${i}`;

export default function ReviewPreviewModal({ open, review, prNumber, onClose, onPost }: Props) {
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  // A reopened preview must not inherit the previous batch's exclusions.
  useEffect(() => {
    if (open) { setDropped(new Set()); setError(""); }
  }, [open, review]);

  const ordered = useMemo(
    () => (review?.comments ?? [])
      .map((c, i) => ({ c, key: keyOf(c, i) }))
      .sort((x, y) => SEVERITY[x.c.severity].order - SEVERITY[y.c.severity].order),
    [review],
  );

  const kept = ordered.filter(({ key }) => !dropped.has(key));

  const counts = useMemo(() => {
    const out: Partial<Record<ReviewComment["severity"], number>> = {};
    for (const { c } of kept) out[c.severity] = (out[c.severity] ?? 0) + 1;
    return out;
  }, [kept]);

  if (!review) return null;

  const toggle = (key: string) =>
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const post = async () => {
    setPosting(true);
    setError("");
    try {
      await onPost(kept.map(({ c }) => c), review.approved);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal open={open} onClose={posting ? () => {} : onClose} title="Review before posting" size="xl">
      <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-lg border border-ai-line bg-ai-surface px-3 py-2">
          <p className="text-sm text-ai-ink">
            These comments will be posted publicly on pull request #{prNumber}.{" "}
            <strong>Nothing has been posted yet.</strong>
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-text">Summary</h3>
          <p className="mt-1 text-sm text-text-secondary">{review.summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(Object.keys(SEVERITY) as ReviewComment["severity"][]).map((sev) =>
            counts[sev] ? (
              <span key={sev} className={`rounded-sm border px-1.5 py-0.5 font-medium tabular-nums ${SEVERITY[sev].cls}`}>
                {counts[sev]} {SEVERITY[sev].label.toLowerCase()}
              </span>
            ) : null,
          )}
          {dropped.size > 0 && (
            <span className="text-text-muted">
              {dropped.size} dropped from this batch
            </span>
          )}
        </div>

        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {ordered.map(({ c, key }) => {
            const isDropped = dropped.has(key);
            return (
              <li
                key={key}
                className={`rounded-lg border border-border p-3 transition-opacity ${isDropped ? "opacity-45" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-sm border px-1.5 py-0.5 text-xs font-medium ${SEVERITY[c.severity].cls}`}>
                        {SEVERITY[c.severity].label}
                      </span>
                      <span className="truncate font-mono text-xs text-text-muted">
                        {c.path}
                        {c.line > 0 && `:${c.line}`}
                      </span>
                    </div>
                    <p className={`mt-1.5 text-sm ${isDropped ? "text-text-muted line-through" : "text-text-secondary"}`}>
                      {c.body}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => toggle(key)} className="shrink-0">
                    {isDropped ? "Include" : "Drop"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="rounded-md border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        )}

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} disabled={posting}>
            Discard
          </Button>
          <Button onClick={() => void post()} loading={posting} disabled={kept.length === 0}>
            {kept.length === 0
              ? "No comments to post"
              : `Post ${kept.length} comment${kept.length === 1 ? "" : "s"} to PR #${prNumber}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
