import SearchSelect from "./ui/SearchSelect";
import SourceControlBadge, { getSourceControl } from "./SourceControlBadge";
import type { Connection } from "../types";

interface Props {
  value: string;
  /** id of the visible <label> that names this control. */
  labelledBy?: string;
  onChange: (id: string) => void;
  connections: Connection[];
  loading?: boolean;
}

export default function SourceControlSelect({ value, onChange, connections, loading, labelledBy }: Props) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={connections}
      getValue={(c) => c.id}
      renderItem={(c) => (
        <>
          <SourceControlBadge provider={c.provider} showName={false} />
          <span className="truncate">{c.label} ({getSourceControl(c.provider).name})</span>
        </>
      )}
      matches={(c, q) =>
        c.label.toLowerCase().includes(q) || (getSourceControl(c.provider)?.name.toLowerCase().includes(q) ?? false)
      }
      placeholder="Select a source control…"
      listLabel="Source control connections"
      searchPlaceholder="Search connections…"
      labelledBy={labelledBy}
      loading={loading}
      emptyMessage="No git connections found. Add one in Settings → Git Integration."
      noMatchLabel={() => "No connections found"}
    />
  );
}
