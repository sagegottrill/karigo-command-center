import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { matchesQuery } from "@/lib/fleetopsx/search-match";
import { ChevronLeft, ChevronRight, Plus, Printer, Search } from "lucide-react";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import { authService, fleetService } from "@/lib/fleetopsx/services";
import { headCategoryOptions, tailBodyOptions } from "@/lib/fleetopsx/asset-options";
import type { TruckHead, TruckStatus, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/fleet-registry")({
  component: FleetRegistryPage,
});

// Rows per page — the shared portal setting (lib/fleetopsx/pagination).
const CARD_SHADOW =
  "shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.1),0px_4px_4px_-4px_rgba(12,12,13,0.05)]";

const STATUS_FILTERS = [
  "All",
  "Available",
  "Assigned",
  "Out of Yard",
  "Check Up",
  "Maintenance",
  "Accident",
  "Blocked",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type AssetTab = "head" | "tail";

/**
 * Asset states in the order the fleet team reads them. "Out of Yard" replaced
 * the old "In Transit" asset state: it only means the truck has left the yard.
 * It is internal bookkeeping and is NEVER written to a dispatch/customer state.
 */
const ASSET_STATUS_ORDER: TruckStatus[] = [
  "Available",
  "Assigned",
  "Out of Yard",
  "Check Up",
  "Maintenance",
  "Accident",
  "Blocked",
];

/**
 * Column tracks for the registry table. A caller who may act on a row (add,
 * edit, block, retire) gets one extra narrow track for its menu — Fleet Ops,
 * which only reads and re-states, sees the same table without it.
 */
const registryGrid = (canAct: boolean) =>
  canAct
    ? "grid-cols-[122px_132px_1fr_120px_120px_44px] gap-x-8"
    : "grid-cols-[146px_146px_1fr_140px_140px] gap-[50px]";

/** Where an asset sits when it is not on a trip. The client's sheet only ever uses
 * Port or Customer; Depot is the fallback for assets without a sheet location. */
const LOCATION_ORDER = ["Port", "Customer", "Depot"] as const;

/** Options for a location cell — always includes the row's current value so a
 * select can never end up with a value that is not in its option list. */
function locationOptions(current: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const loc of [...LOCATION_ORDER, current, "Depot"]) {
    if (loc && !seen.has(loc)) {
      seen.add(loc);
      out.push(loc);
    }
  }
  return out;
}

function countByStatus(items: { status: TruckStatus }[], status: TruckStatus) {
  return items.filter((item) => item.status === status).length;
}

function statusPillClass(status: TruckStatus) {
  switch (status) {
    case "Available":
      return "bg-[#34C759] text-white";
    case "Assigned":
      return "bg-[#627084] text-white";
    case "Out of Yard":
      return "bg-[#EA3A3D] text-white";
    case "Check Up":
      return "bg-[#8B5CF6] text-white";
    case "Maintenance":
      return "bg-[#F99E1F] text-white";
    case "Accident":
      return "bg-[#ED351D] text-white";
    case "Blocked":
      return "bg-[#1B2432] text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function headLabel(head: TruckHead) {
  return displayHeadCap(head) || head.capNumber || head.number;
}

/**
 * Only the Transport Manager owns the fleet itself — which trucks exist, what
 * they are and whether they may be used. Fleet Ops works the trucks (status,
 * where one is standing) but does not add, re-plate or retire them.
 */
const FLEET_ADMIN_ROLES = ["Transport Manager", "Platform Admin"];

/** The editable shape of an asset, whichever tab it came from. */
type AssetDraft = {
  /** Cap number (head) or tail number (tail) — the UNIQUE number that never changes hands. */
  number: string;
  registration: string;
  /** A head's category or a tail's body. */
  kind: string;
  status: TruckStatus;
  location: string;
};

function draftOf(tab: AssetTab, item?: TruckHead | TruckTail): AssetDraft {
  if (!item) {
    return { number: "", registration: "", kind: "", status: "Available", location: "Depot" };
  }
  if (tab === "head") {
    const head = item as TruckHead;
    return {
      number: headLabel(head),
      registration: head.registration ?? "",
      kind: head.make ?? "",
      status: head.status,
      location: head.location || "Depot",
    };
  }
  const tail = item as TruckTail;
  return {
    number: tail.number ?? "",
    registration: tail.registration ?? "",
    kind: tail.type ?? "",
    status: tail.status,
    location: tail.location || "Depot",
  };
}

/**
 * Fleet Status Report — the sheet the Fleet Operations manager hands to his
 * boss: how many trucks are on site, out of the yard, in the workshop and off
 * the road, plus the list he is looking at. Uses the same standalone printed
 * sheet approach as the dispatch printout (own window, auto-printed).
 */
function printFleetReport({
  heads,
  tails,
  listing,
  tab,
  filterLabel,
  query,
}: {
  heads: TruckHead[];
  tails: TruckTail[];
  listing: Array<TruckHead | TruckTail>;
  tab: AssetTab;
  filterLabel: string;
  query: string;
}) {
  const htmlEsc = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const summaryRows = ASSET_STATUS_ORDER.map((status) => {
    const heads_ = countByStatus(heads, status);
    const tails_ = countByStatus(tails, status);
    return `<tr><td>${status}</td><td class="n">${heads_}</td><td class="n">${tails_}</td><td class="n">${heads_ + tails_}</td></tr>`;
  }).join("");
  const detailRows = listing
    .map((item) => {
      const head = tab === "head" ? (item as TruckHead) : undefined;
      const tail = tab === "tail" ? (item as TruckTail) : undefined;
      return `<tr><td>${htmlEsc(head ? headLabel(head) : tail?.number ?? "")}</td><td>${htmlEsc(
        item.registration || "—",
      )}</td><td>${htmlEsc(head ? head.make : tail?.type ?? "")}</td><td>${htmlEsc(
        item.status,
      )}</td><td>${htmlEsc(item.location || "—")}</td></tr>`;
    })
    .join("");
  const stamp = formatDateLines(new Date().toISOString());
  let preparedBy = "";
  try {
    preparedBy = localStorage.getItem("fleetopsx_user_name") || "";
  } catch {
    /* private mode — omit */
  }
  const scopeNote = [
    tab === "head" ? "Truck Heads" : "Truck Tails",
    filterLabel === "All" ? "All statuses" : `Status: ${filterLabel}`,
    query.trim() ? `Search: ${query.trim()}` : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    toast.error("Allow pop-ups for this site to print.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Fleet Status Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #1B2432; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #5C6470; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; margin-bottom: 4px; }
    .stamp { color: #5C6470; font-size: 10px; margin-bottom: 18px; line-height: 1.6; }
    h2 { font-size: 14px; margin: 22px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #5C6470; border-bottom: 1px solid #1B2432; padding: 6px 0; }
    td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #E2E5E9; }
    td.n { text-align: right; width: 90px; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: bold; border-top: 1px solid #1B2432; border-bottom: 0; }
    .sign { margin-top: 40px; font-size: 12px; color: #5C6470; }
    .sign span { display: inline-block; border-top: 1px solid #5C6470; margin-top: 34px; padding-top: 4px; min-width: 240px; }
    @media print { body { margin: 12mm; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
  </style></head><body>
    <h1>Fleet Status Report</h1>
    <div class="meta">Petroline Transport Ltd &bull; Fleet Operations</div>
    <div class="stamp">Printed: ${stamp.date} ${stamp.time}${preparedBy ? ` &nbsp;|&nbsp; Prepared by: ${htmlEsc(preparedBy)}` : ""}<br/>Showing: ${htmlEsc(scopeNote)}</div>
    <h2>Summary</h2>
    <table>
      <tr><th>Status</th><th class="n">Heads</th><th class="n">Tails</th><th class="n">Total</th></tr>
      ${summaryRows}
      <tr class="total"><td>Total</td><td class="n">${heads.length}</td><td class="n">${tails.length}</td><td class="n">${heads.length + tails.length}</td></tr>
    </table>
    <h2>${tab === "head" ? "Truck Heads" : "Truck Tails"} (${listing.length})</h2>
    <table>
      <tr><th>${tab === "head" ? "Head No" : "Tail No"}</th><th>Registration</th><th>${tab === "head" ? "Category" : "Body"}</th><th>Status</th><th>Location</th></tr>
      ${detailRows || `<tr><td colspan="5">No records.</td></tr>`}
    </table>
    <div class="sign">Prepared by:<br/><span>${htmlEsc(preparedBy || "")}</span></div>
    <script>window.onload = function () { window.print(); };</script>
  </body></html>`);
  w.document.close();
  w.focus();
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
  const navigate = useNavigate();
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AssetTab>("head");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const canManageFleet = authService.getRoles().some((r: string) => FLEET_ADMIN_ROLES.includes(r));
  // Add / edit surface, and the row queued for deletion (never deleted on a
  // single click — a fleet number that disappears by accident is unrecoverable).
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; item?: TruckHead | TruckTail } | null>(null);
  const [removing, setRemoving] = useState<TruckHead | TruckTail | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
    void Promise.all([fleetService.listHeads(), fleetService.listTails()])
      .then(([h, t]) => {
        setHeads(h);
        setTails(t);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const refresh = () => {
    void Promise.all([fleetService.listHeads(), fleetService.listTails()])
      .then(([h, t]) => {
        setHeads(h);
        setTails(t);
      })
      .catch(() => toast.error("Could not refresh fleet list"));
  };

  /** The plate or tail code — what the alert names, never a database id. */
  const assetLabel = (item: TruckHead | TruckTail) =>
    tab === "head" ? (item as TruckHead).registration : (item as TruckTail).number;

  const handleStatusChange = async (item: TruckHead | TruckTail, status: TruckStatus) => {
    try {
      if (tab === "head") await fleetService.updateHeadStatus(item.id, status, assetLabel(item));
      else await fleetService.updateTailStatus(item.id, status, assetLabel(item));
      toast.success(`Status updated to ${status}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  };

  /**
   * The asset's own kind, straight from the table: a tail's BODY (Full Sided,
   * Semi Sided, Flatbed Tail…) or a head's operating category. This is the value
   * every assignment screen, tracking row and printout reads, so recording it
   * here is what makes those screens tell the truth.
   */
  const handleKindChange = async (item: TruckHead | TruckTail, value: string) => {
    try {
      if (tab === "head") await fleetService.setHeadCategory(item.id, value);
      else await fleetService.setTailType(item.id, value);
      toast.success(tab === "head" ? `Category updated to ${value}` : `Body updated to ${value}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the asset type");
    }
  };

  /** TM and Fleet Ops can place an asset (Port / Customer) straight from the table. */
  const handleLocationChange = async (item: TruckHead | TruckTail, destination: string) => {
    try {
      if (tab === "head") await fleetService.setHeadDestination(item.id, destination);
      else await fleetService.setTailDestination(item.id, destination);
      toast.success(`Location updated to ${destination}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update location");
    }
  };

  /**
   * Write one asset to the server: create or update, on whichever tab is open.
   * A duplicate number comes back as a readable sentence rather than a raw error
   * — the number is the one thing about a truck that must stay unambiguous.
   */
  const submitAsset = async (draft: AssetDraft, target?: TruckHead | TruckTail) => {
    const number = draft.number.trim();
    if (!number) {
      toast.error(tab === "head" ? "A head number (cap) is required." : "A tail number is required.");
      return;
    }
    setBusy(true);
    try {
      if (tab === "head") {
        const body = {
          cabId: number,
          registration: draft.registration.trim(),
          category: draft.kind.trim() || null,
          destination: draft.location.trim() || null,
          status: draft.status,
        };
        if (target) await fleetService.updateHead(target.id, body as Partial<TruckHead>);
        else await fleetService.createHead(body);
      } else {
        const body = {
          number,
          type: draft.kind.trim() || null,
          status: draft.status,
        };
        if (target) await fleetService.updateTail(target.id, { ...body, location: draft.location } as Partial<TruckTail>);
        else {
          await fleetService.createTail(body);
          // POST /tails takes number/type/status only — the standing location is
          // written straight after, so a new tail is never left with a blank one.
          const created = (await fleetService.listTails()).find((t) => t.number === number);
          if (created && draft.location.trim()) await fleetService.setTailDestination(created.id, draft.location.trim());
        }
      }
      toast.success(target ? `${number} updated.` : `${number} added to the fleet.`);
      setEditor(null);
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the asset.";
      toast.error(/409|already exists|unique/i.test(message) ? `${number} already exists in the fleet.` : message);
    } finally {
      setBusy(false);
    }
  };

  /** Blocked / un-blocked: the number stays, it simply cannot be assigned. */
  const setBlocked = async (item: TruckHead | TruckTail, blocked: boolean) => {
    try {
      if (tab === "head")
        await fleetService.updateHeadStatus(item.id, blocked ? "Blocked" : "Available", assetLabel(item));
      else
        await fleetService.updateTailStatus(item.id, blocked ? "Blocked" : "Available", assetLabel(item));
      toast.success(blocked ? "Blocked — this number can no longer be assigned." : "Unblocked — available for assignment again.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the block state");
    }
  };

  const confirmDelete = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      if (tab === "head") await fleetService.deleteHead(removing.id);
      else await fleetService.deleteTail(removing.id);
      toast.success("Removed from the fleet.");
      setRemoving(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the asset");
    } finally {
      setBusy(false);
    }
  };

  const listing = tab === "head" ? heads : tails;

  const filtered = useMemo(() => {
    return listing.filter((item) => {
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      const hay =
        tab === "head"
          ? `${headLabel(item as TruckHead)} ${(item as TruckHead).capNumber ?? ""} ${item.number} ${item.registration} ${(item as TruckHead).make} ${item.location} ${item.status}`
          : `${item.number} ${item.registration} ${(item as TruckTail).type} ${item.location} ${item.status}`;
      // Loose match: "b 010" finds tail B010, "p-017" finds cap P017.
      return matchesQuery(hay, query);
    });
  }, [listing, statusFilter, query, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers =
      tab === "head" ? "Head No,Registration,Category,Status,Location\n" : "Tail No,Registration,Body,Status,Location\n";
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
    return headers + csv;
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
        <StatCard label="Head Out of Yard" value={countByStatus(heads, "Out of Yard")} />
        <StatCard label="Tail Out of Yard" value={countByStatus(tails, "Out of Yard")} />
        <StatCard label="Head In Maintenance" value={countByStatus(heads, "Maintenance")} />
        <StatCard label="Tail In Maintenance" value={countByStatus(tails, "Maintenance")} />
        <StatCard label="Head Check Up" value={countByStatus(heads, "Check Up")} />
        <StatCard label="Tail Check Up" value={countByStatus(tails, "Check Up")} />
        <StatCard
          label="Head Accident"
          value={countByStatus(heads, "Accident")}
          hint="unavailable"
          hintClass="text-[#FF383C]"
        />
        <StatCard
          label="Tail Accident"
          value={countByStatus(tails, "Accident")}
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
          <StatCard label="Head Out of Yard" value={countByStatus(heads, "Out of Yard")} />
          <StatCard label="Head Check Up" value={countByStatus(heads, "Check Up")} />
          <StatCard label="Head In Maintenance" value={countByStatus(heads, "Maintenance")} />
          <StatCard
            label="Head Accident"
            value={countByStatus(heads, "Accident")}
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
          <StatCard label="Tail Out of Yard" value={countByStatus(tails, "Out of Yard")} />
          <StatCard label="Tail Check Up" value={countByStatus(tails, "Check Up")} />
          <StatCard label="Tail In Maintenance" value={countByStatus(tails, "Maintenance")} />
          <StatCard
            label="Tail Accident"
            value={countByStatus(tails, "Accident")}
            hint="unavailable"
            hintClass="text-[#FF383C]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex w-full items-center gap-2.5 md:w-auto">
            <div className="flex flex-1 items-center gap-2.5 rounded bg-white p-[5px] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] md:flex-none">
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
            {/* Fleet Status Report — counts on site / out of yard / etc. for his boss. */}
            <button
              type="button"
              onClick={() =>
                printFleetReport({
                  heads,
                  tails,
                  listing: filtered,
                  tab,
                  filterLabel: statusFilter,
                  query,
                })
              }
              className="flex h-9 shrink-0 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[13px] font-medium tracking-[0.4px] text-white md:text-[14px]"
            >
              <Printer className="size-[18px]" strokeWidth={1.75} />
              Print
            </button>
            {/* The Transport Manager grows the fleet from here — Fleet Ops does
                not add, re-plate or retire trucks. */}
            {canManageFleet ? (
              <button
                type="button"
                onClick={() => setEditor({ mode: "create" })}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded bg-[#ED351D] px-3 text-[13px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19] md:text-[14px]"
              >
                <Plus className="size-[18px]" strokeWidth={2} />
                {tab === "head" ? "Add Head" : "Add Tail"}
              </button>
            ) : null}
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
                  placeholder="Search cap, plate, tail or location…"
                  className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
                />
              </div>
              <FilterButton
                options={STATUS_FILTERS}
                value={statusFilter}
                onChange={(s) => {
                  setStatusFilter(s);
                  setPage(0);
                }}
                allLabel="All Statuses"
              />
            </div>
          </div>

          <div
            className={cn(
              "hidden items-center border-b border-[#E2E5E9] py-2.5 md:grid",
              registryGrid(canManageFleet),
            )}
          >
            {(tab === "head"
              ? ["Head No", "Registration", "Category", "Status", "Location"]
              : ["Tail No", "Registration", "Body", "Status", "Location"]
            ).map((h) => (
              <span key={h} className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
            {canManageFleet ? <span /> : null}
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
                  {/* Editable kind: a tail's body / a head's category. */}
                  <select
                    value={head ? head.make : tail?.type || "Trailer"}
                    onChange={(e) => void handleKindChange(item, e.target.value)}
                    className="h-[26px] w-full cursor-pointer rounded border border-[#E2E5E9] bg-white px-2 text-[13px] tracking-[0.4px] text-[#5C6470] outline-none"
                    title={
                      tab === "head"
                        ? "The head's operating category"
                        : "The body this tail carries — what the partner's request is matched against"
                    }
                  >
                    {(head ? headCategoryOptions(head.make) : tailBodyOptions(tail?.type)).map((opt) => (
                      <option key={opt} value={opt} className="bg-white text-[#1B2432]">
                        {opt}
                      </option>
                    ))}
                  </select>
                  <select
                    value={item.location || "Depot"}
                    onChange={(e) => void handleLocationChange(item, e.target.value)}
                    className="h-[26px] w-full cursor-pointer rounded border border-[#E2E5E9] bg-white px-2 text-[13px] capitalize tracking-[0.4px] text-[#5C6470] outline-none"
                  >
                    {locationOptions(item.location).map((loc) => (
                      <option key={loc} value={loc} className="bg-white text-[#1B2432]">
                        {loc}
                      </option>
                    ))}
                  </select>
                  {canManageFleet ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditor({ mode: "edit", item })}
                        className="h-7 rounded border border-[#627084] px-2.5 text-[12px] font-medium text-[#303D50]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void setBlocked(item, item.status !== "Blocked")}
                        className="h-7 rounded border border-[#627084] px-2.5 text-[12px] font-medium text-[#303D50]"
                      >
                        {item.status === "Blocked" ? "Unblock" : "Block"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(item)}
                        className="h-7 rounded border border-[#ED351D] px-2.5 text-[12px] font-medium text-[#ED351D]"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
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
                  className={cn(
                    "grid items-center border-b border-[#E2E5E9] py-2.5",
                    registryGrid(canManageFleet),
                  )}
                >
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {head ? headLabel(head) : tail?.number}
                  </span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{item.registration}</span>
                  {/* Editable kind: a tail's body / a head's category. */}
                  <select
                    value={head ? head.make : tail?.type || "Trailer"}
                    onChange={(e) => void handleKindChange(item, e.target.value)}
                    className="h-[26px] w-full cursor-pointer rounded border border-[#E2E5E9] bg-white px-2 text-[13px] tracking-[0.4px] text-[#5C6470] outline-none"
                    title={
                      tab === "head"
                        ? "The head's operating category"
                        : "The body this tail carries — what the partner's request is matched against"
                    }
                  >
                    {(head ? headCategoryOptions(head.make) : tailBodyOptions(tail?.type)).map((opt) => (
                      <option key={opt} value={opt} className="bg-white text-[#1B2432]">
                        {opt}
                      </option>
                    ))}
                  </select>
                  <span>
                    <select
                      value={item.status}
                      onChange={(e) => void handleStatusChange(item, e.target.value as TruckStatus)}
                      className={cn(
                        "inline-flex h-[22px] min-w-[96px] cursor-pointer items-center rounded border-0 px-2.5 pr-6 text-[10px] font-medium outline-none",
                        statusPillClass(item.status),
                      )}
                    >
                      {ASSET_STATUS_ORDER.map((s) => (
                        <option key={s} value={s} className="bg-white text-[#1B2432]">{s}</option>
                      ))}
                    </select>
                  </span>
                  <select
                    value={item.location || "Depot"}
                    onChange={(e) => void handleLocationChange(item, e.target.value)}
                    className="inline-flex h-[22px] min-w-[96px] cursor-pointer items-center rounded border border-[#E2E5E9] bg-white px-2 text-[12px] capitalize tracking-[0.4px] text-[#5C6470] outline-none"
                  >
                    {locationOptions(item.location).map((loc) => (
                      <option key={loc} value={loc} className="bg-white text-[#1B2432]">
                        {loc}
                      </option>
                    ))}
                  </select>
                  {canManageFleet ? (
                    <div className="justify-self-end">
                      <RowActionMenu
                        open={menuFor === item.id}
                        onOpenChange={(o) => setMenuFor(o ? item.id : null)}
                        label="Fleet asset options"
                        width={184}
                        items={[
                          { label: "Edit", onSelect: () => setEditor({ mode: "edit", item }) },
                          item.status === "Blocked"
                            ? { label: "Unblock", onSelect: () => void setBlocked(item, false) }
                            : { label: "Block", onSelect: () => void setBlocked(item, true) },
                          { label: "Delete", onSelect: () => setRemoving(item), danger: true },
                        ]}
                      />
                    </div>
                  ) : null}
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
                    ? "Truck heads will appear here once they are added to the fleet."
                    : "Truck bodies and tails will appear here once they are added to the fleet."
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
                <ExportMenu csv={exportCSV} rows={filtered.length} title={tab === "head" ? "Fleet Heads" : "Fleet Tails"} fileNameBase={tab === "head" ? "fleet_heads" : "fleet_tails"} />
              </div>
            </div>
          )}
        </div>

      </div>

      {editor ? (
        <AssetEditorModal
          tab={tab}
          item={editor.item}
          busy={busy}
          onCancel={() => setEditor(null)}
          onSubmit={(draft) => void submitAsset(draft, editor.item)}
        />
      ) : null}

      {removing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[420px] rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-[16px] font-bold text-[#1B2432]">
              Remove {tab === "head" ? "this head" : "this tail"} from the fleet?
            </h3>
            <p className="mt-1 text-[13px] text-[#5C6470]">
              {tab === "head" ? headLabel(removing as TruckHead) : (removing as TruckTail).number} disappears from
              every assignment list. Use Block instead if the truck is sold or parked up but its number must stay on
              the books — blocking keeps it listed and simply never offers it for dispatch.
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoving(null)}
                className="text-[13px] font-medium text-[#627084] hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete()}
                className="h-9 rounded bg-[#ED351D] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Removing…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Add-a-truck / edit-a-truck form, shared by both registry tabs.
 *
 * The number is the one field the rest of the platform keys on (a partner's
 * request is matched to a tail by its body, an assignment to a head by its cap),
 * so it is always shown and always required — and a duplicate is refused by the
 * server rather than silently overwriting the truck that already owns it.
 */
function AssetEditorModal({
  tab,
  item,
  busy,
  onCancel,
  onSubmit,
}: {
  tab: AssetTab;
  item?: TruckHead | TruckTail;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: AssetDraft) => void;
}) {
  const [draft, setDraft] = useState<AssetDraft>(() => draftOf(tab, item));
  const isHead = tab === "head";
  const editing = Boolean(item);
  const set = <K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-[520px] flex-col gap-4 overflow-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="border-b border-[#E2E5E9] pb-3">
          <h3 className="text-[18px] font-bold text-[#1B2432]">
            {editing ? "Edit" : "Add"} {isHead ? "truck head" : "tail"}
          </h3>
          <p className="mt-1 text-[12px] text-[#5C6470]">
            {isHead
              ? "The cap number is how this truck is called on every dispatch. Category is what it is used for."
              : "The tail number is how this body is called on every dispatch. Body is what it actually carries."}
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[#141A1F]">
            {isHead ? "Head No (Cap Number)" : "Tail No"} <span className="text-[#ED351D]">*</span>
          </span>
          <input
            autoFocus
            value={draft.number}
            onChange={(e) => set("number", e.target.value)}
            placeholder={isHead ? "e.g. P121" : "e.g. B109"}
            className="h-10 rounded border border-[#E2E5E9] px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#ED351D]"
          />
        </label>

        {isHead ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#141A1F]">Registration (Plate)</span>
            <input
              value={draft.registration}
              onChange={(e) => set("registration", e.target.value)}
              placeholder="e.g. KRD990YM"
              className="h-10 rounded border border-[#E2E5E9] px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#ED351D]"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[#141A1F]">{isHead ? "Category" : "Body Type"}</span>
          <select
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value)}
            className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#ED351D]"
          >
            <option value="">Not set</option>
            {(isHead ? headCategoryOptions(draft.kind) : tailBodyOptions(draft.kind)).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#141A1F]">Status</span>
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as TruckStatus)}
              className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#ED351D]"
            >
              {ASSET_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#141A1F]">Location</span>
            <select
              value={draft.location}
              onChange={(e) => set("location", e.target.value)}
              className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#ED351D]"
            >
              {locationOptions(draft.location).map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#E2E5E9] pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] font-medium text-[#627084] hover:underline"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !draft.number.trim()}
            onClick={() => onSubmit(draft)}
            className="h-9 rounded bg-[#ED351D] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save Changes" : isHead ? "Add Head" : "Add Tail"}
          </button>
        </div>
      </div>
    </div>
  );
}
