import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, engineeringService } from "@/lib/fleetopsx/services";
import { csvRow } from "@/lib/fleetopsx/csv";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { matchesQuery } from "@/lib/fleetopsx/search-match";
import { displayCapFromTrip } from "@/lib/fleetopsx/display-ids";
import type { WorkOrder } from "@/lib/fleetopsx/types";

/**
 * REPORT HISTORY — every maintenance report the yard desk has filed.
 *
 * The field desk reports what the physical inspection found; the workshop owns
 * the verdict. This board is the desk's own copy of its reports (the rows it
 * filed), read-only on purpose: advancing a work order is Engineering's move,
 * and a second department editing the same verdict is how records start to
 * disagree.
 */

export const Route = createFileRoute("/workspace/app/field-reports")({
  component: FieldReportsPage,
});

const FIELD_OPS_ROLES = ["Fleet Field Ops", "Fleet Field Operations", "Transport Manager", "Platform Admin"];

function FieldReportsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => FIELD_OPS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
  }, [navigate]);

  const refresh = useCallback(() => {
    void engineeringService
      .listWorkOrders()
      .then(setOrders)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the reports"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const me = (authService.getCurrentUser()?.name || "").trim().toLowerCase();
  const mine = useMemo(
    () =>
      orders.filter((o) => {
        const by = String(o.reportedBy || "").trim().toLowerCase();
        // The desk's own reports first; when nothing is on the row, show it —
        // an unattributed report is still the yard's to read.
        return !by || !me || by === me;
      }),
    [orders, me],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter((o) => matchesQuery(`${o.truckReg} ${o.defect} ${o.category} ${o.status} ${o.reportedBy}`, q));
  }, [mine, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Report History
        </h2>
        <p className="text-[12px] text-[#5C6470] md:text-[11.4px] md:uppercase md:tracking-[0.4px] md:text-[rgba(92,100,112,0.6)]">
          maintenance reports filed from the yard's physical inspections
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-[320px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search truck, defect or status"
            className="h-10 w-full rounded border border-[#E2E5E9] bg-white pl-9 pr-3 text-[14px] text-[#1B2432] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]"
          />
        </div>
        <ExportMenu
          csv={() => {
            const header = "Truck,Defect,Category,Priority,Status,Reported By,Reported On";
            const body = filtered
              .map((o) =>
                csvRow([
                  o.truckReg,
                  o.defect,
                  o.category || "General",
                  o.priority,
                  o.status,
                  o.reportedBy || "—",
                  new Date(o.reportedAt).toLocaleDateString(),
                ]),
              )
              .join("\n");
            return `${header}\n${body}`;
          }}
          rows={filtered.length}
          title="Fleet Field Reports"
          fileNameBase="field_reports"
        />
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white">
        {loading ? (
          <div className="p-4">
            <FigmaLoadingState label="Loading the reports…" />
          </div>
        ) : slice.length === 0 ? (
          <div className="p-4">
            <FigmaEmptyState
              title="No reports filed yet"
              body="Reports land here the moment the yard files one — from the registry's Make Maintenance Report action or the engineering board."
            />
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[130px_1fr_120px_100px_110px_130px] gap-3 border-b border-[#E2E5E9] bg-[#F9FAFB] px-4 py-2.5 text-[11.4px] font-medium uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)] md:grid">
              <span>Truck</span>
              <span>Defect</span>
              <span>Category</span>
              <span>Priority</span>
              <span>Status</span>
              <span>Reported On</span>
            </div>
            {slice.map((o) => (
              <div
                key={o.id}
                className="grid grid-cols-1 gap-2 border-b border-[#E2E5E9] px-4 py-3 last:border-b-0 md:grid-cols-[130px_1fr_120px_100px_110px_130px] md:items-center md:gap-3"
              >
                <span className="text-[13.5px] font-medium text-[#1B2432]">{displayCapFromTrip({ headId: o.truckReg }) || o.truckReg}</span>
                <span className="text-[13px] text-[#141A1F]">{o.defect}</span>
                <span className="text-[13px] text-[#5C6470]">{o.category || "General"}</span>
                <span className="text-[13px] text-[#5C6470]">{o.priority}</span>
                <span className="w-fit rounded-full bg-[#627084] px-2 py-0.5 text-[11px] font-medium text-white">{o.status}</span>
                <span className="text-[12.5px] text-[#5C6470]">
                  {o.reportedBy || "—"} · {new Date(o.reportedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-[13px] text-[#5C6470]">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-9 rounded border border-[#E2E5E9] bg-white px-3 disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="h-9 rounded border border-[#E2E5E9] bg-white px-3 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
