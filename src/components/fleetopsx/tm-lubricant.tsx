import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Droplet,
  Flame,
  MoreVertical,
  Printer,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ConfirmDialog } from "@/components/fleetopsx/confirm-dialog";
import { exportCsv, printDisbursalLedger } from "@/components/fleetopsx/lubricant-ui";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { authService, fuelPriceService, lubricantService } from "@/lib/fleetopsx/services";
import {
  approvalGate,
  formatQuantity,
  lubricantDispatchId,
  lubricantUnit,
  lubricantWithQuantity,
  resolveVehicle,
  type LubricantDisbursalRow,
  type LubricantFuel,
  type LubricantOverview,
  type LubricantRequestRow,
  type LubricantRestock,
} from "@/lib/fleetopsx/lubricant";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import { cn } from "@/lib/utils";

/**
 * The Transport Manager's Lubricant module — the two screens he works from.
 *
 *   Lubricant Inventory          what is in each tank, what it is worth, what it
 *                                was bought and drawn against, and the restock
 *                                records the department logged.
 *   Review disbursed to dispatch every litre the department handed to a truck,
 *                                for him to endorse or flag, with the vehicle and
 *                                operator behind each entry.
 *
 * The department's own board (dispense, requests, history) stays on its page —
 * this is the side of the counter the money sits on, and it never dispenses.
 */

const FUELS: LubricantFuel[] = ["Diesel", "Gas"];

/** Period presets the ledger is read in (PRD §6), with a custom window. */
type LogPeriod = "All time" | "This week" | "This month" | "This year" | "Custom";
const LOG_PERIODS: readonly LogPeriod[] = [
  "All time",
  "This week",
  "This month",
  "This year",
  "Custom",
];

function logPeriodStart(period: LogPeriod, from: string): Date | null {
  if (period === "All time") return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "This week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    return start;
  }
  if (period === "This month") return new Date(start.getFullYear(), start.getMonth(), 1);
  if (period === "This year") return new Date(start.getFullYear(), 0, 1);
  const d = new Date(from);
  return Number.isNaN(d.getTime()) ? null : d;
}

const unitWord = (fuel: string) => (fuel === "Gas" ? "KG" : "litres");
const unitLabel = (fuel: string) => (fuel === "Gas" ? "KG" : "LITRES");

function dayLabel(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------ pieces ---- */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative flex h-10 w-full items-center md:w-[320px]">
      <Search className="pointer-events-none absolute left-3 size-4 text-[#9CA3AF]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[6px] border border-[#E2E5E9] bg-white pl-9 pr-3 text-[13.5px] text-[#1B2432] outline-none placeholder:text-[#9CA3AF] focus:border-[#1B2432]"
      />
    </label>
  );
}

/** The red square beside every search box: narrows the list without a query. */
function FilterButton({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Filter"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid size-10 place-items-center rounded-[6px] text-white",
          value === options[0] ? "bg-[#ED351D]" : "bg-[#1B2432]",
        )}
      >
        <SlidersHorizontal className="size-4" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close filter"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-[170px] overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white py-1 shadow-[0px_12px_32px_rgba(12,12,13,0.18)]">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-2 text-left text-[13px] hover:bg-[#F1F2F4]",
                  opt === value ? "font-semibold text-[#1B2432]" : "text-[#5C6470]",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Pager({
  from,
  to,
  total,
  page,
  pageCount,
  onPrev,
  onNext,
  onExport,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
      <span className="text-[15px] font-semibold tabular-nums text-[#1B2432]">
        {from} - {to}
      </span>
      <span className="text-[15px] font-semibold text-[#1B2432]">of {formatQuantity(total)}</span>
      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          disabled={page === 0}
          onClick={onPrev}
          aria-label="Previous page"
          className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
        >
          <ChevronLeft className="size-[18px] text-[#627084]" />
        </button>
        <button
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={onNext}
          aria-label="Next page"
          className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
        >
          <ChevronRight className="size-[18px] text-[#627084]" />
        </button>
        <button
          type="button"
          onClick={onExport}
          className="flex h-10 items-center gap-2 rounded-[6px] bg-[#1B2432] px-4 text-[13.5px] font-semibold text-white hover:bg-[#2a3547]"
        >
          <Download className="size-4" />
          Export CSV
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Approved"
      ? "bg-[#22C55E] text-white"
      : status === "Declined"
        ? "bg-[#ED351D] text-white"
        : "bg-[#F2C200] text-[#1B2432]";
  return (
    <span className={cn("inline-block rounded-[4px] px-2.5 py-1 text-[11px] font-bold", tone)}>
      {status}
    </span>
  );
}

/** The one word the TM is asking about on his own board: has it left the tank? */
function DisbursedPill({ done, at }: { done: boolean; at?: string | null }) {
  return (
    <span
      title={done && at ? `Dispensed ${dayLabel(at)}` : undefined}
      className={cn(
        "inline-block rounded-[4px] px-2.5 py-1 text-[11px] font-bold",
        done ? "bg-[#22C55E] text-white" : "bg-[#F2C200] text-[#1B2432]",
      )}
    >
      {done ? "Disbursed" : "Awaiting Disbursement"}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 text-[12.5px]">
      <span className="shrink-0 text-[#5C6470]">{label}</span>
      <span className="max-w-[60%] text-right font-semibold text-[#1B2432]">{value}</span>
    </div>
  );
}

function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid items-center gap-3 border-b border-[#E2E5E9] pb-3", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- tanks ---- */

function TankCard({
  fuel,
  quantity,
  minLevel,
  price,
  opening,
  inbound,
  disbursed,
}: {
  fuel: LubricantFuel;
  quantity: number;
  minLevel: number;
  price: number;
  opening: number;
  inbound: number;
  disbursed: number;
}) {
  // How full the tank stands against the highest level ever recorded for it —
  // the only honest denominator we hold (there is no typed-in capacity).
  const peak = Math.max(opening, quantity, 1);
  const pct = Math.max(2, Math.min(100, (quantity / peak) * 100));
  const diesel = fuel === "Diesel";
  const tiles: Array<[string, string]> = [
    ["Opening Balance", formatQuantity(opening)],
    ["Inbound Supply", inbound > 0 ? formatQuantity(inbound) : "–"],
    ["Disbursed", formatQuantity(disbursed)],
  ];
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[10px] border bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]",
        diesel ? "border-[#A9E3C6]" : "border-[#F6BDB3]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-semibold text-[#1B2432]">Bulk {fuel} Storage</span>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-[8px]",
            diesel ? "bg-[#E8F8F0] text-[#2BB673]" : "bg-[#FDECEA] text-[#ED351D]",
          )}
        >
          {diesel ? <Droplet className="size-[18px]" /> : <Flame className="size-[18px]" />}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <span className="text-[32px] font-bold leading-none tabular-nums text-[#1B2432]">
            {formatQuantity(quantity)}
          </span>
          <span className="pb-0.5 text-[12px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
            {unitLabel(fuel)}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
          <span
            className={cn("block h-full rounded-full", diesel ? "bg-[#2BB673]" : "bg-[#ED351D]")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-[#5C6470]">
          <span>
            ₦{formatQuantity(price)} / {fuel === "Gas" ? "KG" : "LITER"}
          </span>
          <span>
            Min: {formatQuantity(minLevel)} {unitWord(fuel)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-[6px] bg-[#1B2432] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
              {label}
            </p>
            <p className="mt-1 text-[19px] font-semibold tabular-nums text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- the module ---- */

export function TmLubricant() {
  const [overview, setOverview] = useState<LubricantOverview | null>(null);
  const [restocks, setRestocks] = useState<LubricantRestock[]>([]);
  const [disbursals, setDisbursals] = useState<LubricantDisbursalRow[]>([]);
  const [asks, setAsks] = useState<LubricantRequestRow[]>([]);
  const [priceRows, setPriceRows] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<"inventory" | "log">("inventory");
  const [restockQuery, setRestockQuery] = useState("");
  const [restockFuel, setRestockFuel] = useState<string>("All lubricants");
  const [restockPage, setRestockPage] = useState(0);
  const [logQuery, setLogQuery] = useState("");
  const [logStatus, setLogStatus] = useState<string>("All statuses");
  const [logPage, setLogPage] = useState(0);
  /** The audit engine (PRD §6): the period, the client, and the window. */
  const [logPeriod, setLogPeriod] = useState<LogPeriod>("All time");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [logClient, setLogClient] = useState("All clients");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<LubricantDisbursalRow | null>(null);
  const [decline, setDecline] = useState<LubricantDisbursalRow | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [pricePending, setPricePending] = useState<LubricantFuel | null>(null);
  const [busy, setBusy] = useState(false);
  const [approvedPage, setApprovedPage] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [next, rs, ds, pending, prices] = await Promise.all([
        lubricantService.overview(),
        lubricantService.restocks().catch(() => [] as LubricantRestock[]),
        lubricantService.disbursals().catch(() => [] as LubricantDisbursalRow[]),
        lubricantService.requests().catch(() => [] as LubricantRequestRow[]),
        fuelPriceService.list().catch(() => []),
      ]);
      setOverview(next);
      setRestocks(rs);
      setDisbursals(ds);
      setAsks(pending);
      const map: Record<string, number> = {};
      for (const p of prices) map[p.fuelType] = p.pricePerLitre;
      setPriceRows(Object.keys(map).length > 0 ? map : (next?.prices ?? {}));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the lubricant inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stockFor = (fuel: string) => overview?.stocks.find((s) => s.fuelType === fuel);
  const inboundFor = (fuel: string) =>
    restocks.filter((r) => r.fuelType === fuel).reduce((sum, r) => sum + r.quantity, 0);
  const disbursedFor = (fuel: string) =>
    disbursals.filter((d) => d.fuelType === fuel).reduce((sum, d) => sum + d.quantity, 0);
  /** Opening + inbound − disbursed = what stands now, so opening is the balance
   *  the tank opened at before this ledger began. */
  const openingFor = (fuel: string) => {
    const q = stockFor(fuel)?.quantity ?? 0;
    return Math.max(0, q - inboundFor(fuel) + disbursedFor(fuel));
  };
  const priceFor = (fuel: string) => priceRows[fuel] ?? 0;

  /* ------------------------------------------------------------ restocks ---- */

  const restockRows = useMemo(() => {
    const q = restockQuery.trim().toLowerCase();
    return restocks.filter((r) => {
      if (restockFuel !== "All lubricants" && r.fuelType !== restockFuel) return false;
      if (!q) return true;
      return [r.reference, r.fuelType, r.loggedBy, dayLabel(r.createdAt)].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [restocks, restockQuery, restockFuel]);

  const restockPageCount = Math.max(1, Math.ceil(restockRows.length / PAGE_SIZE));
  const safeRestockPage = Math.min(restockPage, restockPageCount - 1);
  const restockSlice = restockRows.slice(
    safeRestockPage * PAGE_SIZE,
    (safeRestockPage + 1) * PAGE_SIZE,
  );

  /* ----------------------------------------------------------------- log ---- */

  const logClients = useMemo(() => {
    const names = new Set<string>();
    for (const d of disbursals) {
      const c = d.customer?.trim() || d.trip?.customer?.trim();
      if (c) names.add(c);
    }
    return ["All clients", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [disbursals]);

  const logRows = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    const start = logPeriodStart(logPeriod, logFrom);
    const end = logPeriod === "Custom" && logTo ? new Date(`${logTo}T23:59:59`) : null;
    return disbursals.filter((d) => {
      const at = new Date(d.createdAt);
      if (start && (Number.isNaN(at.getTime()) || at < start)) return false;
      if (end && (Number.isNaN(at.getTime()) || at > end)) return false;
      const status = String(d.status ?? "Pending");
      if (logStatus !== "All statuses" && status !== logStatus) return false;
      if (logClient !== "All clients") {
        const c = d.customer?.trim() || d.trip?.customer?.trim() || "";
        if (c !== logClient) return false;
      }
      if (!q) return true;
      const v = resolveVehicle(d);
      return [
        d.reference,
        dayLabel(d.createdAt),
        v.driverName,
        v.capNumber,
        v.plate,
        v.driverPhone,
        lubricantWithQuantity(d.fuelType, d.quantity),
        d.dispensedBy,
        d.customer ?? d.trip?.customer,
        status,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [disbursals, logQuery, logStatus, logPeriod, logFrom, logTo, logClient]);

  const logPageCount = Math.max(1, Math.ceil(logRows.length / PAGE_SIZE));
  const safeLogPage = Math.min(logPage, logPageCount - 1);
  const logSlice = logRows.slice(safeLogPage * PAGE_SIZE, (safeLogPage + 1) * PAGE_SIZE);
  const pendingReviews = disbursals.filter(
    (d) => String(d.status ?? "Pending") === "Pending",
  ).length;
  /** Aggregated analytics (PRD §6): summed volume per fuel in the window. */
  const logTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of logRows) totals[d.fuelType] = (totals[d.fuelType] ?? 0) + d.quantity;
    return totals;
  }, [logRows]);

  const review = async (row: LubricantDisbursalRow, status: "Approved" | "Declined") => {
    setBusy(true);
    try {
      await lubricantService.reviewDisbursal(row.id, status);
      toast.success(
        status === "Approved"
          ? `${row.reference} endorsed — ${formatQuantity(row.quantity)} ${lubricantUnit(row.fuelType)} accepted.`
          : `${row.reference} flagged as declined.`,
      );
      setMenuFor(null);
      setDecline(null);
      setDetail(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The review was not saved.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * HIS BOARD, drawn as the sheet he reads from (Date Approved · Date
   * Dispensed · … · Status: Pending or Dispensed): every trip his FINAL
   * approval has cleared — Scheduled or already moving — with whether the
   * department has dispensed it yet. The approval IS the release; there is
   * no separate authorization step between his sign-off and the pump.
   */
  const approvedRows = useMemo(() => {
    const q = restockQuery.trim().toLowerCase();
    return asks
      .filter((a) => approvalGate(a) === "released")
      .filter((a) => restockFuel === "All lubricants" || a.request.fuelType === restockFuel)
      .filter((a) => {
        if (!q) return true;
        const v = resolveVehicle(a);
        return [
          lubricantDispatchId(a),
          a.customer,
          v.driverName,
          v.capNumber,
          v.plate,
          displayDriverSalary(a.driver ?? undefined),
          a.dropoff,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(q),
        );
      })
      .sort((a, b) => String(b.approvedAt ?? "").localeCompare(String(a.approvedAt ?? "")));
  }, [asks, restockQuery, restockFuel]);
  /** Which of his releases the department has actually poured, by trip. */
  const pouredByTrip = useMemo(() => {
    const map = new Map<string, LubricantDisbursalRow>();
    for (const d of disbursals) if (!map.has(d.tripId)) map.set(d.tripId, d);
    return map;
  }, [disbursals]);
  const approvedPageCount = Math.max(1, Math.ceil(approvedRows.length / PAGE_SIZE));
  const safeApprovedPage = Math.min(approvedPage, approvedPageCount - 1);
  const approvedSlice = approvedRows.slice(
    safeApprovedPage * PAGE_SIZE,
    (safeApprovedPage + 1) * PAGE_SIZE,
  );
  /* -------------------------------------------------------------- pricing ---- */

  const openPricing = () => {
    const draft: Record<string, string> = {};
    for (const fuel of FUELS) draft[fuel] = String(priceFor(fuel) || "");
    setPriceDraft(draft);
    setPricingOpen(true);
  };

  const confirmPrice = async () => {
    if (!pricePending) return;
    const next = Number(String(priceDraft[pricePending] || "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(next) || next <= 0) {
      toast.error("Enter a positive price.");
      return;
    }
    setBusy(true);
    try {
      await fuelPriceService.update(pricePending, next);
      toast.success(
        `${pricePending} priced at ₦${formatQuantity(next)} per ${pricePending === "Gas" ? "kg" : "litre"}.`,
      );
      setPricePending(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The price was not saved.");
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------------- views ---- */

  const inventory = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
            Lubricant Inventory
          </h2>
          <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
            Manage lubricant inventory and restock records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setView("log")}
            className="h-10 rounded-[6px] bg-[#ED351D] px-4 text-[13.5px] font-semibold text-white hover:bg-[#d92c15]"
          >
            View Disbursal Log
          </button>
          <button
            type="button"
            onClick={openPricing}
            className="h-10 rounded-[6px] bg-[#1B2432] px-4 text-[13.5px] font-semibold text-white hover:bg-[#2a3547]"
          >
            Manage Lubricant Pricing
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {FUELS.map((fuel) => {
          const stock = stockFor(fuel);
          return (
            <TankCard
              key={fuel}
              fuel={fuel}
              quantity={stock?.quantity ?? 0}
              minLevel={stock?.minLevel ?? 0}
              price={priceFor(fuel)}
              opening={openingFor(fuel)}
              inbound={inboundFor(fuel)}
              disbursed={disbursedFor(fuel)}
            />
          );
        })}
      </div>

      {/**
       * HIS APPROVALS, drawn as the sheet he reads from: every trip his FINAL
       * approval has cleared, with the one status the sheet tracks — Pending
       * or Dispensed. The approval IS the release; nothing else gates the pump.
       */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Approved Lubricant Releases
            </h3>
            {approvedRows.length > 0 ? (
              <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
                {formatQuantity(approvedRows.length)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <SearchField
              value={restockQuery}
              onChange={(v) => {
                setRestockQuery(v);
                setRestockPage(0);
              }}
              placeholder="Search"
            />
            <FilterButton
              options={["All lubricants", "Diesel", "Gas"]}
              value={restockFuel}
              onChange={(v) => {
                setRestockFuel(v);
                setRestockPage(0);
              }}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <TableHead className="grid-cols-[1fr_1fr_1fr_1.1fr_1.1fr_1fr_1fr_1.1fr_0.9fr] text-[13.5px] font-semibold text-[#1B2432]">
            <span>Date Approved</span>
            <span>Date Dispensed</span>
            <span>Customer</span>
            <span>Truck Head (Cap/Plate No.)</span>
            <span>Driver Details (Salary No./Name)</span>
            <span>Quantity</span>
            <span>Destination</span>
            <span>Dispensed by</span>
            <span>Status</span>
          </TableHead>
          {loading ? (
            <p className="py-6 text-[13px] text-[#5C6470]">Loading your approvals…</p>
          ) : approvedSlice.length === 0 ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              Nothing is waiting on the pump. A dispatch lands here the moment your final approval
              schedules it, and leaves the Pending state once the department dispenses it.
            </p>
          ) : (
            approvedSlice.map((ask) => {
              const v = resolveVehicle(ask);
              const pour = pouredByTrip.get(ask.id);
              return (
                <div
                  key={ask.id}
                  className="grid grid-cols-[1fr_1fr_1fr_1.1fr_1.1fr_1fr_1fr_1.1fr_0.9fr] items-center gap-3 border-b border-[#E2E5E9] py-3.5 text-[13.5px] text-[#344256]"
                >
                  <span>{dayLabel(ask.approvedAt)}</span>
                  <span>{pour ? dayLabel(pour.createdAt) : "—"}</span>
                  <span className="truncate">{ask.customer || "—"}</span>
                  <span className="truncate text-[#5C6470]">
                    {[v.capNumber, v.plate].filter((x) => x && x !== "—").join(" / ") || "—"}
                  </span>
                  <span className="truncate">
                    {[displayDriverSalary(ask.driver ?? undefined), v.driverName]
                      .filter((x) => x && x !== "—")
                      .join(" · ") || "—"}
                  </span>
                  <span>
                    {formatQuantity(ask.request.quantity)}{" "}
                    <span className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
                      {unitLabel(ask.request.fuelType)}
                    </span>
                  </span>
                  <span className="truncate">{ask.dropoff || "—"}</span>
                  <span className="truncate">{pour?.dispensedBy || "—"}</span>
                  <span>
                    <DisbursedPill done={Boolean(pour)} at={pour?.createdAt} />
                  </span>
                </div>
              );
            })
          )}
        </div>

        <Pager
          from={approvedRows.length === 0 ? 0 : safeApprovedPage * PAGE_SIZE + 1}
          to={Math.min((safeApprovedPage + 1) * PAGE_SIZE, approvedRows.length)}
          total={approvedRows.length}
          page={safeApprovedPage}
          pageCount={approvedPageCount}
          onPrev={() => setApprovedPage((p) => Math.max(0, p - 1))}
          onNext={() => setApprovedPage((p) => p + 1)}
          onExport={() =>
            exportCsv(
              "lubricant-approved-releases.csv",
              [
                "Date Approved",
                "Date Dispensed",
                "Customer",
                "Truck Head (Cap/Plate)",
                "Driver Details (Salary No./Name)",
                "Quantity",
                "Unit",
                "Destination",
                "Dispensed by",
                "Status",
              ],
              approvedRows.map((ask) => {
                const v = resolveVehicle(ask);
                const pour = pouredByTrip.get(ask.id);
                return [
                  dayLabel(ask.approvedAt),
                  pour ? dayLabel(pour.createdAt) : "",
                  ask.customer ?? "",
                  [v.capNumber, v.plate].filter((x) => x && x !== "—").join(" / "),
                  [displayDriverSalary(ask.driver ?? undefined), v.driverName]
                    .filter((x) => x && x !== "—")
                    .join(" · "),
                  ask.request.quantity,
                  unitLabel(ask.request.fuelType),
                  ask.dropoff ?? "",
                  pour?.dispensedBy ?? "",
                  pour ? "Dispensed" : "Pending",
                ];
              }),
            )
          }
        />
      </Card>
    </>
  );

  const log = (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back to lubricant inventory"
          onClick={() => setView("inventory")}
          className="grid size-9 place-items-center rounded-full text-[#1B2432] hover:bg-white"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h2 className="text-[19px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[21px]">
          Review lubricant disbursed to dispatch
        </h2>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Logged Disbursal
            </h3>
            <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
              {formatQuantity(disbursals.length)}
            </span>
            {pendingReviews > 0 ? (
              <span className="text-[12.5px] text-[#5C6470]">
                {formatQuantity(pendingReviews)} awaiting your review
              </span>
            ) : null}
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <SearchField
              value={logQuery}
              onChange={(v) => {
                setLogQuery(v);
                setLogPage(0);
              }}
              placeholder="Search"
            />
            <FilterButton
              options={["All statuses", "Pending", "Approved", "Declined"]}
              value={logStatus}
              onChange={(v) => {
                setLogStatus(v);
                setLogPage(0);
              }}
            />
          </div>
        </div>

        {/**
         * The audit controls (PRD §6): the period the ledger is read in, the
         * client the litres belong to, and the window itself when neither
         * preset is honest enough. The department's own history carries the
         * same three; this is the money side reading the same facts.
         */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">Period</span>
            <select
              value={logPeriod}
              onChange={(e) => {
                setLogPeriod(e.target.value as LogPeriod);
                setLogPage(0);
              }}
              className="h-10 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
            >
              {LOG_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {logPeriod === "Custom" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">From</span>
                <input
                  type="date"
                  value={logFrom}
                  onChange={(e) => {
                    setLogFrom(e.target.value);
                    setLogPage(0);
                  }}
                  className="h-10 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">To</span>
                <input
                  type="date"
                  value={logTo}
                  onChange={(e) => {
                    setLogTo(e.target.value);
                    setLogPage(0);
                  }}
                  className="h-10 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">Client</span>
            <select
              value={logClient}
              onChange={(e) => {
                setLogClient(e.target.value);
                setLogPage(0);
              }}
              className="h-10 max-w-[220px] rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
            >
              {logClients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col">
          <TableHead className="grid-cols-[1fr_1fr_1.1fr_1.2fr_1.1fr_1fr_1.1fr_0.9fr_40px] text-[13.5px] font-semibold text-[#1B2432]">
            <span>Dispatch ID</span>
            <span>Date</span>
            <span>Driver</span>
            <span>Truck Head</span>
            <span>Phone Number</span>
            <span>Lubricant</span>
            <span>Dispensed by</span>
            <span>Status</span>
            <span />
          </TableHead>
          {loading ? (
            <p className="py-6 text-[13px] text-[#5C6470]">Loading the disbursal ledger…</p>
          ) : logSlice.length === 0 ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              Nothing has been dispensed yet. Every disbursal the Lubricant department logs appears
              here for you to endorse or flag.
            </p>
          ) : (
            logSlice.map((row) => {
              const v = resolveVehicle(row);
              const status = String(row.status ?? "Pending");
              const capPlate = [v.capNumber, v.plate].filter((x) => x && x !== "—").join(" · ");
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setDetail(row);
                  }}
                  className="grid cursor-pointer grid-cols-[1fr_1fr_1.1fr_1.2fr_1.1fr_1fr_1.1fr_0.9fr_40px] items-center gap-3 border-b border-[#E2E5E9] py-3.5 text-[13.5px] text-[#344256] hover:bg-[#F7F8F9]"
                >
                  <span className="font-medium text-[#1B2432]">{lubricantDispatchId(row)}</span>
                  <span>{dayLabel(row.createdAt)}</span>
                  <span>{v.driverName}</span>
                  <span className="text-[#5C6470]">{capPlate || "—"}</span>
                  <span className="text-[#5C6470]">{v.driverPhone || "—"}</span>
                  <span>{lubricantWithQuantity(row.fuelType, row.quantity)}</span>
                  <span>{row.dispensedBy}</span>
                  <span>
                    <StatusPill status={status} />
                  </span>
                  <span className="relative flex justify-end">
                    <button
                      type="button"
                      aria-label={`Actions for ${row.reference}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor((cur) => (cur === row.id ? null : row.id));
                      }}
                      className="grid size-8 place-items-center rounded-[4px] text-[#1B2432] hover:bg-[#F1F2F4]"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                    {menuFor === row.id ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-9 z-20 flex w-[150px] flex-col gap-2 rounded-[10px] border border-[#E2E5E9] bg-white p-2.5 shadow-[0px_14px_40px_rgba(12,12,13,0.22)]"
                      >
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void review(row, "Approved")}
                          className="h-9 rounded-[4px] bg-[#ED351D] text-[13px] font-semibold text-white hover:bg-[#d92c15] disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setMenuFor(null);
                            setDecline(row);
                          }}
                          className="h-9 rounded-[4px] border border-[#E2E5E9] bg-white text-[13px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4] disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    ) : null}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {logRows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[6px] bg-[#F1F2F4] px-4 py-3">
            <span className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
              {logRows.length} disbursal{logRows.length === 1 ? "" : "s"}
              {logClient !== "All clients" ? ` for ${logClient}` : ""}
            </span>
            {Object.entries(logTotals).map(([fuel, total]) => (
              <span key={fuel} className="text-[12.5px] tracking-[0.4px] text-[#1B2432]">
                {fuel}: <span className="font-semibold tabular-nums">{formatQuantity(total)}</span>{" "}
                {unitWord(fuel)}
              </span>
            ))}
          </div>
        ) : null}

        <Pager
          from={logRows.length === 0 ? 0 : safeLogPage * PAGE_SIZE + 1}
          to={Math.min((safeLogPage + 1) * PAGE_SIZE, logRows.length)}
          total={logRows.length}
          page={safeLogPage}
          pageCount={logPageCount}
          onPrev={() => setLogPage((p) => Math.max(0, p - 1))}
          onNext={() => setLogPage((p) => p + 1)}
          onExport={() =>
            exportCsv(
              "lubricant-disbursals.csv",
              [
                "Dispatch ID",
                "Date",
                "Driver",
                "Truck Head",
                "Phone Number",
                "Client",
                "Lubricant",
                "Quantity",
                "Unit",
                "Dispensed by",
                "Status",
              ],
              logRows.map((d) => {
                const v = resolveVehicle(d);
                return [
                  lubricantDispatchId(d),
                  dayLabel(d.createdAt),
                  v.driverName,
                  [v.capNumber, v.plate].filter((x) => x && x !== "—").join(" / "),
                  v.driverPhone,
                  d.customer ?? d.trip?.customer ?? "",
                  d.fuelType,
                  d.quantity,
                  unitLabel(d.fuelType),
                  d.dispensedBy,
                  String(d.status ?? "Pending"),
                ];
              }),
            )
          }
        />

        {/** Print Report (PRD §6): the filtered window as a paper ledger —
            volumes and statuses only; pricing stays on the inventory view. */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={logRows.length === 0}
            onClick={() =>
              printDisbursalLedger(logRows, {
                period:
                  logPeriod === "Custom"
                    ? `${logFrom || "…"} → ${logTo || "…"}`
                    : logPeriod.toLowerCase(),
                client: logClient,
              })
            }
            className="flex h-10 items-center gap-2 rounded-[6px] border border-[#1B2432] px-5 text-[13.5px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4] disabled:opacity-40"
          >
            <Printer className="size-4" />
            Print Report
          </button>
        </div>
      </Card>
    </>
  );

  const detailVehicle = detail ? resolveVehicle(detail) : null;

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[26px] md:p-[30px]">
      {view === "inventory" ? inventory : log}

      {detail && detailVehicle ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="max-h-[90vh] w-[430px] max-w-full overflow-y-auto rounded-[10px] bg-white p-5 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]">
            <h3 className="text-[20px] font-bold tracking-[0.4px] text-[#1B2432]">
              Dispatch Details
            </h3>
            <p className="mt-1 text-[11px] uppercase tracking-[0.4px] text-[#9CA3AF]">
              TICKET {lubricantDispatchId(detail)} <span className="mx-1">•</span>{" "}
              {dayLabel(detail.createdAt).toUpperCase()}
            </p>

            <div className="mt-4 flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
              <span className="text-[13px] font-bold text-[#1B2432]">
                Vehicle & Operator Details
              </span>
              <DetailRow label="Truck Head (Cap Number):" value={detailVehicle.capNumber} />
              <DetailRow label="Truck Head Plate Number:" value={detailVehicle.plate} />
              <DetailRow
                label="Truck Tail assigned:"
                value={[detailVehicle.bodyType, detailVehicle.tailNumber]
                  .filter((x) => x && x !== "—")
                  .join(" ")}
              />
              <DetailRow
                label="Driver Assigned:"
                value={[
                  detailVehicle.driverName,
                  detailVehicle.driverCode ? `(${detailVehicle.driverCode})` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <DetailRow label="Driver Contact Phone:" value={detailVehicle.driverPhone} />
              <DetailRow
                label="Destination:"
                value={detail.destination || detail.trip?.dropoff || undefined}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[13px] font-bold text-[#1B2432]">
                Select Lubricant to Restock <span className="text-[#ED351D]">*</span>
              </span>
              <div className="flex items-center gap-4">
                {FUELS.map((fuel) => (
                  <label key={fuel} className="flex items-center gap-2 text-[13px] text-[#344256]">
                    <input
                      type="radio"
                      name={`fuel-${detail.id}`}
                      checked={detail.fuelType === fuel}
                      readOnly
                      className="size-3.5 accent-[#ED351D]"
                    />
                    {fuel}
                  </label>
                ))}
                <span className="ml-auto w-[130px] rounded-[4px] bg-[#F1F2F4] px-3 py-2 text-right text-[13px] font-semibold tabular-nums text-[#1B2432]">
                  {formatQuantity(detail.quantity)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[13px] font-bold text-[#1B2432]">
                Dispensed by <span className="text-[#ED351D]">*</span>
              </span>
              <span className="rounded-[4px] bg-[#F1F2F4] px-3 py-2 text-[13px] text-[#344256]">
                {detail.dispensedBy}
              </span>
            </div>

            <p className="mt-3 text-[11px] leading-4 text-[#9CA3AF]">
              As logged at the pump — the entry itself is never edited, so the ledger stays true.
              Endorse it, or flag it as declined.
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="h-9 rounded-[6px] px-3 text-[13px] font-semibold text-[#ED351D] hover:bg-[#FDECEA]"
              >
                Cancel
              </button>
              {String(detail.status ?? "Pending") !== "Declined" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDetail(null);
                    setDecline(detail);
                  }}
                  className="h-9 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4] disabled:opacity-50"
                >
                  Decline
                </button>
              ) : null}
              {String(detail.status ?? "Pending") !== "Approved" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void review(detail, "Approved")}
                  className="h-9 rounded-[6px] bg-[#ED351D] px-4 text-[13px] font-semibold text-white hover:bg-[#d92c15] disabled:opacity-50"
                >
                  Approve
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {pricingOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPricingOpen(false);
          }}
        >
          <div className="w-[520px] max-w-full rounded-[10px] bg-white p-5 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]">
            <h3 className="text-[18px] font-bold tracking-[0.4px] text-[#1B2432]">
              Manage Lubricant Pricing
            </h3>
            {FUELS.map((fuel) => (
              <div key={fuel} className="mt-4 flex flex-col gap-2.5 rounded-[6px] bg-[#F1F2F4] p-4">
                <span className="text-[13px] font-bold text-[#1B2432]">Bulk {fuel} Storage</span>
                <label className="text-[12.5px] text-[#344256]">
                  Price per {fuel === "Gas" ? "KG" : "LITRES"} (₦){" "}
                  <span className="text-[#ED351D]">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    value={priceDraft[fuel] ?? ""}
                    onChange={(e) =>
                      setPriceDraft((cur) => ({
                        ...cur,
                        [fuel]: e.target.value.replace(/[^0-9.]/g, ""),
                      }))
                    }
                    inputMode="numeric"
                    className="h-11 flex-1 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[14px] tabular-nums text-[#1B2432] outline-none focus:border-[#1B2432]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPricePending(fuel)}
                    className="h-11 rounded-[6px] bg-[#ED351D] px-6 text-[14px] font-semibold text-white hover:bg-[#d92c15] disabled:opacity-50"
                  >
                    Update
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setPricingOpen(false)}
                className="h-9 rounded-[6px] px-3 text-[13px] font-semibold text-[#5C6470] hover:bg-[#F1F2F4]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={decline !== null}
        title="Flag this disbursal?"
        body={
          decline
            ? `${formatQuantity(decline.quantity)} ${lubricantUnit(decline.fuelType)} for ${decline.reference} will be marked as declined, and the Lubricant department will see it on their ledger.`
            : ""
        }
        confirmLabel="Decline"
        tone="danger"
        busy={busy}
        onConfirm={() => decline && void review(decline, "Declined")}
        onCancel={() => setDecline(null)}
      />

      <ConfirmDialog
        open={pricePending !== null}
        title="Update this price?"
        body={
          pricePending
            ? `Are you sure you want to update the ${pricePending} price to ₦${formatQuantity(
                Number(pricePending ? priceDraft[pricePending] : 0),
              )} per ${pricePending === "Gas" ? "kg" : "litre"}? Every new disbursal is priced at it — history keeps the rate it was pumped at.`
            : ""
        }
        confirmLabel="Confirm"
        busy={busy}
        onConfirm={() => void confirmPrice()}
        onCancel={() => setPricePending(null)}
      />
    </div>
  );
}
