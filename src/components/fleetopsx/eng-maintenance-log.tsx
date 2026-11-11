/**
 * THE MAINTENANCE LOG — the fleet's repair history, read by truck.
 *
 * What this replaced was a single line: "SBG566XR • GKJGKJHGKJHG • 2026-11-10 •
 * Minor". It named one job, said nothing about when the truck was fixed, what
 * was actually done, how long it stood in the workshop, or how often the same
 * fault has come back — so the desk that has to decide whether a truck is
 * worth keeping had to keep that in its head.
 *
 * The record is one row per closed job (Ready to Go, or an inspection that
 * found nothing and closed the job it was checking). Everything on this page is
 * derived from those rows and the parts drawn against them:
 *
 *   - the history of one truck, newest first, with what was repaired and by whom
 *   - how many times it was repaired in the chosen period
 *   - how long each repair took (started → signed off), and the average
 *   - what the repair cost: the job's own figure plus the parts it consumed
 *   - a repeat-fault flag when the same wording comes back twice in the period
 *
 * And the chat: a truck under repair has a thread of its own, opened from here,
 * so "is Friday still realistic?" is asked in one place with a record of the
 * answer instead of on a phone call nobody wrote down.
 */
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, MessageSquare, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { chatService } from "@/lib/fleetopsx/chat";
import { formatTableDate } from "@/lib/fleetopsx/display-dates";
import { truckLabel } from "@/lib/fleetopsx/engineering-helpers";
import type {
  InventoryRequisition,
  TruckHead,
  TruckTail,
  WorkOrder,
} from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/** The defect text written when a repair is closed with no fault on record. */
const PLACEHOLDER_FAULT = "repair completed — no fault was logged on the job";
const isPlaceholderFault = (defect?: string) => {
  const text = String(defect || "").trim().toLowerCase();
  return !text || text === PLACEHOLDER_FAULT || text.length < 4;
};

/** `P073 (APP857YL)` and `APP857YL` must land in the same bucket. */
export function maintenancePlate(raw: string): string {
  const text = String(raw || "").trim();
  const bracketed = /\(([^)]+)\)\s*$/.exec(text);
  return (bracketed?.[1] ?? text).trim().toUpperCase();
}

const naira = (value: number) =>
  `₦${Math.round(Number(value) || 0).toLocaleString("en-NG")}`;

/** Whole days between two stamps — the truck's time off the road. */
function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

type PartLine = { name: string; qty: number; value: number };

/** One closed job, with what the workshop did on it. */
export type RepairRecord = {
  id: string;
  plate: string;
  /** The plate exactly as the job wrote it, so the card can still print it. */
  rawReg: string;
  defect: string;
  notes: string;
  severity: string;
  mechanic: string;
  inspectedBy: string;
  reportedBy: string;
  startedAt: string;
  completedAt: string;
  days: number | null;
  parts: PartLine[];
  partsValue: number;
  cost: number;
  cancelled: boolean;
  /** Normalised defect wording — the key a repeat fault is counted on. */
  faultKey: string;
};

const PERIODS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: 0 },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

export function MaintenanceLog({
  orders,
  requisitions,
  heads,
  tails,
}: {
  orders: WorkOrder[];
  requisitions: InventoryRequisition[];
  heads: TruckHead[];
  tails: TruckTail[];
}) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>("90");
  const [query, setQuery] = useState("");
  const [openTruck, setOpenTruck] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState<string | null>(null);

  /** Every closed job, newest first, with its parts attached. */
  const records = useMemo<RepairRecord[]>(() => {
    const partsByJob = new Map<string, PartLine[]>();
    for (const r of requisitions) {
      const jobId = String(r.workOrder || "");
      if (!jobId) continue;
      const qty = Number(r.releasedQty ?? r.quantity ?? 0) || 0;
      const unit = Number(r.unitCost ?? 0) || 0;
      const value =
        r.releasedValue !== null && r.releasedValue !== undefined
          ? Number(r.releasedValue) || 0
          : qty * unit;
      const list = partsByJob.get(jobId) ?? [];
      list.push({ name: String(r.part || "").trim(), qty, value });
      partsByJob.set(jobId, list);
    }
    return orders
      .filter((o) => o.status === "Completed" || o.status === "Cancelled")
      .map((o) => {
        const parts = partsByJob.get(o.id) ?? [];
        const completedAt = o.completedAt || o.reportedAt || "";
        const startedAt = o.startedAt || o.reportedAt || "";
        return {
          id: o.id,
          plate: maintenancePlate(o.truckReg),
          rawReg: o.truckReg,
          defect: String(o.defect || "").trim(),
          notes: String(o.notes || "").trim(),
          severity: String(o.severity || "").trim(),
          mechanic: String(o.mechanic || "").trim(),
          inspectedBy: String(o.inspectedBy || "").trim(),
          reportedBy: String(o.reportedBy || "").trim(),
          startedAt,
          completedAt,
          days: daysBetween(startedAt, completedAt),
          parts,
          partsValue: parts.reduce((sum, p) => sum + p.value, 0),
          cost: Number(o.cost || 0) || 0,
          cancelled: o.status === "Cancelled",
          // A repeat fault is the same named fault coming back. The placeholder
          // written when a truck was signed off with nothing logged is not a
          // fault, so two such records must never read as "it came back".
          faultKey: isPlaceholderFault(o.defect)
            ? ""
            : String(o.defect || "").toLowerCase().replace(/\s+/g, " ").trim(),
        } satisfies RepairRecord;
      })
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  }, [orders, requisitions]);

  const cutoff = useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days ?? 0;
    if (!days) return 0;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    return from.getTime();
  }, [period]);

  const inPeriod = useMemo(
    () =>
      records.filter((r) => {
        if (!cutoff) return true;
        const at = new Date(r.completedAt || "").getTime();
        return !Number.isNaN(at) && at >= cutoff;
      }),
    [records, cutoff],
  );

  /** One card per truck, however many times it was in — the repair history. */
  const trucks = useMemo(() => {
    const byPlate = new Map<string, RepairRecord[]>();
    for (const r of inPeriod) {
      const key = r.plate || "UNKNOWN";
      byPlate.set(key, [...(byPlate.get(key) ?? []), r]);
    }
    return [...byPlate.entries()]
      .map(([plate, rows]) => {
        const faults = new Map<string, number>();
        for (const r of rows) {
          if (!r.faultKey || r.cancelled) continue;
          faults.set(r.faultKey, (faults.get(r.faultKey) ?? 0) + 1);
        }
        const repeat = [...faults.entries()]
          .filter(([, n]) => n > 1)
          .sort((a, b) => b[1] - a[1])[0];
        const head = heads.find(
          (h) =>
            maintenancePlate(h.registration) === plate ||
            maintenancePlate(h.number) === plate ||
            maintenancePlate(h.capNumber || "") === plate,
        );
        const tail = tails.find(
          (t) =>
            maintenancePlate(t.registration) === plate || maintenancePlate(t.number) === plate,
        );
        const label = head
          ? truckLabel(head)
          : tail
            ? tail.registration
              ? `${tail.number} (${tail.registration})`
              : tail.number
            : rows[0]?.rawReg || plate;
        return {
          plate,
          label,
          rows,
          count: rows.length,
          lastAt: rows[0]?.completedAt || "",
          repeat,
          asset: head
            ? ({ kind: "head" as const, id: head.id })
            : tail
              ? ({ kind: "tail" as const, id: tail.id })
              : null,
          spend: rows.reduce((sum, r) => sum + r.cost + r.partsValue, 0),
          days: rows.map((r) => r.days).filter((d): d is number => d !== null),
        };
      })
      .filter((t) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return `${t.label} ${t.plate} ${t.rows.map((r) => r.defect).join(" ")}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt)));
  }, [inPeriod, heads, tails, query]);

  const totals = useMemo(() => {
    const repairs = inPeriod.filter((r) => !r.cancelled);
    const days = repairs.map((r) => r.days).filter((d): d is number => d !== null);
    return {
      repairs: repairs.length,
      trucks: new Set(repairs.map((r) => r.plate)).size,
      avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
      spend: repairs.reduce((sum, r) => sum + r.cost + r.partsValue, 0),
      repeats: repairs.filter((r) => r.faultKey).length
        ? new Set(
            repairs
              .filter((r) => r.faultKey)
              .map((r) => r.faultKey)
              .filter(
                (key, _i, list) => list.filter((k) => k === key).length > 1,
              ),
          ).size
        : 0,
    };
  }, [inPeriod]);

  const openChat = async (truck: (typeof trucks)[number]) => {
    if (!truck.asset) {
      toast.error("That truck is no longer on the register, so it has no thread.");
      return;
    }
    setOpeningChat(truck.plate);
    try {
      const thread = await chatService.openMaintenanceThread(truck.asset.kind, truck.asset.id);
      void navigate({ to: "/workspace/app/messages", search: { thread: thread.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the truck's chat.");
    } finally {
      setOpeningChat(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-[#1B2432]">Maintenance Log</h3>
            <p className="mt-0.5 text-[12.5px] text-[#8E95A1]">
              Every repair closed on the fleet, read by truck — when it was fixed, what was done,
              what it cost, and how often it has come back
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-[12.5px] font-medium",
                    period === p.key
                      ? "border-[#1B2432] bg-[#1B2432] text-white"
                      : "border-[#E2E5E9] bg-white text-[#5C6470] hover:text-[#1B2432]",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the maintenance log"
              placeholder="Search plate or fault"
              className="h-8 w-[190px] rounded-md border border-[#E2E5E9] bg-white px-2.5 text-[12.5px] text-[#1B2432] outline-none placeholder:text-[#A6ADB8] focus:border-[#1B2432]"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ["Repairs closed", String(totals.repairs), "in the chosen period"],
              ["Trucks repaired", String(totals.trucks), "distinct plates"],
              [
                "Average time in",
                totals.avgDays === null ? "—" : `${totals.avgDays.toFixed(1)} days`,
                "start of work → sign-off",
              ],
              ["Repair spend", naira(totals.spend), "labour + parts consumed"],
            ] as const
          ).map(([label, value, hint]) => (
            <div key={label} className="rounded-md border border-[#EDEFF2] bg-[#F7F8FA] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#5C6470]">
                {label}
              </p>
              <p className="mt-0.5 text-[19px] font-semibold leading-6 text-[#1B2432]">{value}</p>
              <p className="text-[11.5px] text-[#8E95A1]">{hint}</p>
            </div>
          ))}
        </div>
        {totals.repeats > 0 ? (
          <p className="mt-2 rounded-md bg-[#FDF6EC] px-3 py-2 text-[12px] text-[#B26A00]">
            {totals.repeats} fault{totals.repeats === 1 ? "" : "s"} came back more than once in
            this period — the truck was repaired, the cause was not found.
          </p>
        ) : null}
      </div>

      {trucks.length === 0 ? (
        <div className="rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-10 text-center">
          <p className="text-[14px] font-medium text-[#1B2432]">
            {records.length === 0
              ? "No repair has been closed yet"
              : "Nothing repaired in this period"}
          </p>
          <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-[#8E95A1]">
            {records.length === 0
              ? "A truck enters this log the moment its job is signed off with Ready to Go — that is the record of what was done, by whom, and how long it stood."
              : "Widen the period, or clear the search, to see the rest of the fleet's history."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {trucks.map((truck) => {
            const open = openTruck === truck.plate;
            return (
              <div
                key={truck.plate}
                className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenTruck(open ? null : truck.plate)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <ChevronDown className="size-4 shrink-0 text-[#5C6470]" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-[#5C6470]" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold text-[#1B2432]">
                        {truck.label}
                      </span>
                      <span className="text-[12.5px] text-[#5C6470]">
                        {truck.count} repair{truck.count === 1 ? "" : "s"} · last{" "}
                        {formatTableDate(truck.lastAt)}
                        {truck.days.length
                          ? ` · ${(truck.days.reduce((a, b) => a + b, 0) / truck.days.length).toFixed(1)} days in on average`
                          : ""}
                        {truck.spend > 0 ? ` · ${naira(truck.spend)}` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {truck.repeat ? (
                      <span className="rounded-full bg-[#FDECEA] px-2 py-0.5 text-[11px] font-medium text-[#B42318]">
                        Repeat fault ×{truck.repeat[1]}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={openingChat === truck.plate}
                      onClick={() => void openChat(truck)}
                      className="flex h-8 items-center gap-1.5 rounded border border-[#E2E5E9] bg-white px-2.5 text-[12.5px] font-medium text-[#1B2432] hover:bg-[#F4F6F8] disabled:opacity-50"
                    >
                      <MessageSquare className="size-3.5" />
                      {openingChat === truck.plate ? "Opening…" : "Chat"}
                    </button>
                  </div>
                </div>

                {open ? (
                  <div className="flex flex-col divide-y divide-[#EDEFF2] border-t border-[#EDEFF2]">
                    {truck.rows.map((r) => (
                      <div key={r.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[13.5px] font-medium text-[#1B2432]">
                            {r.defect || "Passed inspection — nothing to repair"}
                          </p>
                          <p className="text-[12px] text-[#5C6470]">
                            {r.cancelled ? "Cancelled " : "Closed "}
                            {formatTableDate(r.completedAt)}
                            {r.days !== null ? ` · ${r.days} day${r.days === 1 ? "" : "s"} in` : ""}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-[#5C6470]">
                          {r.severity ? <span>Severity: {r.severity}</span> : null}
                          {r.mechanic ? (
                            <span>
                              Work done by: <span className="text-[#1B2432]">{r.mechanic}</span>
                            </span>
                          ) : null}
                          {r.inspectedBy ? <span>Inspected by: {r.inspectedBy}</span> : null}
                          {r.cost > 0 ? <span>Labour/external: {naira(r.cost)}</span> : null}
                        </div>
                        {r.notes ? (
                          <p className="mt-1.5 rounded-md bg-[#F7F8FA] px-2.5 py-1.5 text-[12px] text-[#344256]">
                            <span className="font-medium text-[#5C6470]">What was done: </span>
                            {r.notes}
                          </p>
                        ) : null}
                        {r.parts.length > 0 ? (
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#5C6470]">
                            <Wrench className="size-3.5 text-[#8E95A1]" />
                            Parts fitted:{" "}
                            {r.parts.map((p, i) => (
                              <span key={`${r.id}-${p.name}-${i}`} className="text-[#1B2432]">
                                {p.name} ×{p.qty}
                                {p.value > 0 ? ` (${naira(p.value)})` : ""}
                                {i < r.parts.length - 1 ? "," : ""}
                              </span>
                            ))}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-[12px] text-[#A6ADB8]">No parts drawn on this job.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
