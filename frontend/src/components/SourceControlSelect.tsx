import { Combobox } from "./ui/Combobox";
import SourceControlBadge, { getSourceControl } from "./SourceControlBadge";
import Spinner from "./Spinner";
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
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <Spinner className="size-4" />
        Loading…
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <p className="py-2 text-sm text-text-muted">
        No git connections found. Add one in Settings → Git Integration.
      </p>
    );
  }

  const options = connections.map((connection) => {
    const provider = getSourceControl(connection.provider);
    const label = `${connection.label} (${provider.name})`;
    return {
      value: connection.id,
      label,
      // Matches on the provider name as well as the connection label.
      keywords: [connection.id, provider.name],
      content: (
        <>
          <SourceControlBadge provider={connection.provider} showName={false} />
          <span className="truncate">{label}</span>
        </>
      ),
    };
  });

  return (
    <Combobox
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder="Select a source control…"
      searchPlaceholder="Search connections…"
      emptyMessage="No connections found"
      aria-labelledby={labelledBy}
      aria-label="Source control connection"
    />
  );
}
