import { getStatusBadgeClass } from "@/utils/styles";

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 ${getStatusBadgeClass(status)}`}
    >
      {status}
    </span>
  );
}
