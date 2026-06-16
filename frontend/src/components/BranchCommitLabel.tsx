import GitBranchIcon from "./icons/outlined/GitBranchIcon";

interface Props {
  branch: string;
  commit?: string;
  onClick?: () => void;
}

const labelCls =
  "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary-50/50 px-2 py-0.5 text-xs hover:border-primary/30 hover:bg-primary/5 transition-colors min-w-0 max-w-full shrink-0";

export default function BranchCommitLabel({ branch, commit, onClick }: Props) {
  const content = (
    <>
      <GitBranchIcon className="size-3.5 shrink-0 text-text-muted" />
      <span className="font-medium text-text truncate">{branch}</span>
      {commit && (
        <>
          <span className="text-text-muted/40 shrink-0">·</span>
          <span className="font-mono text-primary-500 shrink-0 tabular-nums">{commit.slice(0, 7)}</span>
        </>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${labelCls} cursor-pointer text-left`}>
        {content}
      </button>
    );
  }

  return <span className={labelCls}>{content}</span>;
}
