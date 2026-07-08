"use client";

import { TableSkeleton } from "@/components/ui/skeleton";

export interface Column<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = "No records found.",
  onRowClick,
  keyExtractor,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
        <TableSkeleton cols={columns.length} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 bg-white p-10 text-center">
        <p className="text-sm text-ink-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-50/60">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.header}
                  className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? "cursor-pointer hover:bg-ink-50/60" : undefined}
              >
                {columns.map((col) => (
                  <td key={col.header} className={`whitespace-nowrap px-4 py-3.5 text-ink-700 ${col.className ?? ""}`}>
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
