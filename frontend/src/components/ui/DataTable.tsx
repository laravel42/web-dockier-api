import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { tablePanelCls, tableHeadCls } from "@/utils/styles";

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export interface ColumnDef {
  label: string;
  /** When set (with `onSort`), the header becomes a sort button keyed on this. */
  sortKey?: string;
}

type Column = string | ColumnDef;

interface Props {
  children: ReactNode;
  columns: Column[];
  /** Accessible name for the table, announced instead of "table with 6 columns". */
  label: string;
  className?: string;
  /** Current sort, or null for the caller's default (unsorted) order. */
  sort?: SortState | null;
  /** Called with a column's `sortKey` when its header is clicked. */
  onSort?: (key: string) => void;
}

function SortArrow({ dir }: { dir?: "asc" | "desc" }) {
  if (dir === "asc") return <ChevronUpIcon className="size-3.5" aria-hidden="true" />;
  if (dir === "desc") return <ChevronDownIcon className="size-3.5" aria-hidden="true" />;
  return <ChevronsUpDownIcon className="size-3.5 opacity-40" aria-hidden="true" />;
}

export default function DataTable({ children, columns, label, className = "", sort, onSort }: Props) {
  return (
    <div className={`${tablePanelCls} ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full table-compact" aria-label={label}>
          <thead className={tableHeadCls}>
            <tr>
              {columns.map((col) => {
                const def: ColumnDef = typeof col === "string" ? { label: col } : col;
                const sortable = Boolean(def.sortKey) && Boolean(onSort);
                const active = sort && def.sortKey === sort.key;
                return (
                  <th
                    key={def.label}
                    scope="col"
                    className="font-medium"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort!(def.sortKey!)}
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        {def.label}
                        <SortArrow dir={active ? sort!.dir : undefined} />
                      </button>
                    ) : (
                      def.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export const tableRowCls =
  "hover:bg-card/40 cursor-pointer transition-colors";
