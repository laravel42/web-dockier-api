import { Combobox } from "./ui/Combobox";
import Spinner from "./Spinner";
import { CodeXmlIcon } from "lucide-react";

interface Props {
  value: string;
  /** id of the visible <label> that names this control. */
  labelledBy?: string;
  onChange: (branch: string) => void;
  branches: string[];
  loading?: boolean;
  onReload?: () => void;
}

function branchOption(branch: string) {
  return {
    value: branch,
    label: branch,
    content: (
      <>
        <CodeXmlIcon className="size-4 shrink-0 text-text-muted" />
        <span className="truncate">{branch}</span>
      </>
    ),
  };
}

export default function BranchSelect({ value, onChange, branches, loading, onReload, labelledBy }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <Spinner className="size-4" />
        Loading…
      </div>
    );
  }

  if (branches.length === 0 && !value) {
    return <p className="py-2 text-sm text-text-muted">No branches found.</p>;
  }

  // The project's branch may be gone from the remote. Keep it in the list so
  // the trigger still names what is actually configured.
  const names = value && !branches.includes(value) ? [value, ...branches] : branches;

  return (
    <Combobox
      value={value}
      onValueChange={onChange}
      options={names.map(branchOption)}
      placeholder="Select a branch…"
      searchPlaceholder="Search branches…"
      emptyMessage="No branches found"
      aria-labelledby={labelledBy}
      aria-label="Branch"
      footer={onReload ? () => (
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onReload}
            className="text-sm font-medium text-primary-500 transition-colors hover:text-primary-400"
          >
            Reload branches
          </button>
        </div>
      ) : undefined}
    />
  );
}
