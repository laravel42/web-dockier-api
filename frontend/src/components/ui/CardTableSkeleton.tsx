import Skeleton from "@/components/ui/Skeleton";
import DataTable from "@/components/ui/DataTable";
import { cardCls, cardGridCls, tableCellCls } from "@/utils/styles";
import type { ViewMode } from "@/hooks/useViewMode";

const rows = Array.from({ length: 8 }, (_, i) => i);
// Cycled per column so the placeholder rows do not read as one solid block.
const CELL_WIDTHS = ["w-32", "w-40", "w-16", "w-10", "w-28", "w-28"];

interface Props {
  viewMode: ViewMode;
  /** Accessible name and column headers of the table view. */
  label: string;
  columns: string[];
}

/** List-page placeholder: icon + count, name, badges, date + branch cards, or a table with the real headers. */
export default function CardTableSkeleton({ viewMode, label, columns }: Props) {
  if (viewMode === "table") {
    return (
      <div aria-busy="true">
        <DataTable label={label} columns={columns}>
          {rows.map((i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td key={c} className={tableCellCls}>
                  <Skeleton className={`h-4 ${CELL_WIDTHS[j % CELL_WIDTHS.length]}`} />
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
      </div>
    );
  }
  return (
    <div className={cardGridCls} aria-busy="true">
      {rows.map((i) => (
        <div key={i} className={`${cardCls} flex flex-col gap-3 p-4`}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-5 shrink-0" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-14" />
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
