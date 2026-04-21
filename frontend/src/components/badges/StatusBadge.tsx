import { STATUS_STYLES } from "./statusStyles";

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 ${cls}`}>
      {status}
    </span>
  );
}
