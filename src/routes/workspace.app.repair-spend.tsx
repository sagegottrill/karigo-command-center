import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import {
  ENGINEERING_ACCESS_ROLES,
  resolveTruck,
  truckLabel,
} from "@/lib/fleetopsx/engineering-helpers";
import { authService, engineeringService, fleetService, formatNairaFull } from "@/lib/fleetopsx/services";
import type { TruckHead, WorkOrder } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * What the workshop has cost, read straight off the work orders.
 *
 * Nothing here is an estimate: every figure is the `cost` recorded on a job, so
 * the department and the Transport Manager are looking at the same numbers the
 * ledger was built from.
 */
export const Route = createFileRoute("/workspace/app/repair-spend")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: any) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: RepairSpend,
});

/** YYYY-MM, so a month groups without a date library. */
function monthOf(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function RepairSpend() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"truck" | "category" | "month">("truck");

  useEffect(() => {
    const roles = authService.getRoles();
    if (!roles.some((r: any) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
    void Promise.all([
      engineeringService.listWorkOrders().catch(() => [] as WorkOrder[]),
      fleetService.listHeads().catch(() => [] as TruckHead[]),
    ])
      .then(([wos, fleet]) => {
        setOrders(wos);
        setHeads(fleet);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the ledger"))
      .finally(() => setLoading(false));
  }, [navigate]);

  const billed = useMemo(() => orders.filter((o) => o.status !== "Cancelled"), [orders]);

  const totals = useMemo(() => {
    const spend = billed.reduce((sum, o) => sum + (Number(o.cost) || 0), 0);
    const openSpend = billed
      .filter((o) => o.status !== "Completed")
      .reduce((sum, o) => sum + (Number(o.cost) || 0), 0);
    const priced = billed.filter((o) => Number(o.cost) > 0).length;
    return {
      spend,
      openSpend,
      closedSpend: spend - openSpend,
      jobs: billed.length,
      priced,
      unpriced: billed.length - priced,
      average: priced ? spend / priced : 0,
    };
  }, [billed]);

  /** One grouping, three ways of reading it. */
  const grouped = useMemo(() => {
    const rows = new Map<string, { label: string; jobs: number; spend: number; open: number; last: string }>();
    for (const order of billed) {
      const head = resolveTruck(order, heads);
      const key =
        tab === "truck"
          ? head
            ? truckLabel(head)
            : order.truckReg || "Unmatched truck"
          : tab === "category"
            ? order.category || "General"
            : monthOf(order.reportedAt);
      const current = rows.get(key) ?? { label: key, jobs: 0, spend: 0, open: 0, last: "" };
      current.jobs += 1;
      current.spend += Number(order.cost) || 0;
      if (order.status !== "Completed") current.open += 1;
      const at = order.reportedAt || "";
      if (at > current.last) current.last = at;
      rows.set(key, current);
    }
    return [...rows.values()]
      .filter((row) => (query.trim() ? row.label.toLowerCase().includes(query.trim().toLowerCase()) : true))
      .sort((a, b) => b.spend - a.spend || b.jobs - a.jobs);
  }, [billed, heads, tab, query]);

  const exportCSV = () => {
    const headers =
      tab === "truck"
        ? "Truck Head,Jobs,Open Jobs,Repair Spend (₦),Last Job\n"
        : tab === "category"
          ? "Category,Jobs,Open Jobs,Repair Spend (₦),Last Job\n"
          : "Month,Jobs,Open Jobs,Repair Spend (₦),Last Job\n";
    const csv = grouped
      .map((row) =>
        [row.label, row.jobs, row.open, row.spend, row.last ? formatDateLines(row.last).date : ""]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repair_spend_by_${tab}.csv`;
    a.click();
    toast.success("Exported CSV successfully.");
  };

  const TABS = [
    { key: "truck" as const, label: "By Truck" },
    { key: "category" as const, label: "By Category" },
    { key: "month" as const, label: "By Month" },
  ];

  return (
    <>
      <DepartmentTabs department="engineering" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Repair Spend</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            what the workshop cost, job by job
          </p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          className="flex h-8 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Total Repair Spend", value: formatNairaFull(totals.spend), tone: "text-[#1B2432]" },
          { label: "Closed Jobs", value: formatNairaFull(totals.closedSpend), tone: "text-[#0A8F4D]" },
          { label: "Still Open", value: formatNairaFull(totals.openSpend), tone: "text-[#B26A00]" },
          { label: "Jobs Billed", value: `${totals.priced} of ${totals.jobs}`, tone: "text-[#1B2432]" },
          { label: "Average per Job", value: formatNairaFull(Math.round(totals.average)), tone: "text-[#1B2432]" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">{stat.label}</span>
            <span className={cn("text-[20px] font-semibold leading-7", stat.tone)}>{stat.value}</span>
          </div>
        ))}
      </div>

      {totals.unpriced > 0 && (
        <p className="text-[13px] text-[#5C6470]">
          {totals.unpriced} job{totals.unpriced === 1 ? "" : "s"} on the books carry no cost yet — the spend above
          only counts what the workshop has actually recorded.
        </p>
      )}

      <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#E2E5E9] pb-5">
          <div className="flex items-center gap-1 rounded border border-[#E2E5E9] p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "h-7 rounded px-3 text-[13px] font-medium",
                  tab === t.key ? "bg-[#1B2432] text-white" : "text-[#5C6470] hover:bg-[#F1F2F4]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-[320px]">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
              strokeWidth={1.5}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_120px_120px_180px_160px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
          {[
            tab === "truck" ? "Truck Head" : tab === "category" ? "Category" : "Month",
            "Jobs",
            "Open",
            "Repair Spend",
            "Last Job",
          ].map((h) => (
            <span key={h} className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {h}
            </span>
          ))}
        </div>

        {grouped.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_120px_120px_180px_160px] items-center gap-4 border-b border-[#E2E5E9] py-2.5"
          >
            <span className="text-[14px] text-[#344256]">{tab === "truck" ? row.label : row.label}</span>
            <span className="text-[14px] text-[#5C6470]">{row.jobs}</span>
            <span className={cn("text-[14px]", row.open > 0 ? "text-[#B26A00]" : "text-[#5C6470]")}>{row.open}</span>
            <span className="text-[14px] font-medium text-[#344256]">{formatNairaFull(row.spend)}</span>
            <span className="text-[14px] text-[#5C6470]">{row.last ? formatDateLines(row.last).date : "—"}</span>
          </div>
        ))}

        {loading && <FigmaLoadingState />}
        {!loading && grouped.length === 0 && (
          <FigmaEmptyState
            title={query ? "Nothing matches that" : "No repair spend recorded yet"}
            body={
              query
                ? "Try another truck, category or month."
                : "Costs appear here as the workshop records them against a work order."
            }
          />
        )}
        </div>
      </div>
    </>
  );
}
