import type { ReactNode } from "react";
import { tablePanelCls, tableHeadCls } from "@/utils/styles";

interface Props {
  children: ReactNode;
  columns: string[];
  /** Accessible name for the table, announced instead of "table with 6 columns". */
  label: string;
  className?: string;
}

export default function DataTable({ children, columns, label, className = "" }: Props) {
  return (
    <div className={`${tablePanelCls} ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full table-compact" aria-label={label}>
          <thead className={tableHeadCls}>
            <tr>
              {columns.map((col) => (
                <th key={col} scope="col" className="font-medium">
                  {col}
                </th>
              ))}
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
