import { useMemo, useState } from "react";
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "~/lib/cn";

const features = tableFeatures({
  rowSortingFeature,
  globalFilteringFeature,
  columnFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

type Row = Record<string, unknown>;

export function DataTable({
  rows,
}: {
  rows: Row[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo<ColumnDef<typeof features, Row>[]>(() => {
    const keys = rows[0] ? Object.keys(rows[0]) : [];
    return keys.map((key) => ({
      accessorKey: key,
      header: key,
      cell: (context) => {
        const value = context.getValue();
        return value == null ? "—" : String(value);
      },
    }));
  }, [rows]);

  const table = useTable({
    features,
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
  });

  return (
    <div>
      <div className="mb-3">
        <input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Filter rows"
          className="w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
      </div>
      <div className="overflow-auto rounded-xl border border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/4 text-mist">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 font-medium">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp size={12} />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-50" />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={cn("px-3 py-2 text-paper/90")}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-mist">No rows to display.</div>
        ) : null}
      </div>
    </div>
  );
}
