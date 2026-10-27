import SearchSelect from "./ui/SearchSelect";
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

export default function BranchSelect({ value, onChange, branches, loading, onReload, labelledBy }: Props) {
  // The project's branch may be gone from the remote. Keep it in the list so
  // the trigger still names what is actually configured.
  const items = value && !branches.includes(value) ? [value, ...branches] : branches;

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={items}
      getValue={(b) => b}
      renderItem={(b) => (
        <>
          <CodeXmlIcon className="size-4 shrink-0 text-text-muted" />
          <span className="truncate">{b}</span>
        </>
      )}
      matches={(b, q) => b.toLowerCase().includes(q)}
      placeholder="Select a branch…"
      listLabel="Branches"
      searchPlaceholder="Search branches…"
      labelledBy={labelledBy}
      loading={loading}
      emptyMessage="No branches found."
      noMatchLabel={() => "No branches found"}
      footer={onReload ? () => (
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReload(); }}
            className="text-sm font-medium text-primary-500 transition-colors hover:text-primary-400"
          >
            Reload branches
          </button>
        </div>
      ) : undefined}
    />
  );
}
