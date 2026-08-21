import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FixPreviewModal from "../pages/ProjectDetail/modals/FixPreviewModal";
import ReviewPreviewModal from "../pages/ProjectDetail/modals/ReviewPreviewModal";
import { diffLines, diffStats } from "../pages/ProjectDetail/utils/lineDiff";
import type { FixPlan, ReviewComment } from "@/services/git";

/**
 * Epic E. Both flows used to generate *and* write in a single call: a pull
 * request appeared on the user's repository, and review comments appeared
 * publicly on a colleague's, before anyone had seen either. These cover the
 * guarantee that replaced that — nothing is written until a second, explicit act.
 */

const plan: FixPlan = {
  summary: "Guard against a null session before reading the user id.",
  prDescription: "Adds a null check.",
  branchName: "fix/42-null-session",
  baseBranch: "main",
  issueNumber: 42,
  issueTitle: "Crash on logout",
  files: [
    { path: "src/auth.ts", before: "const id = session.user.id;\nreturn id;", after: "const id = session?.user?.id;\nreturn id;" },
    { path: "src/new.ts", before: "", after: "export const x = 1;" },
  ],
};

describe("FixPreviewModal", () => {
  const setup = (over: Partial<Parameters<typeof FixPreviewModal>[0]> = {}) => {
    const onCreatePullRequest = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <FixPreviewModal open plan={plan} onClose={onClose} onCreatePullRequest={onCreatePullRequest} {...over} />,
    );
    return { onCreatePullRequest, onClose, user: userEvent.setup() };
  };

  it("says plainly that nothing has been written", () => {
    setup();
    expect(screen.getByText(/Nothing has been written yet/)).toBeInTheDocument();
  });

  it("states the target branch before any write", () => {
    setup();
    expect(screen.getByText("fix/42-null-session")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("lists the changed files with their counts", () => {
    setup();
    expect(screen.getByText("src/auth.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(screen.getByText("2 files changed")).toBeInTheDocument();
  });

  it("marks a file that did not exist before as new", () => {
    setup();
    expect(screen.getByText("new file")).toBeInTheDocument();
  });

  it("opens no pull request on render — only on the explicit second action", async () => {
    const { onCreatePullRequest, user } = setup();
    expect(onCreatePullRequest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Create pull request" }));
    expect(onCreatePullRequest).toHaveBeenCalledTimes(1);
    expect(onCreatePullRequest).toHaveBeenCalledWith(plan);
  });

  it("discards without touching the repository", async () => {
    const { onCreatePullRequest, onClose, user } = setup();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreatePullRequest).not.toHaveBeenCalled();
  });

  it("shows the diff when a file is expanded", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /src\/auth\.ts/ }));
    const region = screen.getByRole("region", { name: "Diff for src/auth.ts" });
    expect(within(region).getByText("const id = session.user.id;")).toBeInTheDocument();
    expect(within(region).getByText("const id = session?.user?.id;")).toBeInTheDocument();
  });

  it("surfaces a failure instead of closing", async () => {
    const onCreatePullRequest = vi.fn().mockRejectedValue(new Error("Branch already exists"));
    const { user } = setup({ onCreatePullRequest });
    await user.click(screen.getByRole("button", { name: "Create pull request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Branch already exists");
  });
});

const comment = (over: Partial<ReviewComment> = {}): ReviewComment => ({
  path: "src/a.ts", line: 10, body: "Possible null dereference", severity: "critical", ...over,
});

const review = {
  summary: "Two issues worth addressing.",
  approved: false,
  comments: [
    comment(),
    comment({ path: "src/b.ts", line: 4, body: "Consider extracting this", severity: "suggestion" }),
    comment({ path: "src/c.ts", line: 7, body: "Nice use of the guard clause", severity: "praise" }),
  ],
};

describe("ReviewPreviewModal", () => {
  const setup = (over: Partial<Parameters<typeof ReviewPreviewModal>[0]> = {}) => {
    const onPost = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ReviewPreviewModal open review={review} prNumber={7} onClose={onClose} onPost={onPost} {...over} />,
    );
    return { onPost, onClose, user: userEvent.setup() };
  };

  it("says plainly that nothing has been posted", () => {
    setup();
    expect(screen.getByText(/Nothing has been posted yet/)).toBeInTheDocument();
  });

  it("names the count and the target PR on the action", () => {
    setup();
    expect(screen.getByRole("button", { name: "Post 3 comments to PR #7" })).toBeInTheDocument();
  });

  it("shows severities as counts", () => {
    setup();
    expect(screen.getByText("1 critical")).toBeInTheDocument();
    expect(screen.getByText("1 suggestion")).toBeInTheDocument();
    expect(screen.getByText("1 praise")).toBeInTheDocument();
  });

  it("posts nothing on render", () => {
    const { onPost } = setup();
    expect(onPost).not.toHaveBeenCalled();
  });

  it("drops a comment from the batch and posts only the rest", async () => {
    const { onPost, user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Drop" })[0]);

    expect(screen.getByRole("button", { name: "Post 2 comments to PR #7" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Post 2 comments to PR #7" }));

    const posted = onPost.mock.calls[0][0] as ReviewComment[];
    expect(posted).toHaveLength(2);
    expect(posted.map((c) => c.path)).not.toContain("src/a.ts");
  });

  it("can put a dropped comment back", async () => {
    const { user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Drop" })[0]);
    await user.click(screen.getByRole("button", { name: "Include" }));
    expect(screen.getByRole("button", { name: "Post 3 comments to PR #7" })).toBeInTheDocument();
  });

  it("refuses to post an empty batch", async () => {
    const { onPost, user } = setup();
    for (const b of screen.getAllByRole("button", { name: "Drop" })) await user.click(b);
    const action = screen.getByRole("button", { name: "No comments to post" });
    expect(action).toBeDisabled();
    expect(onPost).not.toHaveBeenCalled();
  });

  it("orders critical comments first", () => {
    setup();
    const bodies = screen.getAllByText(/null dereference|extracting this|guard clause/);
    expect(bodies[0]).toHaveTextContent("null dereference");
  });
});

describe("lineDiff", () => {
  it("reports added and removed lines", () => {
    const rows = diffLines("a\nb\nc", "a\nB\nc");
    expect(diffStats(rows)).toEqual({ added: 1, removed: 1 });
  });

  it("treats an empty before as all additions", () => {
    expect(diffStats(diffLines("", "x\ny"))).toEqual({ added: 2, removed: 0 });
  });

  it("returns nothing for identical content", () => {
    expect(diffLines("same\ntext", "same\ntext")).toEqual([]);
  });

  it("collapses long unchanged stretches into a gap", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 20", "line twenty");
    const rows = diffLines(before, after);
    expect(rows.some((r) => r.kind === "gap")).toBe(true);
    // and keeps the change itself
    expect(rows.some((r) => r.kind === "add" && r.text === "line twenty")).toBe(true);
  });

  it("keeps context around a change", () => {
    const rows = diffLines("1\n2\n3\n4\n5", "1\n2\nX\n4\n5");
    expect(rows.filter((r) => r.kind === "context").length).toBeGreaterThan(0);
  });
});
