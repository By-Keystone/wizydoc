import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ColumnAlign = "left" | "center" | "right";

export type Column<T> = {
  /** Unique key per column. Used as React key and for tracking. */
  key: string;
  /** Header content. Plain text, JSX, icons — anything renderable. */
  header: ReactNode;
  /** Renderer for the cell. Return text, JSX, icons + text, badges, etc. */
  cell: (row: T) => ReactNode;
  /** Optional text alignment. Defaults to "left". */
  align?: ColumnAlign;
  /** Extra classes for the cell <td>. */
  cellClassName?: string;
  /** Extra classes for the header <th>. */
  headerClassName?: string;
};

export type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  /** Stable key per row. Avoids using array indices. */
  getRowKey: (row: T) => string;
  /** Custom empty state. Defaults to "No hay datos". */
  empty?: ReactNode;
  /** Optional caption shown above the table for accessibility. */
  caption?: ReactNode;
  /** Container classes. */
  className?: string;
};

const alignClass: Record<ColumnAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function Table<T>({
  columns,
  rows,
  getRowKey,
  empty,
  caption,
  className,
}: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-brand-gray",
          className,
        )}
      >
        {empty ?? "No hay datos"}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-gray-200 bg-white",
        className,
      )}
    >
      <table className="w-full text-sm">
        {caption && (
          <caption className="px-4 py-3 text-left text-sm text-brand-gray">
            {caption}
          </caption>
        )}
        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-brand-gray">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-4 py-3 font-medium",
                  alignClass[col.align ?? "center"],
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-brand-gray",
                    alignClass[col.align ?? "left"],
                    col.cellClassName,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
