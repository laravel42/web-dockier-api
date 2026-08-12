import GitBranchIcon from "./icons/outlined/GitBranchIcon";

interface Props {
  branch: string;
  commit?: string;
  onClick?: () => void;
  size?: "default" | "compact" | "sidebar";
}

const labelBaseCls =
  "inline-flex items-center border border-border/60 bg-secondary-50/50 min-w-0 max-w-full";
const labelInteractiveCls =
  "hover:border-primary/30 hover:bg-primary/5 transition-colors";

const SIZE_STYLES = {
  default: {
    pad: "px-2 py-0.5 gap-1.5 rounded-md",
    icon: "size-3.5",
    text: "text-xs",
    showIcon: true,
  },
  compact: {
    pad: "px-1 py-px gap-0.5 rounded-md",
    icon: "size-3",
    text: "text-xs",
    showIcon: true,
  },
  sidebar: {
    pad: "branch-badge--sidebar gap-0.5 rounded",
    icon: "size-2.5",
    text: "text-xs leading-none",
    showIcon: true,
  },
} as const;

export default function BranchCommitLabel({ branch, commit, onClick, size = "default" }: Props) {
  const styles = SIZE_STYLES[size];
  const content = (
    <>
      {styles.showIcon && (
        <GitBranchIcon className={`${styles.icon} shrink-0 text-text-muted`} />
      )}
      <span className={`font-medium text-text truncate ${styles.text}`}>{branch}</span>
      {commit && (
        <>
          <span className="text-text-muted/40 shrink-0 text-xs">·</span>
          <span className={`font-mono text-primary-500 shrink-0 tabular-nums ${styles.text}`}>
            {commit.slice(0, 7)}
          </span>
        </>
      )}
    </>
  );

  if (!onClick) {
    return (
      <span className={`${labelBaseCls} ${styles.pad} text-left`}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`${labelBaseCls} ${labelInteractiveCls} ${styles.pad} m-0 appearance-none cursor-pointer text-left`}
    >
      {content}
    </button>
  );
}
