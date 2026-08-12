import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyState } from "./page-header";

export interface Column<T> {
  key: string;
  header: string;
  sortValue?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchKeys,
  pageSize = 10,
  onRowClick,
  toolbar,
  exportLabel = "Export CSV",
  emptyTitle = "No records found",
  emptyDescription = "Try a different filter or search.",
}: {
  rows: T[];
  columns: Column<T>[];
  searchKeys?: (row: T) => string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
  exportLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q && searchKeys) out = rows.filter((r) => searchKeys(r).toLowerCase().includes(q));
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          const cmp = typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
          return dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, sortKey, dir, columns, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const view = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[0.05] px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {searchKeys && (
            <div className="relative w-full max-w-64 min-w-0">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter records..."
                className="h-9 rounded-full border-black/[0.08] bg-black/[0.03] pl-9 text-[12px] shadow-none"
              />
            </div>
          )}
          {toolbar}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="num hidden text-[12px] text-muted-foreground sm:inline">
            {filtered.length} records
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-full border-black/[0.1] bg-white px-3.5 text-[12px]"
            onClick={() => toast.success(`${exportLabel} queued`, { description: `${filtered.length} records prepared for download.` })}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            Export
          </Button>
        </div>
      </div>

      {view.length === 0 ? (
        <div className="p-5">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-black/[0.06]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-[11px] font-medium tracking-[0.01em] text-muted-foreground first:pl-5 last:pr-5",
                      col.align === "right" && "text-right",
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        onClick={() => {
                          if (sortKey === col.key) setDir(dir === "asc" ? "desc" : "asc");
                          else {
                            setSortKey(col.key);
                            setDir("asc");
                          }
                        }}
                      >
                        {col.header}
                        {sortKey === col.key ? (
                          dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-b border-black/[0.04] transition-colors last:border-0 hover:bg-black/[0.015]",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3.5 align-middle text-[13px] text-foreground first:pl-5 last:pr-5",
                        col.align === "right" && "text-right",
                        col.className,
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
      )}

      <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-5 py-3">
        <span className="num text-[12px] text-muted-foreground">
          {current * pageSize + 1}-{Math.min((current + 1) * pageSize, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 w-8 rounded-full p-0" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8 w-8 rounded-full p-0" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
