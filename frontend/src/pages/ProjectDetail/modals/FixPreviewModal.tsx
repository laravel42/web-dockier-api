import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { getErrorMessage } from "@/utils/errors";
import { diffLines, diffStats } from "@/pages/ProjectDetail/utils/lineDiff";
import type { FixPlan } from "@/services/git";

/**
 * The preview PRODUCT.md promises and the flow never had.
 *
 * "Fix with AI" used to generate a fix and open a pull request on the user's
 * repository in a single call — the first anyone saw of the change was a link to
 * it. Nothing here writes: the plan is already generated and held client-side,
 * and only "Create pull request" touches the repo.
 */

interface Props {
  open: boolean;
  plan: FixPlan | null;
  onClose: () => void;
  onCreatePullRequest: (plan: FixPlan) => Promise<void>;
}

export default function FixPreviewModal({ open, plan, onClose, onCreatePullRequest }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const diffs = useMemo(() => {
    if (!plan) return [];
    return plan.files.map((f) => {
      const rows = diffLines(f.before, f.after);
      return { ...f, rows, stats: diffStats(rows), isNew: f.before === "" };
    });
  }, [plan]);

  const totals = useMemo(
    () => diffs.reduce(
      (acc, d) => ({ added: acc.added + d.stats.added, removed: acc.removed + d.stats.removed }),
      { added: 0, removed: 0 },
    ),
    [diffs],
  );

  if (!plan) return null;

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      await onCreatePullRequest(plan);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={creating ? () => {} : onClose} title="Review the proposed fix" size="xl">
      <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-lg border border-ai-line bg-ai-surface px-3 py-2">
          <p className="text-sm text-ai-ink">
            Generated for issue #{plan.issueNumber}. <strong>Nothing has been written yet.</strong>
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-text">Summary</h3>
          <p className="mt-1 text-sm text-text-secondary">{plan.summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          <span>
            {plan.files.length} file{plan.files.length === 1 ? "" : "s"} changed
          </span>
          <span className="tabular-nums">
            <span className="text-success-ink">+{totals.added}</span>{" "}
            <span className="text-danger-ink">−{totals.removed}</span>
          </span>
          {/* Stated before the write, per the task's acceptance criteria. */}
          <span>
            Would open <span className="font-mono text-text">{plan.branchName}</span> into{" "}
            <span className="font-mono text-text">{plan.baseBranch}</span>
          </span>
        </div>

        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {diffs.map((file) => {
            const isOpen = expanded === file.path;
            return (
              <li key={file.path} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : file.path)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-card/60"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{file.path}</span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {file.isNew && <span className="mr-2 text-info-ink">new file</span>}
                    <span className="text-success-ink">+{file.stats.added}</span>{" "}
                    <span className="text-danger-ink">−{file.stats.removed}</span>
                  </span>
                </button>
                {isOpen && (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={`Diff for ${file.path}`}
                    className="max-h-80 overflow-auto border-t border-border bg-terminal font-mono text-xs/relaxed"
                  >
                    {file.rows.length === 0 ? (
                      <p className="px-3 py-2 text-text-muted">No changes in this file.</p>
                    ) : (
                      file.rows.map((row, i) => {
                        if (row.kind === "gap") {
                          return (
                            <p key={i} className="border-y border-border/40 bg-card/30 px-3 py-1 text-text-muted">
                              … {row.hidden} unchanged line{row.hidden === 1 ? "" : "s"}
                            </p>
                          );
                        }
                        const tone =
                          row.kind === "add" ? "bg-success-surface text-success-ink"
                          : row.kind === "remove" ? "bg-danger-surface text-danger-ink"
                          : "text-strong";
                        const sign = row.kind === "add" ? "+" : row.kind === "remove" ? "−" : " ";
                        return (
                          <p key={i} className={`flex gap-3 px-3 whitespace-pre-wrap break-all ${tone}`}>
                            <span aria-hidden="true" className="w-3 shrink-0 select-none">{sign}</span>
                            <span>{row.text || " "}</span>
                          </p>
                        );
                      })
                    )}
                  </div>
                )}
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
          {/* Cancel discards: the plan lives only in this component's state. */}
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Discard
          </Button>
          <Button onClick={() => void create()} loading={creating}>
            Create pull request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
