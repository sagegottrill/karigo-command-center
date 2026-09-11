import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import { authService, fleetService } from "@/lib/fleetopsx/services";
import type { TruckHead, TruckStatus, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/fleet-registry")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: FleetRegistryPage,
});

const PAGE_SIZE = 4;
const CARD_SHADOW =
  "shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.1),0px_4px_4px_-4px_rgba(12,12,13,0.05)]";

const STATUS_FILTERS = ["All", "Available", "Assigned", "In Transit", "Maintenance", "Out of Service"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type AssetTab = "head" | "tail";

function countByStatus(items: { status: TruckStatus }[], status: TruckStatus) {
  return items.filter((item) => item.status === status).length;
}

function statusPillClass(status: TruckStatus) {
  switch (status) {
    case "Available":
      return "bg-[#34C759] text-white";
    case "Assigned":
      return "bg-[#627084] text-white";
    case "In Transit":
      return "bg-[#EA3A3D] text-white";
    case "Maintenance":
      return "bg-[#F99E1F] text-white";
    case "Out of Service":
      return "bg-[#ED351D] text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function headLabel(head: TruckHead) {
  return displayHeadCap(head) || head.capNumber || head.number;
}

function StatCard({
  label,
  value,
  hint,
  hintClass,
}: {
  label: string;
  value: number;
  hint?: string;
  hintClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[88px] flex-col gap-1.5 overflow-hidden rounded-[10px] bg-white p-3 md:h-[105px] md:min-w-[160px] md:flex-1 md:gap-2.5 md:p-[15px]",
        CARD_SHADOW,
      )}
    >
      <span className="text-[12px] font-medium tracking-[0.4px] text-[#5C6470] md:text-[14px]">{label}</span>
      <span className="font-['Space_Grotesk',sans-serif] text-[28px] font-bold leading-8 text-[#1B2432] md:text-[36px] md:leading-9">
        {value}
      </span>
      {hint ? <span className={cn("text-[10px] font-medium leading-normal", hintClass)}>{hint}</span> : null}
    </div>
  );
}

function FleetRegistryPage() {
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AssetTab>("head");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    void Promise.all([fleetService.listHeads(), fleetService.listTails()])
      .then(([nextHeads, nextTails]) => {
        setHeads(nextHeads);
        setTails(nextTails);
      })
      .finally(() => setLoading(false));
  }, []);

  const listing = tab === "head" ? heads : tails;

  const filtered = useMemo(() => {
    return listing.filter((item) => {
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      const hay =
        tab === "head"
          ? `${headLabel(item as TruckHead)} ${(item as TruckHead).capNumber ?? ""} ${item.number} ${item.registration} ${(item as TruckHead).make} ${item.location} ${item.status}`
          : `${item.number} ${item.registration} ${(item as TruckTail).type} ${item.location} ${item.status}`;
      return !query || hay.toLowerCase().includes(query.toLowerCase());
    });
  }, [listing, statusFilter, query, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers =
      tab === "head" ? "Head No,Registration,Truck Brand,Status,Location\n" : "Tail No,Registration,Type,Status,Location\n";
    const csv = filtered
      .map((item) => {
        if (tab === "head") {
          const head = item as TruckHead;
          return `${headLabel(head)},${head.registration},${head.make},${head.status},${head.location}`;
        }
        const tail = item as TruckTail;
        return `${tail.number},${tail.registration},${tail.type},${tail.status},${tail.location}`;
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab === "head" ? "fleet_heads.csv" : "fleet_tails.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Fleet Registry
        </h2>
        <p className="text-[12px] font-normal text-[rgba(92,100,112,0.6)] md:text-[11.4px] md:uppercase md:tracking-[0.4px]">
          manage fleet availability, dispatch, and live location
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:hidden">
        <StatCard label="Total Head" value={heads.length} />
        <StatCard label="Total Tails" value={tails.length} />
        <StatCard
          label="Available Head"
          value={countByStatus(heads, "Available")}
          hint="ready for dispatch"
          hintClass="text-[#34C759]"
        />
        <StatCard
          label="Available Tail"
          value={countByStatus(tails, "Available")}
          hint="ready for dispatch"
          hintClass="text-[#34C759]"
        />
        <StatCard label="Head In Transit" value={countByStatus(heads, "In Transit")} />
        <StatCard label="Tail In Transit" value={countByStatus(tails, "In Transit")} />
        <StatCard label="Head In Maintenance" value={countByStatus(heads, "Maintenance")} />
        <StatCard label="Tail In Maintenance" value={countByStatus(tails, "Maintenance")} />
        <StatCard
          label="Head Out of Service"
          value={countByStatus(heads, "Out of Service")}
          hint="unavailable"
          hintClass="text-[#FF383C]"
        />
        <StatCard
          label="Tail Out of Service"
          value={countByStatus(tails, "Out of Service")}
          hint="unavailable"
          hintClass="text-[#FF383C]"
        />
      </div>

      <div className="hidden flex-col gap-[15px] md:flex">
        <div className="flex flex-wrap gap-[15px]">
          <StatCard label="Total Head" value={heads.length} />
          <StatCard
            label="Available Head"
            value={countByStatus(heads, "Available")}
            hint="ready to dispatch"
            hintClass="text-[#34C759]"
          />
          <StatCard label="Head In Transit" value={countByStatus(heads, "In Transit")} />
          <StatCard label="Head In Maintenance" value={countByStatus(heads, "Maintenance")} />
          <StatCard
            label="Head Out of Service"
            value={countByStatus(heads, "Out of Service")}
            hint="unavailable"
            hintClass="text-[#FF383C]"
          />
        </div>
        <div className="flex flex-wrap gap-[15px]">
          <StatCard label="Total Tail" value={tails.length} />
          <StatCard
            label="Available Tail"
            value={countByStatus(tails, "Available")}
            hint="ready to dispatch"
            hintClass="text-[#34C759]"
          />
          <StatCard label="Tail In Transit" value={countByStatus(tails, "In Transit")} />
          <StatCard label="Tail In Maintenance" value={countByStatus(tails, "Maintenance")} />
          <StatCard
            label="Tail Out of Service"
            value={countByStatus(tails, "Out of Service")}
            hint="unavailable"
            hintClass="text-[#FF383C]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex w-full items-center gap-2.5 rounded bg-white p-[5px] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] md:w-auto">
            {(["head", "tail"] as const).map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => {
                  setTab(next);
                  setPage(0);
                }}
                className={cn(
                  "flex h-8 flex-1 items-center justify-center rounded px-3 text-[14px] font-medium tracking-[0.4px] md:flex-none",
                  tab === next ? "bg-[#1B2432] text-white" : "text-[#141A1F]",
                )}
              >
                {next === "head" ? "Truck Head" : "Truck Tails"}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:pb-0">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  setStatusFilter(filter);
                  setPage(0);
                }}
                className={cn(
                  "flex h-9 shrink-0 items-center rounded px-3 text-[13px] font-medium tracking-[0.4px] md:text-[14px]",
                  statusFilter === filter ? "bg-[#1B2432] text-white" : "bg-[#E2E5E9] text-[#141A1F]",
                )}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
          <div className="mb-2.5 flex flex-col gap-3 border-b border-[#E2E5E9] pb-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[18px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[20px]">
                Fleet Register
              </h3>
              <span className="grid size-7 place-items-center rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white md:size-8">
                {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-2.5 md:gap-5">
              <div className="relative min-w-0 flex-1 md:max-w-[400px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search"
                  className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
                />
              </div>
              <button type="button" className="grid size-9 shrink-0 place-items-center rounded bg-[#ED351D] text-white" aria-label="Filter">
                <SlidersHorizontal className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div className="hidden grid-cols-[146px_146px_1fr_140px_140px] items-center gap-[50px] border-b border-[#E2E5E9] py-2.5 md:grid">
            {(tab === "head"
              ? ["Head No", "Registration", "Truck Brand", "Status", "Location"]
              : ["Tail No", "Registration", "Type", "Status", "Location"]
            ).map((h) => (
              <span key={h} className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 md:hidden">
            {slice.map((item) => {
              const head = tab === "head" ? (item as TruckHead) : undefined;
              const tail = tab === "tail" ? (item as TruckTail) : undefined;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-[8px] border border-[#E2E5E9] bg-white px-3.5 py-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                      {head ? `Head No: ${headLabel(head)}` : `Tail No: ${tail?.number}`}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-[22px] shrink-0 items-center rounded px-2.5 text-[10px] font-medium",
                        statusPillClass(item.status),
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#ED351D]">{item.registration || "—"}</span>
                  <span className="text-[13px] tracking-[0.4px] text-[#5C6470]">
                    {head ? head.make : tail?.type || "Trailer"}
                  </span>
                  <span className="text-[13px] capitalize tracking-[0.4px] text-[#5C6470]">{item.location}</span>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block">
            {slice.map((item) => {
              const head = tab === "head" ? (item as TruckHead) : undefined;
              const tail = tab === "tail" ? (item as TruckTail) : undefined;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[146px_146px_1fr_140px_140px] items-center gap-[50px] border-b border-[#E2E5E9] py-2.5"
                >
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {head ? headLabel(head) : tail?.number}
                  </span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{item.registration}</span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {head ? head.make : tail?.type}
                  </span>
                  <span>
                    <span
                      className={cn(
                        "inline-flex h-[22px] items-center rounded px-2.5 text-[10px] font-medium",
                        statusPillClass(item.status),
                      )}
                    >
                      {item.status}
                    </span>
                  </span>
                  <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{item.location}</span>
                </div>
              );
            })}
          </div>

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query || statusFilter !== "All" ? "No matching fleet assets" : tab === "head" ? "No truck heads yet" : "No truck tails yet"}
              body={
                query || statusFilter !== "All"
                  ? "Try a different search or status filter."
                  : tab === "head"
                    ? "Heads from the live trucks API will list here."
                    : "Body/tail codes from the Petroline roster list here when available."
              }
            />
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[16px]">
                {from} - {to}
              </span>
              <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[16px]">
                of {filtered.length}
              </span>
              <div className="ml-2 flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  onClick={exportCSV}
                  className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
                >
                  <Download className="size-[18px]" strokeWidth={1.75} />
                  Export CVS
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
