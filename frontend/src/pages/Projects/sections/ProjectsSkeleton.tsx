import Skeleton from "@/components/ui/Skeleton";
import DataTable from "@/components/ui/DataTable";
import { cardCls, cardGridCls, tableCellCls } from "@/utils/styles";
import type { ViewMode } from "@/hooks/useViewMode";

const ROWS = 8;
const rows = Array.from({ length: ROWS }, (_, i) => i);

/** Loading placeholder shaped like ProjectCard / ProjectTable, so the list does not jump when data lands. */
export default function ProjectsSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "table") {
    return (
      <div aria-busy="true">
        <DataTable label="Loading projects" columns={["Name", "Repository", "Branch", "Tech", "Created"]}>
          {rows.map((i) => (
            <tr key={i}>
              <td className={tableCellCls}><Skeleton className="h-4 w-32" /></td>
              <td className={tableCellCls}><Skeleton className="h-4 w-40" /></td>
              <td><Skeleton className="h-5 w-16" /></td>
              <td><Skeleton className="h-5 w-28" /></td>
              <td><Skeleton className="h-3 w-24" /></td>
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
            <Skeleton className="size-8 shrink-0" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-14" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
