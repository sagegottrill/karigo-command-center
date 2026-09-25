import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Clock,
  Droplet,
  Fuel,
  Gauge,
  History,
  MapPinned,
  Navigation,
  Package,
  Route as RouteIcon,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import {
  adminService,
  authService,
  dashboardService,
  engineeringService,
  fleetService,
  fuelService,
  inventoryService,
  lubricantService,
  procurementService,
} from "@/lib/fleetopsx/services";
import {
  formatClockTime,
  formatDayLabel,
  isCustomerRequest,
  localDayKey,
} from "@/lib/fleetopsx/daily-stats";
import {
  PERIOD_TABS,
  inPeriod,
  parseDateInput,
  periodActivity,
  periodRange,
  type PeriodKind,
} from "@/lib/fleetopsx/period";
import {
  ACTIVE_DISPATCH_BUCKETS,
  countBuckets,
  isInBucket,
  toPartnerUiStatus,
  tripBucket,
  type PartnerUiStatus,
} from "@/lib/fleetopsx/status-buckets";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { displayCapPlateFromTrip } from "@/lib/fleetopsx/display-ids";
import {
  formatDateLines,
  formatDateTimeStamp,
  formatTableDate,
} from "@/lib/fleetopsx/display-dates";
import {
  DOWNTIME_FLAG_DAYS,
  buildEngineeringOversight,
  buildSecurityOversight,
  formatDuration,
  type EngJob,
  type EngPartRequest,
  type SecTrip,
} from "@/lib/fleetopsx/dashboard-departments";
import {
  buildFuelOversight,
  type FuelAsk,
  type FuelLedgerRow,
} from "@/lib/fleetopsx/dashboard-fuel";
import {
  buildPartsOversight,
  type MovementRow,
  type StoreLineRow,
} from "@/lib/fleetopsx/dashboard-parts";
import {
  getTrackingDelayStatus,
  partnerOf,
  TRACKING_DELAY_COLOR,
} from "@/lib/fleetopsx/tracking-ops";
import {
  formatMoney,
  formatQuantity,
  type LubricantDisbursalRow,
  type LubricantRequestRow,
  type LubricantRestock,
  type LubricantStock,
} from "@/lib/fleetopsx/lubricant";
import { licenseExpiry } from "@/lib/fleetopsx/license";
import { cn } from "@/lib/utils";
import type {
  Driver,
  Expense,
  FuelRequisition,
  InventoryItem,
  InventoryMovement,
  InventoryRequisition,
  Trip,
  TruckHead,
  TruckTail,
  User,
  WorkOrder,
  ProcurementRequest,
} from "@/lib/fleetopsx/types";
import { DashboardLiveMap } from "./dashboard-live-map";
import { LiveMetricTile, TileCostColumns, TileDetailRows } from "./live-metric-tile";
import {
  AuditDialog,
  DrillPopover,
  DrillRow,
  StatusPill,
  ToneTabs,
  TONE,
  printSheet,
  useDrill,
  type TileTone,
} from "./dashboard-drill";

type OverviewData = {
  trips: Trip[];
  trucks: TruckHead[];
  drivers: Driver[];
  expenses: Expense[];
};

const CARD_SHADOW =
  "shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.1),0px_4px_4px_-4px_rgba(12,12,13,0.05)]";

const FLEET_SEGMENTS = [
  { id: "all", label: "All Fleet" },
  { id: "head", label: "Truck Head" },
  { id: "tail", label: "Truck Tail" },
] as const;
type FleetSegment = (typeof FLEET_SEGMENTS)[number]["id"];

/* ------------------------------------------------------------------ helpers */

/** The direct costs configured on a request — the money side of a dispatch. */
function directCostOf(trip: Trip) {
  const c = trip.directCosts;
  if (!c) return 0;
  return (
    Number(c.tripAllowance ?? 0) +
    Number(c.returnWaybill ?? 0) +
    Number(c.motorBoy ?? 0) +
    Number(c.ticket ?? 0) +
    Number(c.extraAllowance ?? 0) +
    Number(c.bonus ?? 0)
  );
}

/**
 * Fleet status → the words the design uses. `Out of Yard` and `Assigned` are the
 * same physical fact from the desk's point of view — the truck is out on a job —
 * so both read ON TRIP, exactly as the Figma's breakdown popover shows.
 */
function fleetStatusWord(status: string): { word: string; tone: TileTone } {
  switch (String(status).trim()) {
    case "Available":
      return { word: "AVAILABLE", tone: "green" };
    case "Check Up":
      return { word: "UNDER CHECKUP", tone: "blue" };
    case "Maintenance":
      return { word: "UNDER MAINTENANCE", tone: "amber" };
    case "Accident":
      return { word: "OUT OF ORDER", tone: "red" };
    default:
      return { word: "ON TRIP", tone: "grey" };
  }
}

/** `P062 • GGE98YK` for a head, `B079 • FLATBED TAIL` for a tail. */
function headLabel(head: TruckHead) {
  return [cleanAssetNumber(head.number), String(head.registration ?? "").trim()]
    .filter(Boolean)
    .join(" • ");
}

/**
 * `B079 • FLATBED` — the design names a tail by its body, not by the word
 * "TAIL": the roster type is `Flatbed Tail`, so the trailing word is trimmed
 * before it is shouted. A roster row with no number reads as just its body
 * rather than as `None • TRAILER`.
 */
function tailLabel(tail: TruckTail) {
  const body = String(tail.type ?? "")
    .replace(/\s*tail\s*$/i, "")
    .trim()
    .toUpperCase();
  return [cleanAssetNumber(tail.number), body].filter(Boolean).join(" • ") || "—";
}

/** A missing roster number arrives as the literal string "None" — never print it. */
function cleanAssetNumber(value: unknown) {
  const text = String(value ?? "").trim();
  return !text || /^none$/i.test(text) ? "" : text;
}

/**
 * `P053 (GGE97YK) / B039` — the truck on a dispatch, **cap number first**.
 *
 * `trip.truckReg` carries only `PLATE / TAILCODE`, and a dispatch whose tail
 * was never paired arrives as `KTU193XC / None`. The cap is resolved from the
 * roster pairing the rest of the app uses, so the Transport Manager reads the
 * same truck the gate and the workshop read; the empty slots are dropped so a
 * row reads `KTU193XC`, never `/ None`.
 */
function truckRegText(trip: Trip) {
  const head = displayCapPlateFromTrip(trip);
  const raw = String(trip.truckReg ?? "").trim();
  if (raw === "Unassigned") return "";
  const tail = raw
    .split("/")
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => part && !/^none$/i.test(part))
    .join(" / ");
  if (!head) return tail ? `Truck TBD / ${tail}` : "";
  return tail ? `${head} / ${tail}` : head;
}

/** `1 Head` / `2 Heads` — the design pluralises its group headers and footers. */
/**
 * "1 dispatch" / "9 dispatches". The default plural is a plain "s", which is
 * wrong for the one word this board counts most, so those get named explicitly.
 */
function countLabel(count: number, singular: string, plural?: string) {
  const word = plural ?? (singular === "dispatch" ? "dispatches" : `${singular}s`);
  return `${count} ${count === 1 ? singular : word}`;
}

/* ------------------------------------------------------------- presentation */

/** Figma section header: icon chip, title, uppercase subtitle, actions, hairline. */
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof ClipboardList;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#D7DBE1] pb-[3px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[#E4E6EA]">
            <Icon className="size-[18px] text-[#5C6470]" strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold leading-6 tracking-[0.2px] text-[#1B2432] md:text-[21px]">
              {title}
            </h2>
            <p className="mt-1 text-[10px] font-medium uppercase leading-4 tracking-[0.6px] text-[#8E95A1]">
              {subtitle}
            </p>
          </div>
        </div>
        {children ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

function AuditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[6px] border border-[#D3D7DE] bg-white px-3.5 py-2 text-[12px] font-medium leading-none text-[#1B2432] transition-colors hover:bg-[#F7F8FA]"
    >
      View Audit
    </button>
  );
}

/** The window a section's numbers belong to, stated on the section itself. */
function PeriodNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[6px] border border-[#D3D7DE] bg-white px-3 py-2 text-[11px] font-medium leading-none text-[#5C6470]">
      {children}
    </span>
  );
}

/**
 * One end of a custom window, on the navy band.
 *
 * `[color-scheme:dark]` is what keeps the native date picker's own icon legible
 * against the dark band — without it Chrome draws a black calendar glyph on
 * navy and the control reads as broken.
 */
function PeriodDateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-[6px] bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/80">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[4px] bg-white/10 px-1.5 py-1 text-[11px] font-semibold text-white [color-scheme:dark] focus:outline-none"
      />
    </label>
  );
}

/** A right-aligned footer note inside a tile (driver roster). */
function TileNote({ children, tone }: { children: React.ReactNode; tone: TileTone }) {
  return (
    <p
      className="text-right text-[10px] font-semibold uppercase leading-4 tracking-[0.4px]"
      style={{ color: TONE[tone].text }}
    >
      {children}
    </p>
  );
}

/** The audit card's grey fact grid (destination / cargo / dates). */
function AuditFactGrid({ facts }: { facts: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-1 rounded-[6px] bg-[#F1F2F4] px-3.5 py-3">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <p className="text-[9px] font-semibold uppercase leading-4 tracking-[0.5px] text-[#8E95A1]">
            {fact.label}
          </p>
          <p className="truncate text-[13px] font-medium leading-5 text-[#1B2432]">{fact.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the page */

export function CentralDashboard({ data }: { data: OverviewData }) {
  const [live, setLive] = useState<OverviewData>(data);
  /**
   * `null` means "we have never managed to read the tail roster". It is NOT the
   * same as an empty list: /tails is a separate request from the overview, and a
   * single dropped call used to render 0 tails — a false fleet count on a board
   * whose whole job is being trustworthy. Unknown is drawn as "—".
   */
  const [tails, setTails] = useState<TruckTail[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  /**
   * The store side of Engineering: what the workshop has asked for, what the
   * store holds, and the fuel records whose odometer readings are the only
   * mileage the platform captures.
   */
  const [partRequests, setPartRequests] = useState<InventoryRequisition[]>([]);
  const [storeItems, setStoreItems] = useState<InventoryItem[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRequisition[]>([]);
  /**
   * The store's movement ledger — purchases, issues, adjustments. The whole
   * Parts & Inventory view is a read of this book; until it lands the shelf's
   * numbers are stock-table only.
   */
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsRead, setMovementsRead] = useState(false);
  /**
   * The diesel side: the tank, its deliveries, what was pumped, and the
   * dispatches still waiting for the Transport Manager to release litres.
   */
  const [tanks, setTanks] = useState<LubricantStock[]>([]);
  const [restocks, setRestocks] = useState<LubricantRestock[]>([]);
  const [disbursals, setDisbursals] = useState<LubricantDisbursalRow[]>([]);
  const [fuelAsks, setFuelAsks] = useState<LubricantRequestRow[]>([]);
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({});
  /** The restock POs he has raised — the trigger, and what is still undelivered. */
  const [fuelOrders, setFuelOrders] = useState<ProcurementRequest[]>([]);
  /**
   * The Transport Manager's answer to a low tank: raise the buy himself.
   * Quantity, vendor and the agreed price, posted as a purchase order into the
   * store's procurement ledger — procurement owns the vendor record and the
   * receiving, and the tank is only written when the delivery lands.
   */
  const [restockForm, setRestockForm] = useState<{
    fuelType: "Diesel" | "Gas";
    quantity: string;
    vendor: string;
    unitPrice: string;
  } | null>(null);
  const [restockSaving, setRestockSaving] = useState(false);

  const submitRestockOrder = async () => {
    if (!restockForm) return;
    const quantity = Number(restockForm.quantity.replace(/[^0-9.]/g, ""));
    const unitPrice = Number(restockForm.unitPrice.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter the quantity to buy.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error("Enter the agreed price per unit.");
      return;
    }
    setRestockSaving(true);
    try {
      await procurementService.raiseFuelRestockOrder({
        fuelType: restockForm.fuelType,
        quantity,
        unitPrice,
        vendor: restockForm.vendor.trim() || undefined,
      });
      toast.success(
        `Restock order for ${formatQuantity(quantity)} ${restockForm.fuelType.toLowerCase()} posted to procurement.`,
      );
      setRestockForm(null);
      procurementService
        .fuelRestockOrders()
        .then((rows) => setFuelOrders(rows as unknown as ProcurementRequest[]))
        .catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The order was not saved.");
    } finally {
      setRestockSaving(false);
    }
  };
  /**
   * Whether each half of the department's ledger has actually been read.
   *
   * The pump and the request book load in parallel with everything else, and a
   * dropped read used to arrive here as an empty array — which the tiles then
   * reported as a confident all-clear ("No dispatch is waiting on you", "Every
   * litre was inside the release") against a book nobody had opened. A zero is
   * only a fact once the read has landed, so each half keeps its own flag and
   * every tile that would otherwise claim "nothing" waits for it.
   */
  const [asksRead, setAsksRead] = useState(false);
  const [pumpRead, setPumpRead] = useState(false);
  const [fuelRecordsRead, setFuelRecordsRead] = useState(false);
  void fuelRecordsRead;
  const [clock, setClock] = useState<Date | null>(null);
  /**
   * A handle on the board's own reload, so an approval made from a drill can
   * refresh the figures instead of leaving the TM looking at the row he just
   * decided until the 10-second poll catches up.
   */
  const refreshRef = useRef<() => void>(() => {});

  /**
   * The window this board reports on. It opens on TODAY — the daily capture is
   * what an operator reads first — and Month / Custom widen it when someone
   * needs a longer read. Every activity figure below belongs to this window.
   */
  const [periodKind, setPeriodKind] = useState<PeriodKind>("day");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [segment, setSegment] = useState<FleetSegment>("all");
  const [audit, setAudit] = useState<
    "requests" | "fleet" | "engineering" | "parts" | "security" | "fuel" | null
  >(null);
  const [fleetAuditTab, setFleetAuditTab] = useState<"head" | "tail">("head");
  /** Which ledger the gate audit opens on — the yard is the first question. */
  const [gateAuditTab, setGateAuditTab] = useState<"out" | "exit" | "tat">("out");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false);
  const drill = useDrill();

  // Client-only clock: a server timestamp mismatches the browser on hydration.
  useEffect(() => {
    const tick = () => setClock(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // GET /users is server-gated to Platform Admin + HR — other roles must not call it.
    const canListUsers = authService
      .getRoles()
      .some((r: string) => r === "Platform Admin" || r === "HR");

    let tailsRetry: number | undefined;
    /** A dropped /tails call is retried before we ever call the roster unknown. */
    const loadTails = (attempt = 0) => {
      void fleetService
        .listTails()
        .then((list) => {
          if (!cancelled) setTails(list);
        })
        .catch(() => {
          if (cancelled || attempt >= 3) return;
          tailsRetry = window.setTimeout(() => loadTails(attempt + 1), 1500);
        });
    };

    const refresh = () => {
      void dashboardService
        .getOverview()
        .then((o) => {
          if (cancelled) return;
          setLive((prev) => ({
            trips: o.trips ?? prev.trips,
            trucks: o.trucks ?? prev.trucks,
            drivers: o.drivers ?? prev.drivers,
            expenses: o.expenses ?? prev.expenses,
          }));
        })
        .catch(() => {});
      loadTails();
      // The "last check-up" on a fleet card comes from Engineering's own work
      // orders — a check-up is a job that was done, not a field on the truck.
      void engineeringService
        .listWorkOrders()
        .then((w) => {
          if (!cancelled) setWorkOrders(w);
        })
        .catch(() => {});
      // The approval desk reads the requests the workshop raised, the store they
      // are drawn from, and the odometer trail the cost per km is measured on.
      void inventoryService
        .requisitions()
        .then((r) => {
          if (!cancelled) setPartRequests(r);
        })
        .catch(() => {});
      void inventoryService
        .list()
        .then((i) => {
          if (!cancelled) setStoreItems(i);
        })
        .catch(() => {});
      void inventoryService
        .movements()
        .then((rows) => {
          if (cancelled) return;
          setMovements(rows ?? []);
          setMovementsRead(true);
        })
        .catch(() => {});
      void fuelService
        .list()
        .then((f) => {
          if (cancelled) return;
          setFuelRecords(f);
          setFuelRecordsRead(true);
        })
        .catch(() => {});
      // The tank, its deliveries and the pump are the department's records — the
      // TM audits them rather than keeping a second copy of the litres.
      void lubricantService
        .overview()
        .then((o) => {
          if (cancelled) return;
          setTanks(o.stocks ?? []);
          setFuelPrices(o.prices ?? {});
        })
        .catch(() => {});
      void lubricantService
        .restocks()
        .then((rows) => {
          if (!cancelled) setRestocks(rows ?? []);
        })
        .catch(() => {});
      void lubricantService
        .disbursals()
        .then((rows) => {
          if (cancelled) return;
          setDisbursals(rows ?? []);
          setPumpRead(true);
        })
        .catch(() => {});
      void lubricantService
        .requests()
        .then((rows) => {
          if (cancelled) return;
          setFuelAsks(rows ?? []);
          setAsksRead(true);
        })
        .catch(() => {});
      void procurementService
        .fuelRestockOrders()
        .then((rows) => {
          if (!cancelled) setFuelOrders(rows as unknown as ProcurementRequest[]);
        })
        .catch(() => {});
      if (canListUsers) {
        void adminService
          .users()
          .then((u) => {
            if (!cancelled) setUsers(u);
          })
          .catch(() => {});
      }
    };

    refreshRef.current = refresh;
    refresh();
    const id = window.setInterval(refresh, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (tailsRetry) window.clearTimeout(tailsRetry);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  /**
   * The window every activity number on this board belongs to.
   *
   * Keyed on the local DAY, not on the ticking clock: the clock fires every
   * second and would re-filter the whole trip list with it. `day` and `month`
   * therefore roll over by themselves at midnight, and a custom range is read
   * from local calendar dates rather than UTC, so no hour is lost at either end.
   */
  const dayKey = clock ? localDayKey(clock) : "";
  const range = useMemo(
    () => periodRange(periodKind, parseDateInput(dayKey) ?? new Date(), customFrom, customTo),
    [periodKind, dayKey, customFrom, customTo],
  );

  /** From/To are local date strings (YYYY-MM-DD) from the picker's inputs. */
  const selectPeriod = (next: PeriodKind) => {
    if (next === "custom") {
      const today = localDayKey(new Date());
      if (!customFrom) setCustomFrom(today);
      if (!customTo) setCustomTo(today);
    }
    setPeriodKind(next);
  };

  /** Latest work order per truck registration — the check-up date on a card. */
  const checkUpByReg = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    for (const wo of workOrders) {
      const key = String(wo.truckReg ?? "")
        .trim()
        .toLowerCase();
      if (!key) continue;
      const current = map.get(key);
      const at = new Date(wo.reportedAt || 0).getTime();
      if (!current || at > new Date(current.reportedAt || 0).getTime()) map.set(key, wo);
    }
    return map;
  }, [workOrders]);

  /**
   * `Passed engineering inspection • 2026-09-05` for a truck that came out of a
   * completed job; `Engineering Check-up • date` while one is still open; and an
   * honest "no check-up on record" when Engineering has never touched it.
   */
  const checkUpText = (registration: string, passedWord?: string) => {
    const wo = checkUpByReg.get(
      String(registration ?? "")
        .trim()
        .toLowerCase(),
    );
    if (!wo) return { text: "No check-up on record", passed: false };
    const passed = wo.status === "Completed";
    const date = formatDateLines(wo.reportedAt).date;
    return {
      text: passed && passedWord ? `${passedWord} • ${date}` : `Engineering Check-up • ${date}`,
      passed,
    };
  };

  const stats = useMemo(() => {
    const trips = live.trips ?? [];
    const heads = live.trucks ?? [];
    const drivers = live.drivers ?? [];

    // The request pool IS the window: a request belongs to the day it was raised,
    // so the four cards break that pool down and always sum back to the total.
    const requests = trips.filter(isCustomerRequest).filter((t) => inPeriod(t.createdAt, range));
    const counts = countBuckets(requests);

    /**
     * The trucks that are actually on the road right now — every request, every
     * day, not only the ones raised inside the window.
     *
     * A moving truck is a LIVE fact, not a period fact: the request may have been
     * raised three days ago and the truck is still out there today. Scoping it to
     * the window is what made the In Transit card read 1 while forty trucks were
     * on the road — so this card reports the fleet as it stands now, the same rule
     * the Fleet Registry and Driver Roster sections already follow.
     */
    const liveOnRoad = trips.filter((t) => tripBucket(t) === "inTransit");

    const pending = requests.filter((t) => tripBucket(t) === "pending");
    const declined = requests.filter((t) => tripBucket(t) === "declined");
    const completed = requests.filter((t) => tripBucket(t) === "completed");

    const active = trips.filter((t) => isInBucket(t, ACTIVE_DISPATCH_BUCKETS));

    // Money committed on the loads that are out right now. These are the direct
    // costs configured against each request — nothing here is invented.
    let cost = 0;
    let dieselLitres = 0;
    let dieselCost = 0;
    let gasKg = 0;
    let gasCost = 0;
    for (const trip of liveOnRoad) {
      cost += directCostOf(trip);
      const type = trip.directCosts?.lubricantType;
      const qty = Number(trip.directCosts?.lubricantQuantity ?? 0);
      const spend = Number(trip.directCosts?.lubricantCost ?? 0);
      if (type === "Diesel") {
        dieselLitres += qty;
        dieselCost += spend;
      } else if (type === "Gas") {
        gasKg += qty;
        gasCost += spend;
      }
    }

    const headStat = (status: string) => heads.filter((h) => h.status === status).length;
    const tailStat = (status: string) => (tails ?? []).filter((t) => t.status === status).length;

    const staff = users.filter(
      (u) =>
        u.status !== "Deleted" &&
        u.department !== "External Partner" &&
        !u.roles.includes("Customer Portals (External)") &&
        !u.partnerCompanyName,
    );

    return {
      requests: {
        total: requests.length,
        /**
         * The window's own breakdown, in the request queue's words — the Total
         * card must capture EVERYTHING it holds (pending, seen, approved, on the
         * road, completed, declined), so each state gets its own row and the rows
         * always add back up to the total.
         */
        pending: counts.pending,
        seen: counts.approved + counts.awaiting,
        onBoard: counts.scheduled,
        inTransit: counts.inTransit,
        completed: counts.completed,
        declined: counts.declined,
        /** Trucks on the road right now — live, all requests (the card). */
        dispatched: liveOnRoad.length,
        lists: { pending, declined, completed, all: requests, live: liveOnRoad },
      },
      spend: { cost, dieselLitres, dieselCost, gasKg, gasCost },
      dispatch: {
        total: active.length,
        onSchedule: active.filter((t) => getTrackingDelayStatus(t) === "On Schedule").length,
        slight: active.filter((t) => getTrackingDelayStatus(t) === "Slight delay").length,
        significant: active.filter((t) => getTrackingDelayStatus(t) === "Significant Delay").length,
      },
      active,
      fleet: {
        heads: {
          total: heads.length,
          available: headStat("Available"),
          checkUp: headStat("Check Up"),
          maintenance: headStat("Maintenance"),
          accident: headStat("Accident"),
        },
        tails: {
          total: (tails ?? []).length,
          available: tailStat("Available"),
          checkUp: tailStat("Check Up"),
          maintenance: tailStat("Maintenance"),
          accident: tailStat("Accident"),
        },
        allHeads: heads,
        allTails: tails ?? [],
      },
      drivers: {
        total: drivers.length,
        available: drivers.filter((d) => d.status === "Available").length,
        onTrip: drivers.filter((d) => d.status === "On Trip").length,
        offDuty: drivers.filter((d) => d.status === "Off Duty").length,
        /**
         * Licence state comes from the DATE on the record, never from a stored
         * flag. The live Driver row has no compliance column at all and
         * `mapDriver` defaults it to "Valid", so reading that field made this
         * tile claim "100% HR Verified" against a register where no driver
         * carries a licence date — a number nobody could act on. Same rule the
         * HR department's Licence & Compliance board uses.
         */
        verified: drivers.length
          ? Math.round(
              (drivers.filter((d) => licenseExpiry(d.licenseExpiry).tone === "valid").length /
                drivers.length) *
                100,
            )
          : 0,
        licenceMissing: drivers.filter((d) => licenseExpiry(d.licenseExpiry).tone === "missing")
          .length,
      },
      staff: {
        total: staff.length,
        active: staff.filter((u) => u.status === "Active" || u.status === "Invited").length,
        suspended: staff.filter((u) => u.status === "Suspended").length,
      },
    };
  }, [live.trips, live.trucks, live.drivers, tails, users, range]);

  /** The window's own activity — raised / approved / dispatched / declined. */
  const activity = useMemo(
    () => (clock ? periodActivity(live.trips ?? [], range) : null),
    [live.trips, clock, range],
  );

  /**
   * Engineering & Maintenance, as the Transport Manager audits it: the money
   * spent in the window, the parts queue, the trucks sitting in the shop and the
   * faults that keep coming back.
   *
   * Derived entirely from the work orders the workshop writes and the registry
   * rows Fleet Ops keeps — no second copy of the truth, so the TM's figure and
   * the workshop's own board can never disagree.
   */
  const eng = useMemo(
    () =>
      clock
        ? buildEngineeringOversight(workOrders, live.trucks ?? [], range, clock, {
            requisitions: partRequests,
            items: storeItems,
            fuel: fuelRecords,
          })
        : null,
    [workOrders, live.trucks, clock, range, partRequests, storeItems, fuelRecords],
  );

  /**
   * His restock POs, newest first, undelivered on top — the drill reads this so
   * the order he raised stays visible until the litres are in the tank.
   */
  const fuelOrdersView = useMemo(() => {
    const order = (a: ProcurementRequest, b: ProcurementRequest) =>
      (b.date || "").localeCompare(a.date || "");
    const pending = fuelOrders.filter((o) => o.status !== "Procured").sort(order);
    const received = fuelOrders.filter((o) => o.status === "Procured").sort(order);
    return { pending, received, all: [...pending, ...received] };
  }, [fuelOrders]);

  /**
   * Diesel and lubricant, as the Transport Manager reconciles them: what is
   * physically in the tank, what he has released that the yard has not pumped,
   * how much went out today, and where the pump disagreed with his authority.
   *
   * Reads the department's own records — the stock row, the deliveries, the
   * disbursals and the requests — so his figure and the tank gauge can never
   * tell two different stories.
   */
  const fuel = useMemo(
    () =>
      clock
        ? buildFuelOversight({
            trips: live.trips ?? [],
            stocks: tanks,
            restocks,
            disbursals,
            requests: fuelAsks,
            prices: fuelPrices,
            fuelRecords,
            range,
            now: clock,
          })
        : null,
    [live.trips, tanks, restocks, disbursals, fuelAsks, fuelPrices, fuelRecords, clock, range],
  );

  /**
   * Parts & Inventory, as the Transport Manager reconciles it: what the shelf is
   * worth and what that value rests on, what the workshop drew and for which
   * trucks, who the parts money is paid to, and what has to be bought before the
   * workshop stops.
   *
   * Built from the store's own ledger — the same book the purchase and issue
   * forms write — so his figures and the shelf can never tell two stories.
   */
  const parts = useMemo(
    () =>
      clock
        ? buildPartsOversight({
            items: storeItems,
            movements,
            openJobs: workOrders,
            range,
            now: clock,
          })
        : null,
    [storeItems, movements, workOrders, clock, range],
  );

  /**
   * The Gate House, as the Transport Manager audits it: what is physically in
   * the yard, what the gate was released but never logged out, which trucks are
   * past their expected return, and how long a trip really took gate to gate.
   */
  const sec = useMemo(
    () =>
      clock ? buildSecurityOversight(live.trips ?? [], live.trucks ?? [], range, clock) : null,
    [live.trips, live.trucks, clock, range],
  );

  /** The tail roster has been read at least once — otherwise its counts are unknown. */
  const tailsKnown = tails !== null;

  /** Every partner holding a request — the View Partner menu. */
  const partners = useMemo(() => {
    const names = new Set<string>();
    for (const trip of stats.requests.lists.all) {
      const name = partnerOf(trip).trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [stats.requests.lists.all]);

  const mapTrips = useMemo(
    () =>
      partnerFilter === "all"
        ? stats.active
        : stats.active.filter((t) => partnerOf(t).trim() === partnerFilter),
    [stats.active, partnerFilter],
  );

  // Counts carry a "—" while the tail roster has never been read, so no segment
  // can advertise a total it does not actually know.
  const tailCount: number | string = tailsKnown ? stats.fleet.tails.total : "—";
  const allCount: number | string = tailsKnown
    ? stats.fleet.heads.total + stats.fleet.tails.total
    : "—";
  const segmentCounts: Record<FleetSegment, number | string> = {
    all: allCount,
    head: stats.fleet.heads.total,
    tail: tailCount,
  };

  const fleetCards = [
    {
      id: "total",
      label: "Total Number",
      tone: "grey" as TileTone,
      icon: Navigation,
      hint: "Fleet Units",
      head: stats.fleet.heads.total,
      tail: stats.fleet.tails.total,
      title: "Total Fleet Registry Breakdown",
    },
    {
      id: "available",
      label: "Available",
      tone: "green" as TileTone,
      icon: CircleCheck,
      hint: "Ready/Passed Check-up",
      head: stats.fleet.heads.available,
      tail: stats.fleet.tails.available,
      title: "Fleet Available",
    },
    {
      id: "checkup",
      label: "Under Check-up",
      tone: "blue" as TileTone,
      icon: Wrench,
      hint: "In Engineering",
      head: stats.fleet.heads.checkUp,
      tail: stats.fleet.tails.checkUp,
      title: "Fleet Under Checkup",
    },
    {
      id: "maintenance",
      label: "Under Maintenance",
      tone: "amber" as TileTone,
      icon: Wrench,
      hint: "Under Repair",
      head: stats.fleet.heads.maintenance,
      tail: stats.fleet.tails.maintenance,
      title: "Fleet Under Maintenance",
    },
    {
      id: "accident",
      label: "Accident",
      tone: "red" as TileTone,
      icon: CircleAlert,
      hint: "Out of Order",
      head: stats.fleet.heads.accident,
      tail: stats.fleet.tails.accident,
      title: "Accident Fleet (Out-of-Order)",
    },
  ];

  /** The assets behind one fleet card, honouring the segment switch. */
  const fleetCardAssets = (cardId: string) => {
    const statusFor: Record<string, string[]> = {
      total: [],
      available: ["Available"],
      checkup: ["Check Up"],
      maintenance: ["Maintenance"],
      accident: ["Accident"],
    };
    const wanted = statusFor[cardId] ?? [];
    const heads =
      cardId === "total"
        ? stats.fleet.allHeads
        : stats.fleet.allHeads.filter((h) => wanted.includes(h.status));
    const tails =
      cardId === "total"
        ? stats.fleet.allTails
        : stats.fleet.allTails.filter((t) => wanted.includes(t.status));
    return {
      heads: segment === "tail" ? [] : heads,
      tails: segment === "head" ? [] : tails,
    };
  };

  /**
   * The request queue's own words and tones, so a popover row on the dashboard
   * reads exactly like the row in Partner Requests: Pending (amber), Seen (the
   * TM's first approval), Approved (on the dispatch board), In transit,
   * Completed and Declined.
   */
  const REQUEST_PILL_TONE: Record<PartnerUiStatus, TileTone> = {
    // A returned request shouts loudest on the TM's dashboard — someone is
    // blocked until it is corrected and resent.
    Returned: "red",
    Pending: "amber",
    Seen: "teal",
    Approved: "green",
    "In transit": "purple",
    Completed: "blue",
    Declined: "red",
  };

  const requestPill = (trip: Trip) => {
    const status = toPartnerUiStatus(trip);
    return <StatusPill label={status} tone={REQUEST_PILL_TONE[status]} />;
  };

  /** One request line inside a dark popover. */
  const requestRow = (trip: Trip, withPill: boolean) => (
    <DrillRow
      key={trip.id}
      title={`${displayRequestId(trip)} • ${partnerOf(trip) || "—"}`}
      meta={`${trip.dropoff || "—"} • ${formatDateLines(trip.createdAt).date}`}
      right={withPill ? requestPill(trip) : undefined}
    />
  );

  /** One dispatched line — the truck, the route, the money, the ETA. */
  const dispatchedRow = (trip: Trip) => (
    <div key={trip.id} className="rounded-[4px] border border-white/15 px-2.5 py-2">
      <p className="truncate text-[12px] font-semibold leading-5 text-white">
        {displayRequestId(trip)} • {partnerOf(trip) || "—"}
      </p>
      <p className="truncate text-[10px] font-normal leading-4 text-white/60">
        {[truckRegText(trip) || "Truck TBD", `→ ${trip.dropoff || "—"}`].join(" · ")}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-[10px] text-white/60">
          Direct Cost Est.{" "}
          <span className="font-semibold text-white">{formatMoney(directCostOf(trip))}</span>
        </span>
        <span className="text-[10px] text-white/60">
          Lubricant:{" "}
          <span className="font-semibold" style={{ color: TONE.amber.line }}>
            {trip.directCosts?.lubricantQuantity
              ? `${trip.directCosts.lubricantQuantity}${
                  trip.directCosts.lubricantType === "Gas" ? "KG" : "L"
                } (${formatMoney(trip.directCosts.lubricantCost)})`
              : "—"}
          </span>
        </span>
        <span className="col-span-2 text-[10px] text-white/60">
          ETA:{" "}
          <span className="font-semibold text-white">
            {trip.eta ? formatDateTimeStamp(trip.eta) : "—"}
          </span>
        </span>
      </div>
    </div>
  );

  /** One workshop job inside a dark popover — the truck, the fault, the money. */
  const engJobRow = (job: EngJob) => (
    <DrillRow
      key={job.id}
      title={`${job.truck} • ${job.status}`}
      meta={[
        job.defect,
        job.mechanic,
        job.days !== null
          ? job.status === "Completed"
            ? `Took ${formatDuration(job.days * 24)}`
            : `${formatDuration(job.days * 24)} in shop`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      right={
        <span className="shrink-0 text-[11px] font-semibold text-white">
          {formatMoney(job.cost)}
        </span>
      }
    />
  );

  /**
   * `2d 6h left` / `due today` / `late by 1d 4h` — a promise in plain words.
   *
   * Days carry fractions, so the hours are shown: "1.4 days late" reads as a
   * rounding artefact, "late by 1d 9h" reads as a truck that is somewhere it
   * should not be.
   */
  const promiseWord = (days: number | null) => {
    if (days === null) return "no date";
    if (days < 0) return `late by ${formatDuration(Math.abs(days) * 24)}`;
    if (days === 0) return "due today";
    return `${formatDuration(days * 24)} left`;
  };

  /**
   * The Transport Manager's decision on a part request.
   *
   * This is the one write his oversight board performs, because approving a
   * requisition IS the approval the spec describes — the workshop asks, he
   * decides. Approving a request that names a store item also releases the
   * stock (one server route touches both). A rejection has to carry a reason:
   * a queue that turns requests down silently leaves the workshop guessing why
   * a truck is still standing.
   */
  const decidePartRequest = async (request: EngPartRequest, approve: boolean) => {
    let note = "";
    if (!approve) {
      note = (
        window.prompt(
          `Why is "${request.part}" for ${request.truck} rejected? Attached to the record.`,
        ) ?? ""
      ).trim();
      if (!note) return;
    }
    try {
      if (approve) {
        await inventoryService.approveRequisition({
          id: request.id,
          itemId: request.itemId,
          quantity: request.quantity,
        });
      } else {
        await inventoryService.rejectRequisition(request.id, note);
      }
      toast.success(
        approve
          ? `${request.part} approved for ${request.truck} — handed to the store floor${request.short ? " (shelf short: procurement will be needed)" : ""}.`
          : `${request.part} rejected for ${request.truck}.`,
      );
      drill.close();
      refreshRef.current();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The decision was not saved.");
    }
  };

  /** One part the workshop has asked for, with the TM's two decisions on it. */
  const partRequestRow = (request: EngPartRequest) => (
    <div key={request.id} className="border-b border-white/10 last:border-b-0">
      <DrillRow
        title={`${request.truck} • ${request.part}`}
        meta={[
          `${request.quantity} × ${formatMoney(request.unitCost)}`,
          request.defect || null,
          request.mechanic,
          request.stock === null ? "not from the store" : `store ${request.stock}`,
          request.short ? "short — cannot be released" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        right={
          <span className="shrink-0 text-[11px] font-semibold text-white">
            {formatMoney(request.cost)}
          </span>
        }
      />
      <div className="flex items-center gap-2 pb-2">
        <button
          type="button"
          onClick={() => void decidePartRequest(request, true)}
          className="h-7 rounded bg-[#34C759] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2fae50]"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => void decidePartRequest(request, false)}
          className="h-7 rounded bg-[#ED351D] px-2.5 text-[11px] font-semibold text-white hover:bg-[#d62e19]"
        >
          Reject
        </button>
        {request.reason ? (
          <span className="truncate text-[10px] text-white/50">{request.reason}</span>
        ) : null}
      </div>
    </div>
  );

  /**
   * The Transport Manager releasing litres to a dispatch.
   *
   * Fleet Ops' figure is what the trip needs; this is what the yard may pump,
   * and the pump refuses to exceed it. He may release a different number — a
   * shortfall is a decision, and releasing it here is what makes the department
   * able to draw from a controlled tank at all.
   */
  const releaseFuel = async (ask: FuelAsk) => {
    const answer = window.prompt(
      `How many ${ask.unit.toLowerCase()} of ${ask.fuelType} for ${ask.truck} (${ask.reference})?\nFleet Ops asked for ${formatQuantity(ask.litres)}. The pump cannot exceed what you release.`,
      String(ask.litres),
    );
    if (answer === null) return;
    const litres = Number(answer.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(litres) || litres <= 0) {
      toast.error("Enter a positive number of litres.");
      return;
    }
    try {
      await lubricantService.authorize(
        ask.tripId,
        litres,
        authService.getCurrentUser()?.name || "Transport Manager",
      );
      toast.success(
        `${formatQuantity(litres)} ${ask.unit.toLowerCase()} released to ${ask.truck}.`,
      );
      refreshRef.current();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The release was not saved.");
    }
  };

  /** Withdraw a release the yard has not pumped yet. */
  const withdrawFuel = async (ask: FuelAsk) => {
    try {
      await lubricantService.revokeApproval(ask.tripId);
      toast.success(`Release withdrawn for ${ask.truck}.`);
      refreshRef.current();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The release was not withdrawn.");
    }
  };

  /** One dispatch waiting on diesel: what it asked for, and his release on it. */
  const fuelAskRow = (ask: FuelAsk, awaitingRelease: boolean) => (
    <div
      key={`${ask.tripId}-${awaitingRelease}`}
      className="border-b border-white/10 last:border-b-0"
    >
      <DrillRow
        title={`${ask.reference} • ${ask.truck}`}
        meta={[
          `${formatQuantity(ask.litres)} ${ask.unit.toLowerCase()} of ${ask.fuelType}`,
          formatMoney(ask.cost),
          ask.route,
          ask.driver,
          ask.waitingHours === null ? null : `${formatDuration(ask.waitingHours)} waiting`,
        ]
          .filter(Boolean)
          .join(" · ")}
        right={
          <StatusPill
            label={awaitingRelease ? "Awaiting you" : "Released"}
            tone={awaitingRelease ? "grey" : "amber"}
          />
        }
      />
      <div className="flex items-center gap-2 pb-2">
        {awaitingRelease ? (
          <button
            type="button"
            onClick={() => void releaseFuel(ask)}
            className="h-7 rounded bg-[#34C759] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2fae50]"
          >
            Release litres
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void withdrawFuel(ask)}
            className="h-7 rounded border border-white/30 px-2.5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
          >
            Withdraw
          </button>
        )}
        {!awaitingRelease && ask.authorizedBy ? (
          <span className="truncate text-[10px] text-white/50">released by {ask.authorizedBy}</span>
        ) : null}
      </div>
    </div>
  );

  /** One pumped handover, as the dispensing ledger reads it. */
  const fuelLedgerRow = (row: FuelLedgerRow) => (
    <DrillRow
      key={`${row.tripId}-${row.at}`}
      title={`${row.reference} • ${row.truck}`}
      meta={[
        `${formatQuantity(row.litres)} ${row.unit.toLowerCase()} of ${row.fuelType}`,
        formatMoney(row.value),
        `pumped by ${row.attendant}`,
        row.authorizedLitres !== null
          ? `released ${formatQuantity(row.authorizedLitres)}`
          : row.requestedLitres !== null
            ? `asked ${formatQuantity(row.requestedLitres)}`
            : "no request on the dispatch",
        row.overLitres > 0 ? `${formatQuantity(row.overLitres)} over` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      right={
        <StatusPill
          label={row.overLitres > 0 ? "Over" : row.unauthorized ? "Unauthorized" : "Matched"}
          tone={row.tone}
        />
      }
    />
  );

  /** One truck the workshop is holding, as the TM reads it. */
  const shopTruckRow = (head: TruckHead) => {
    const status = fleetStatusWord(head.status);
    return (
      <DrillRow
        key={head.id}
        title={headLabel(head)}
        meta={checkUpText(head.registration).text}
        right={<StatusPill label={status.word} tone={status.tone} />}
      />
    );
  };

  /** One gate movement inside a dark popover — the truck, the route, the verb. */
  const gateTripRow = (t: SecTrip, word: string) => (
    <DrillRow
      key={`${word}-${t.id}-${t.tone}`}
      title={`${t.label} • ${t.truck}`}
      meta={[t.driver, t.partner, t.route].filter(Boolean).join(" · ")}
      right={<StatusPill label={word} tone={t.tone} />}
    />
  );

  /* --------------------------------------------------------------- printing */

  const printRequestsAudit = () => {
    const rows = stats.requests.lists.all
      .map((trip) => {
        // The audit sheet and the screen must use one vocabulary.
        const status = toPartnerUiStatus(trip);
        return `<tr>
          <td>${displayRequestId(trip)}</td>
          <td>${partnerOf(trip) || "—"}</td>
          <td>${trip.dropoff || "—"}</td>
          <td>${trip.cargo || "—"}</td>
          <td>${formatTableDate(trip.createdAt)}</td>
          <td>${status}</td>
          <td>${formatMoney(directCostOf(trip))}</td>
        </tr>`;
      })
      .join("");
    printSheet(
      "Total Partner Requests Breakdown",
      `Requests raised in the selected window · ${range.label}`,
      `<table><thead><tr><th>Request ID</th><th>Partner</th><th>Destination</th><th>Cargo</th><th>Request Date</th><th>Status</th><th>Direct Cost</th></tr></thead><tbody>${
        rows || `<tr><td colspan="7">No requests yet.</td></tr>`
      }</tbody></table>`,
    );
  };

  const printFleetAudit = () => {
    const headRows = stats.fleet.allHeads
      .map(
        (h) =>
          `<tr><td>${headLabel(h)}</td><td>${fleetStatusWord(h.status).word}</td><td>${checkUpText(h.registration).text}</td></tr>`,
      )
      .join("");
    const tailRows = stats.fleet.allTails
      .map(
        (t) =>
          `<tr><td>${tailLabel(t)}</td><td>${String(t.type ?? "")}</td><td>${fleetStatusWord(t.status).word}</td><td>${checkUpText(t.registration).text}</td></tr>`,
      )
      .join("");
    printSheet(
      "Fleet Registry: Total Fleet Assets",
      "All fleet registry",
      `<h2>Truck Heads (${stats.fleet.allHeads.length})</h2>
       <table><thead><tr><th>Truck Head</th><th>Status</th><th>Last Check-up</th></tr></thead><tbody>${
         headRows || `<tr><td colspan="3">None.</td></tr>`
       }</tbody></table>
       <h2>Truck Tails (${stats.fleet.allTails.length})</h2>
       <table><thead><tr><th>Truck Tail</th><th>Tail Type</th><th>Status</th><th>Last Check-up</th></tr></thead><tbody>${
         tailRows || `<tr><td colspan="4">None.</td></tr>`
       }</tbody></table>`,
    );
  };

  const printEngineeringAudit = () => {
    if (!eng) return;
    const rows = eng.open.list
      .map(
        (job) =>
          `<tr><td>${job.truck}</td><td>${job.defect}</td><td>${job.category}</td><td>${
            job.status
          }</td><td>${job.mechanic}</td><td>${
            job.days === null ? "—" : formatDuration(job.days * 24)
          }</td><td>${formatMoney(job.cost)}</td></tr>`,
      )
      .join("");
    const assetRows = eng.costPerAsset
      .map((a) => `<tr><td>${a.label}</td><td>${a.jobs}</td><td>${formatMoney(a.spend)}</td></tr>`)
      .join("");
    const requestRows = eng.requisitions.pending.list
      .map(
        (r) =>
          `<tr><td>${r.truck}</td><td>${r.defect || "—"}</td><td>${r.part}</td><td>${
            r.quantity
          }</td><td>${formatMoney(r.unitCost)}</td><td>${formatMoney(r.cost)}</td><td>${
            r.stock === null ? "not from the store" : `store ${r.stock}${r.short ? " (short)" : ""}`
          }</td><td>${r.mechanic}</td></tr>`,
      )
      .join("");
    const rtsRows = eng.rts.list
      .map(
        (job) =>
          `<tr><td>${job.truck}</td><td>${job.defect}</td><td>${job.status}</td><td>${job.mechanic}</td><td>${
            job.estimatedReadyAt || "—"
          }</td><td>${
            job.rtsDays === null
              ? "—"
              : job.rtsDays < 0
                ? `late by ${Math.abs(job.rtsDays)}d`
                : `${job.rtsDays}d left`
          }</td></tr>`,
      )
      .join("");
    const stockRows = eng.inventory.list
      .map(
        (a) =>
          `<tr><td>${a.name}</td><td>${a.sku}</td><td>${a.stock}</td><td>${a.reorderLevel}</td><td>${
            a.waiting
          }</td><td>${a.status}</td></tr>`,
      )
      .join("");
    const cpkRows = eng.cpk.list
      .map(
        (row) =>
          `<tr><td>${row.label}</td><td>${row.km.toLocaleString()} km</td><td>${formatMoney(
            row.spend,
          )}</td><td>${row.cpk === null ? "—" : `${formatMoney(row.cpk)}/km`}</td></tr>`,
      )
      .join("");
    printSheet(
      "Engineering & Maintenance: Workshop Oversight",
      `Maintenance spend in the selected window · ${range.label}`,
      `<p><strong>Maintenance spend:</strong> ${formatMoney(eng.spend.total)} across ${
        eng.spend.jobs
      } job(s)</p>
       <p><strong>Parts value in queue:</strong> ${formatMoney(eng.partsQueue.value)} across ${
         eng.partsQueue.count
       } job(s)</p>
       <p><strong>Under maintenance:</strong> ${eng.shop.maintenance} · Under check-up: ${
         eng.shop.checkUp
       } · Accident: ${eng.shop.accident}</p>
       <p><strong>Longest downtime:</strong> ${formatDuration(
         eng.downtime.longestDays * 24,
       )} (${eng.downtime.flagged} past ${DOWNTIME_FLAG_DAYS} days)</p>
       <p><strong>Awaiting your approval:</strong> ${
         eng.requisitions.pending.count
       } request(s) worth ${formatMoney(eng.requisitions.pending.value)} (${
         eng.requisitions.pending.blocked
       } blocked by stock) · ${eng.requisitions.decided} decided in this ${range.label.toLowerCase()}</p>
       <p><strong>Return to service:</strong> ${eng.rts.promised} promised · ${
         eng.rts.overdue.count
       } past its own date · ${eng.rts.missing} open with no date</p>
       <p><strong>Cost per km:</strong> ${
         eng.cpk.value === null ? "not measurable" : `${formatMoney(eng.cpk.value)}/km`
       } over ${eng.cpk.km.toLocaleString()} km measured (${
         eng.cpk.unmeasuredSpend > 0
           ? `${formatMoney(eng.cpk.unmeasuredSpend)} of spend unmeasured`
           : "all spend measured"
       })</p>
       <p><strong>Store:</strong> ${eng.inventory.items} line(s) worth ${formatMoney(
         eng.inventory.value,
       )} · ${eng.inventory.outOfStock} out of stock · ${eng.inventory.low} low</p>
       <h2>Parts awaiting your approval (${eng.requisitions.pending.count})</h2>
       <table><thead><tr><th>Truck</th><th>Defect</th><th>Part</th><th>Qty</th><th>Unit</th><th>Value</th><th>Store</th><th>Mechanic</th></tr></thead><tbody>${
         requestRows || `<tr><td colspan="8">Nothing awaiting a decision.</td></tr>`
       }</tbody></table>
       <h2>Return to service (${eng.rts.promised})</h2>
       <table><thead><tr><th>Truck</th><th>Defect</th><th>Status</th><th>Mechanic</th><th>Promised</th><th>Remaining</th></tr></thead><tbody>${
         rtsRows || `<tr><td colspan="6">No open job carries a date.</td></tr>`
       }</tbody></table>
       <h2>Inventory alerts (${eng.inventory.list.length})</h2>
       <table><thead><tr><th>Part</th><th>SKU</th><th>Stock</th><th>Reorder at</th><th>Requested</th><th>Status</th></tr></thead><tbody>${
         stockRows || `<tr><td colspan="6">No line is at or below its reorder level.</td></tr>`
       }</tbody></table>
       <h2>Cost per kilometre</h2>
       <table><thead><tr><th>Truck</th><th>Distance</th><th>Spend</th><th>Per km</th></tr></thead><tbody>${
         cpkRows || `<tr><td colspan="4">No odometer reading on file.</td></tr>`
       }</tbody></table>
       <h2>Open work orders (${eng.open.count})</h2>
       <table><thead><tr><th>Truck</th><th>Defect</th><th>Category</th><th>Status</th><th>Mechanic</th><th>In shop</th><th>Cost</th></tr></thead><tbody>${
         rows || `<tr><td colspan="7">No open work order.</td></tr>`
       }</tbody></table>
       <h2>Repair spend per asset</h2>
       <table><thead><tr><th>Truck</th><th>Jobs</th><th>Spend</th></tr></thead><tbody>${
         assetRows || `<tr><td colspan="3">No job on record.</td></tr>`
       }</tbody></table>`,
    );
  };

  /**
   * The diesel sheet: the tank, his releases, and every litre that left the pump
   * with the attendant's own name against it.
   */
  const printFuelAudit = () => {
    if (!fuel) return;
    const ledgerRows = fuel.ledger.list
      .map(
        (row) =>
          `<tr><td>${row.reference}</td><td>${row.truck}</td><td>${row.driver}</td><td>${
            row.route
          }</td><td>${formatQuantity(row.litres)} ${row.unit.toLowerCase()}</td><td>${formatMoney(
            row.value,
          )}</td><td>${
            row.authorizedLitres !== null ? formatQuantity(row.authorizedLitres) : "not released"
          }</td><td>${
            row.overLitres > 0
              ? `${formatQuantity(row.overLitres)} over`
              : row.unauthorized
                ? "unauthorized"
                : "within release"
          }</td><td>${row.attendant}</td><td>${formatDateTimeStamp(row.at)}</td></tr>`,
      )
      .join("");
    const askRows = fuel.approvals.list
      .map(
        (ask) =>
          `<tr><td>${ask.reference}</td><td>${ask.truck}</td><td>${ask.driver}</td><td>${
            ask.route
          }</td><td>${formatQuantity(ask.litres)} ${ask.unit.toLowerCase()} of ${
            ask.fuelType
          }</td><td>${formatMoney(ask.cost)}</td><td>${ask.status}</td><td>${
            ask.waitingHours === null ? "—" : formatDuration(ask.waitingHours)
          }</td></tr>`,
      )
      .join("");
    const routeRows = fuel.routes.list
      .map(
        (row) =>
          `<tr><td>${row.route}</td><td>${row.trips}</td><td>${formatQuantity(
            row.avgAsked,
          )} L</td><td>${formatQuantity(row.maxAsked)} L</td><td>${
            row.avgPumped === null ? "—" : `${formatQuantity(row.avgPumped)} L`
          }</td></tr>`,
      )
      .join("");
    printSheet(
      "Diesel & Lubricant: Fuel Oversight",
      `The tank, the releases and every litre pumped · ${range.label}`,
      `<p><strong>Tank balance:</strong> Diesel ${
        dieselTank ? `${formatQuantity(dieselTank.quantity)} ${unitWord(dieselTank.unit)}` : "—"
      } · Gas ${gasTank ? `${formatQuantity(gasTank.quantity)} ${unitWord(gasTank.unit)}` : "—"} ·
        worth ${formatMoney(fuel.tanks.value)}${tankBasisWord ? ` at ${tankBasisWord}` : ""}</p>
       <p><strong>Below safety level:</strong> ${fuel.tanks.low} tank(s)</p>
       <p><strong>Awaiting your release:</strong> ${fuel.approvals.count} dispatch(es) · ${formatQuantity(
         fuel.approvals.litres,
       )} L · ${formatMoney(fuel.approvals.value)}</p>
       <p><strong>Released, not yet pumped:</strong> ${fuel.pickups.count} · ${formatQuantity(
         fuel.pickups.litres,
       )} L</p>
       <p><strong>Pumped today:</strong> ${formatQuantity(fuel.spend.todayLitres)} L worth ${formatMoney(
         fuel.spend.todayValue,
       )} across ${fuel.spend.todayTrucks} truck(s)</p>
       <p><strong>Over-pump flags:</strong> ${fuel.variance.count} · ${formatQuantity(
         fuel.variance.overLitres,
       )} L over · ${formatMoney(fuel.variance.overValue)} · ${
         fuel.variance.unauthorized
       } pumped with no release</p>
       <p><strong>Fuel efficiency:</strong> ${
         worstEfficiency
           ? `worst ${worstEfficiency.kmPerLitre} km/L (${worstEfficiency.truck})`
           : "not measurable — no odometer reading on any fuel record"
       }</p>
       <h2>Dispensing ledger (${fuel.ledger.count})</h2>
       <table><thead><tr><th>Dispatch</th><th>Truck</th><th>Driver</th><th>Route</th><th>Litres</th><th>Value</th><th>Released</th><th>Variance</th><th>Attendant</th><th>Pumped</th></tr></thead><tbody>${
         ledgerRows || `<tr><td colspan="10">Nothing has been pumped from the tank.</td></tr>`
       }</tbody></table>
       <h2>Awaiting your release (${fuel.approvals.count})</h2>
       <table><thead><tr><th>Dispatch</th><th>Truck</th><th>Driver</th><th>Route</th><th>Requested</th><th>Value</th><th>Status</th><th>Waiting</th></tr></thead><tbody>${
         askRows || `<tr><td colspan="8">Nothing is waiting on your decision.</td></tr>`
       }</tbody></table>
       <h2>Diesel per destination</h2>
       <table><thead><tr><th>Destination</th><th>Dispatches</th><th>Average asked</th><th>Largest ask</th><th>Average pumped</th></tr></thead><tbody>${
         routeRows || `<tr><td colspan="5">No dispatch has requested diesel.</td></tr>`
       }</tbody></table>`,
    );
  };

  const printPartsAudit = () => {
    if (!parts) return;
    const ledgerRows = [...parts.purchases.list, ...parts.consumption.list]
      .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1))
      .map(
        (m: MovementRow) =>
          `<tr><td>${formatTableDate(m.actedAt)}</td><td>${m.kind}</td><td>${m.item}</td><td>${
            m.sku
          }</td><td>${m.quantity}</td><td>${
            m.unitCost === null ? "—" : formatMoney(m.unitCost)
          }</td><td>${m.value === null ? "—" : formatMoney(m.value)}</td><td>${
            m.truckReg || m.vendor || "—"
          }</td><td>${m.actedBy || "—"}</td></tr>`,
      )
      .join("");
    const reorderRows = parts.reorder.list
      .map(
        (row) =>
          `<tr><td>${row.item}</td><td>${row.sku}</td><td>${row.stock}</td><td>${
            row.reorderLevel
          }</td><td>${row.toBuy}</td><td>${formatMoney(row.estimatedCost)}</td><td>${
            row.supplier || "no supplier on file"
          }</td></tr>`,
      )
      .join("");
    const unpricedRows = parts.valuation.unpricedLines
      .map(
        (line) =>
          `<tr><td>${line.name}</td><td>${line.sku}</td><td>${line.stock}</td><td>${formatMoney(
            line.unitCost,
          )}</td><td>${formatMoney(line.value)}</td></tr>`,
      )
      .join("");
    const vendorRows = parts.purchases.byVendor
      .map(
        (row) =>
          `<tr><td>${row.vendor}</td><td>${row.units}</td><td>${row.lines}</td><td>${formatMoney(
            row.value,
          )}</td></tr>`,
      )
      .join("");
    const truckRows = parts.consumption.byTruck
      .map(
        (row) =>
          `<tr><td>${row.truck}</td><td>${row.units}</td><td>${formatMoney(row.value)}</td></tr>`,
      )
      .join("");
    printSheet(
      "Parts & Inventory: Store Oversight",
      `Store activity in the selected window · ${range.label}`,
      `<p><strong>Store valuation:</strong> ${formatMoney(parts.valuation.total)} across ${
        parts.valuation.lines
      } line(s) · ${formatMoney(parts.valuation.priced)} of it priced from actual purchases</p>
       <p><strong>Idle capital:</strong> ${formatMoney(parts.idle.value)} across ${
         parts.idle.lines
       } line(s) that issued nothing in this window</p>
       <p><strong>Consumption:</strong> ${parts.consumption.units} unit(s) issued across ${
         parts.consumption.events
       } issue(s), worth ${formatMoney(parts.consumption.value)}</p>
       <p><strong>Purchases:</strong> ${parts.purchases.units} unit(s) bought across ${
         parts.purchases.events
       } purchase(s), worth ${formatMoney(parts.purchases.value)}</p>
       <p><strong>Stock health:</strong> ${parts.health.ok} healthy · ${parts.health.low} low · ${
         parts.health.out
       } out of stock</p>
       <p><strong>Reorder:</strong> ${parts.reorder.count} line(s) to buy, ≈ ${formatMoney(
         parts.reorder.estimatedCost,
       )} · ${parts.reorder.addressed} addressed to a supplier</p>
       <h2>Reorder list (${parts.reorder.count})</h2>
       <table><thead><tr><th>Part</th><th>SKU</th><th>Held</th><th>Reorder at</th><th>To buy</th><th>Est. cost</th><th>Supplier</th></tr></thead><tbody>${
         reorderRows || `<tr><td colspan="7">Every line is above its reorder level.</td></tr>`
       }</tbody></table>
       <h2>Vendor spend (${parts.purchases.byVendor.length})</h2>
       <table><thead><tr><th>Vendor</th><th>Units</th><th>Lines</th><th>Spend</th></tr></thead><tbody>${
         vendorRows || `<tr><td colspan="4">No vendor was paid in this window.</td></tr>`
       }</tbody></table>
       <h2>Consumption by truck (${parts.consumption.byTruck.length})</h2>
       <table><thead><tr><th>Truck</th><th>Units</th><th>Value</th></tr></thead><tbody>${
         truckRows || `<tr><td colspan="3">No part was issued in this window.</td></tr>`
       }</tbody></table>
       <h2>Movement ledger (${[...parts.purchases.list, ...parts.consumption.list].length})</h2>
       <table><thead><tr><th>When</th><th>Kind</th><th>Part</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Value</th><th>Truck / Vendor</th><th>Recorded by</th></tr></thead><tbody>${
         ledgerRows || `<tr><td colspan="9">No movement was recorded in this window.</td></tr>`
       }</tbody></table>
       <h2>Value on typed-in prices (${parts.valuation.unpricedLines.length})</h2>
       <table><thead><tr><th>Part</th><th>SKU</th><th>Stock</th><th>Unit price</th><th>Line value</th></tr></thead><tbody>${
         unpricedRows ||
         `<tr><td colspan="5">Every valued line rests on a recorded purchase.</td></tr>`
       }</tbody></table>`,
    );
  };

  const printSecurityAudit = () => {
    if (!sec) return;
    const outRows = sec.yard.list
      .map(
        (t) =>
          `<tr><td>${t.label}</td><td>${t.truck}</td><td>${t.driver}</td><td>${t.partner}</td><td>${
            t.route
          }</td><td>${gateStamp(t.departedAt, "Not Departed")}</td><td>${
            t.hoursOut === null ? "—" : formatDuration(t.hoursOut)
          }</td><td>${
            t.overdueHours !== null ? `Overdue ${formatDuration(t.overdueHours)}` : "On time"
          }</td></tr>`,
      )
      .join("");
    const exitRows = sec.pendingExits.list
      .map(
        (t) =>
          `<tr><td>${t.label}</td><td>${t.truck}</td><td>${t.partner}</td><td>${
            t.route
          }</td><td>${t.driver}</td><td>${
            t.waitHours === null ? "—" : formatDuration(t.waitHours)
          }</td></tr>`,
      )
      .join("");
    const tatRows = sec.tat.list
      .map(
        (t) =>
          `<tr><td>${t.label}</td><td>${t.truck}</td><td>${t.partner}</td><td>${gateStamp(
            t.departedAt,
            "—",
          )}</td><td>${gateStamp(t.returnedAt, "—")}</td><td>${
            t.hoursOut === null ? "—" : formatDuration(t.hoursOut)
          }</td></tr>`,
      )
      .join("");
    printSheet(
      "Gate Security: Yard & Movement Oversight",
      `Movements logged in the selected window · ${range.label}`,
      `<p><strong>Trucks in the yard:</strong> ${sec.yard.inYard} of ${
        sec.yard.totalHeads
      } heads · out: ${sec.yard.out}</p>
       <p><strong>Released, not yet logged out:</strong> ${sec.pendingExits.count}</p>
       <p><strong>Awaiting return:</strong> ${sec.awaitingReturn.count} (${
         sec.awaitingReturn.expectedKnown
       } with an expected return) · overdue: ${sec.overdue.count}</p>
       <p><strong>Average gate turnaround:</strong> ${formatDuration(
         sec.tat.avgHours,
       )} across ${sec.tat.measured} measured trip(s)</p>
       <h2>Out of the yard now (${sec.yard.out})</h2>
       <table><thead><tr><th>Dispatch</th><th>Truck</th><th>Driver</th><th>Partner</th><th>Route</th><th>Departed</th><th>Out</th><th>Delay</th></tr></thead><tbody>${
         outRows || `<tr><td colspan="8">No truck is out of the yard.</td></tr>`
       }</tbody></table>
       <h2>Released, not yet logged out (${sec.pendingExits.count})</h2>
       <table><thead><tr><th>Dispatch</th><th>Truck</th><th>Partner</th><th>Route</th><th>Driver</th><th>Waiting</th></tr></thead><tbody>${
         exitRows || `<tr><td colspan="6">The gate has nothing waiting.</td></tr>`
       }</tbody></table>
       <h2>Gate-to-gate turnaround (${sec.tat.measured})</h2>
       <table><thead><tr><th>Dispatch</th><th>Truck</th><th>Partner</th><th>Out</th><th>Back</th><th>Duration</th></tr></thead><tbody>${
         tatRows || `<tr><td colspan="6">No completed gate-to-gate trip in this window.</td></tr>`
       }</tbody></table>`,
    );
  };

  /* ------------------------------------------- department oversight (TM view) */

  /** A money value the board may not know yet is drawn as "—", never as ₦0. */
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : formatMoney(value);

  /** A gate stamp reads as a stamp, never as the ISO string the API stores. */
  const gateStamp = (value: string | null | undefined, fallback: string) => {
    const text = formatDateTimeStamp(value);
    return text === "—" ? fallback : text;
  };

  /**
   * A tank's unit as the yard says it — litres for diesel, kilograms for gas.
   * Two tanks of different commodities must never be summed into one figure.
   */
  const unitWord = (unit: string | null | undefined) => {
    const text = String(unit ?? "").toUpperCase();
    if (text.startsWith("L")) return "L";
    if (text.startsWith("K")) return "kg";
    return text ? text.toLowerCase() : "units";
  };

  const dieselTank = fuel?.tanks.lines.find((line) => line.fuelType === "Diesel");
  const gasTank = fuel?.tanks.lines.find((line) => line.fuelType === "Gas");
  /**
   * What the tank's money is measured from — named on the board, because
   * "what we paid" and "what we charge" are different numbers and the difference
   * is the whole reason a supervisor looks.
   */
  const tankBasisWord =
    fuel?.tanks.basis === "inbound"
      ? "last inbound purchase price"
      : fuel?.tanks.basis === "price"
        ? "the TM's price per litre"
        : null;
  const worstEfficiency = fuel?.efficiency.worst ?? null;
  const busiestRoute = fuel?.routes.list[0] ?? null;

  const downtimeTone: TileTone = (eng?.downtime.flagged ?? 0) > 0 ? "red" : "green";
  const topAsset = eng?.costPerAsset[0];
  const topDefect = eng?.defects[0];
  const topMechanic = eng?.turnaround.byMechanic[0];
  const longestTrip = sec?.tat.list[0];
  const exitTone: TileTone = (sec?.pendingExits.count ?? 0) > 0 ? "amber" : "green";

  /* ----------------------------------------------------------------- render */

  return (
    <div className="flex w-full flex-col gap-14 bg-[#F1F2F4] p-4 pb-28 md:p-[30px] md:pb-[30px]">
      {/*
        Live Operations band — the day this board reports on and the clock it
        moved at. Measured off the design rather than eyeballed: 68px tall, 12px
        side padding, 19px title, 13px chips, chips in plain white with no pill
        chrome of their own.
      */}
      <section className="rounded-[6px] bg-[#1B2432] px-3 py-[11px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold leading-[22px] text-white">
              Live Operations Dashboard
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium leading-[18px] text-white">
                <Clock className="size-[15px] text-white" strokeWidth={1.9} />
                {clock ? formatClockTime(clock) : "--:--"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium leading-[18px] text-white">
                <CalendarDays className="size-[15px] text-white" strokeWidth={1.9} />
                {clock ? formatDayLabel(clock) : "—"}
              </span>
              {activity ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium leading-[18px] text-white">
                  <ClipboardList className="size-[15px] text-white" strokeWidth={1.9} />
                  {range.prefix}: {activity.requests} raised · {activity.dispatched} dispatched ·{" "}
                  {activity.declined} declined
                </span>
              ) : null}
            </div>
          </div>

          {/*
            The window picker. Every activity figure on this board belongs to the
            window named here — Day opens on today, Month and Custom widen it.
          */}
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <ToneTabs
              tabs={PERIOD_TABS}
              active={periodKind}
              onChange={(kind) => selectPeriod(kind)}
              variant="pill"
            />
            {periodKind === "custom" ? (
              <div className="flex flex-wrap items-center gap-2">
                <PeriodDateInput
                  label="From"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={setCustomFrom}
                />
                <PeriodDateInput
                  label="To"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={setCustomTo}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Partner Requests */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={ClipboardList}
          title="Partner Requests"
          subtitle="Dispatch demand pipeline, pending cost & lubricant commitments, dispatch and decline audit"
        >
          <PeriodNote>{range.note}</PeriodNote>
          <AuditButton onClick={() => setAudit("requests")} />
        </SectionHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <LiveMetricTile
              label="Total Requests"
              value={stats.requests.total}
              hint={range.hint}
              tone="grey"
              icon={ClipboardList}
              hasDrill
              onClick={() => drill.toggle("req-total")}
              detail={
                /*
                 * EVERY state the window holds, always drawn — zeros included —
                 * so the six rows visibly add back up to the Total above them and
                 * nothing (Seen, Approved, Completed) can go missing from a number
                 * that is supposed to capture all of it.
                 */
                <TileDetailRows
                  rows={[
                    { label: "Pending:", value: stats.requests.pending, tone: "amber" },
                    { label: "Seen:", value: stats.requests.seen, tone: "teal" },
                    { label: "Approved:", value: stats.requests.onBoard, tone: "green" },
                    { label: "In transit:", value: stats.requests.inTransit, tone: "purple" },
                    { label: "Completed:", value: stats.requests.completed, tone: "blue" },
                    { label: "Declined:", value: stats.requests.declined, tone: "red" },
                  ]}
                />
              }
            />
            <DrillPopover
              open={drill.isOpen("req-total")}
              onClose={drill.close}
              title={`Total Requests (${stats.requests.total})`}
              footer={
                <span>
                  {stats.requests.pending} Pending • {stats.requests.seen} Seen •{" "}
                  {stats.requests.onBoard} Approved • {stats.requests.inTransit} In transit •{" "}
                  {stats.requests.completed} Completed • {stats.requests.declined} Declined
                </span>
              }
              width={340}
            >
              {stats.requests.lists.all.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No partner request yet.</p>
              ) : (
                stats.requests.lists.all.map((trip) => requestRow(trip, true))
              )}
            </DrillPopover>
          </div>

          <div className="relative">
            <LiveMetricTile
              label="Pending"
              value={stats.requests.pending}
              hint="Requests not Approved"
              tone="amber"
              icon={History}
              hasDrill
              onClick={() => drill.toggle("req-pending")}
            />
            <DrillPopover
              open={drill.isOpen("req-pending")}
              onClose={drill.close}
              title={`Pending Requests Breakdown (${stats.requests.pending})`}
              width={340}
            >
              {stats.requests.lists.pending.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  Nothing is waiting on the Transport Manager.
                </p>
              ) : (
                stats.requests.lists.pending.map((trip) => requestRow(trip, false))
              )}
            </DrillPopover>
          </div>

          <div className="relative">
            <LiveMetricTile
              label="In Transit"
              value={stats.requests.dispatched}
              hint="On the road now"
              tone="purple"
              icon={Navigation}
              hasDrill
              onClick={() => drill.toggle("req-dispatched")}
              detail={
                <TileCostColumns
                  /* Committed on the loads that are on the road right now. */
                  columns={[
                    {
                      label: "Direct Cost:",
                      value: formatMoney(stats.spend.cost),
                      tone: "purple",
                    },
                    {
                      label: "Diesel:",
                      value: `${stats.spend.dieselLitres}L`,
                      sub: `(${formatMoney(stats.spend.dieselCost)})`,
                      tone: "amber",
                    },
                    {
                      label: "Gas:",
                      value: `${stats.spend.gasKg}KG`,
                      sub: `(${formatMoney(stats.spend.gasCost)})`,
                      tone: "amber",
                    },
                  ]}
                />
              }
            />
            <DrillPopover
              open={drill.isOpen("req-dispatched")}
              onClose={drill.close}
              title={`In Transit — trucks on the road (${stats.requests.dispatched})`}
              width={390}
              footer={
                <div className="w-full">
                  <div className="flex items-center justify-between py-0.5 text-white/70">
                    <span>On the road now</span>
                    <span className="font-semibold text-white">
                      {stats.requests.dispatched} dispatches
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span>Committed Direct Cost</span>
                    <span className="font-semibold text-white">
                      {formatMoney(stats.spend.cost)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span>Committed Diesel</span>
                    <span className="font-semibold text-white">
                      {stats.spend.dieselLitres}L ({formatMoney(stats.spend.dieselCost)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span>Committed Gas</span>
                    <span className="font-semibold text-white">
                      {stats.spend.gasKg}KG ({formatMoney(stats.spend.gasCost)})
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-white/15 pt-1.5">
                    <span>Total:</span>
                    <span className="font-bold" style={{ color: TONE.green.line }}>
                      {formatMoney(stats.spend.cost + stats.spend.dieselCost + stats.spend.gasCost)}
                    </span>
                  </div>
                </div>
              }
            >
              {stats.requests.lists.live.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No truck is on the road right now.</p>
              ) : (
                <>
                  <p className="pb-2 text-[10px] leading-4 text-white/50">
                    Live fleet — every request, whenever it was raised. A truck on the road today is
                    a live fact, not one that belongs to the selected window.
                  </p>
                  {stats.requests.lists.live.map(dispatchedRow)}
                </>
              )}
            </DrillPopover>
          </div>

          <div className="relative">
            <LiveMetricTile
              label="Declined"
              value={stats.requests.declined}
              hint="Requests Rejected"
              tone="red"
              icon={CircleAlert}
              hasDrill
              onClick={() => drill.toggle("req-declined")}
            />
            <DrillPopover
              open={drill.isOpen("req-declined")}
              onClose={drill.close}
              title={`Declined Requests (${stats.requests.declined})`}
              width={340}
            >
              {stats.requests.lists.declined.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No request has been declined.</p>
              ) : (
                stats.requests.lists.declined.map((trip) => requestRow(trip, false))
              )}
            </DrillPopover>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Fleet Registry */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={Navigation}
          title="Fleet Registry (Truck Head & Truck Tail)"
          subtitle="Active personnel headcount, immediate dispatch availability, in-transit drivers & approved leave · live now, not the selected period"
        >
          <ToneTabs
            tabs={FLEET_SEGMENTS.map((s) => ({
              id: s.id as string,
              label: segmentCounts[s.id] === "—" ? s.label : `${s.label} (${segmentCounts[s.id]})`,
            }))}
            active={segment as string}
            onChange={(id) => setSegment(id as FleetSegment)}
          />
          <AuditButton onClick={() => setAudit("fleet")} />
        </SectionHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {fleetCards.map((card) => {
            const assets = fleetCardAssets(card.id);
            const tailValue: number | string = tailsKnown ? card.tail : "—";
            const totalValue: number | string = tailsKnown ? card.head + card.tail : card.head;
            const value =
              segment === "all" ? totalValue : segment === "tail" ? tailValue : card.head;
            const passedWord = card.id === "available" ? "Passed engineering inspection" : "";
            return (
              <div key={card.id} className="relative">
                <LiveMetricTile
                  label={card.label}
                  value={value}
                  hint={card.hint}
                  tone={card.tone}
                  icon={card.icon}
                  hasDrill
                  onClick={() => drill.toggle(`fleet-${card.id}`)}
                  {...(segment === "all"
                    ? {
                        split: {
                          aLabel: "Heads:",
                          aValue: card.head,
                          bLabel: "Tails:",
                          bValue: tailValue,
                        },
                      }
                    : {})}
                />
                <DrillPopover
                  open={drill.isOpen(`fleet-${card.id}`)}
                  onClose={drill.close}
                  title={card.title}
                  width={350}
                  footer={
                    // The design's footer appears only on the All Fleet breakdown:
                    // a single-side segment already says its side in the header.
                    segment === "all" ? (
                      <span>
                        {countLabel(assets.heads.length, "Head")} •{" "}
                        {countLabel(assets.tails.length, "Tail")}
                      </span>
                    ) : undefined
                  }
                >
                  {assets.heads.length + assets.tails.length === 0 ? (
                    <p className="py-3 text-[12px] text-white/60">Nothing in this group.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {assets.heads.length > 0 ? (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-white/70">
                          {countLabel(assets.heads.length, "Truck Head")} ({assets.heads.length})
                        </p>
                      ) : null}
                      {assets.heads.map((head) => {
                        const status = fleetStatusWord(head.status);
                        if (card.id === "total") {
                          return (
                            <DrillRow
                              key={head.id}
                              title={headLabel(head)}
                              variant="status"
                              tone={status.tone}
                              right={status.word}
                            />
                          );
                        }
                        return (
                          <DrillRow
                            key={head.id}
                            title={headLabel(head)}
                            variant="boxed"
                            tone={status.tone}
                            meta={checkUpText(head.registration, passedWord).text}
                          />
                        );
                      })}

                      {assets.tails.length > 0 ? (
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-white/70">
                          {countLabel(assets.tails.length, "Truck Tail")} ({assets.tails.length})
                        </p>
                      ) : null}
                      {assets.tails.map((tail) => {
                        const status = fleetStatusWord(tail.status);
                        if (card.id === "total") {
                          return (
                            <DrillRow
                              key={tail.id}
                              title={tailLabel(tail)}
                              variant="status"
                              tone={status.tone}
                              right={status.word}
                            />
                          );
                        }
                        return (
                          <DrillRow
                            key={tail.id}
                            title={tailLabel(tail)}
                            variant="boxed"
                            tone={status.tone}
                            meta={checkUpText(tail.registration, passedWord).text}
                          />
                        );
                      })}
                    </div>
                  )}
                </DrillPopover>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------------- Staff Registry */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={Users}
          title="Staff Registry (Driver Roster)"
          subtitle="Active driver headcount, immediate dispatch availability, in-transit drivers & approved leave · live now, not the selected period"
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <LiveMetricTile
            label="Total Number"
            value={stats.drivers.total}
            hint="Employed Drivers"
            tone="grey"
            icon={Users}
            detail={
              <div className="flex flex-col items-end gap-0.5">
                <TileNote tone="grey">{stats.drivers.verified}% HR Verified</TileNote>
                {/*
                 * The gap behind the percentage, said out loud: a register where
                 * nobody carries a licence date cannot be 100% verified, and HR
                 * is the department that has to close it.
                 */}
                {stats.drivers.licenceMissing > 0 ? (
                  <p className="text-right text-[10px] font-medium leading-4 text-[#8E95A1]">
                    {stats.drivers.licenceMissing} with no licence date
                  </p>
                ) : null}
              </div>
            }
          />
          <LiveMetricTile
            label="Available Drivers"
            value={stats.drivers.available}
            hint="Ready for Dispatch"
            tone="green"
            icon={CircleCheck}
            detail={<TileNote tone="green">Instant Assignment</TileNote>}
          />
          <LiveMetricTile
            label="On Active Trips"
            value={stats.drivers.onTrip}
            hint="In Transit"
            tone="blue"
            icon={Navigation}
            detail={<TileNote tone="blue">Live Tracking</TileNote>}
          />
          <LiveMetricTile
            label="Drivers on Leave"
            value={stats.drivers.offDuty}
            hint="Off Duty"
            tone="amber"
            icon={CalendarDays}
            detail={<TileNote tone="amber">HR Scheduled</TileNote>}
          />
        </div>
      </section>

      {/* -------------------------------------------------- Dispatch Live Tracking */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={MapPinned}
          title="Dispatch Live Tracking"
          subtitle="Live tracking telemetry, location progress checkpoints and driver telemetry"
        />

        <div className={cn("rounded-[10px] bg-white p-4 md:p-5", CARD_SHADOW)}>
          <div className="flex flex-col gap-3 border-b border-[#E2E5E9] pb-3.5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[18px] font-semibold leading-6 text-[#1B2432]">
                Active Dispatch
              </h3>
              <span className="grid h-6 min-w-6 place-items-center rounded-[4px] bg-[#ED351D] px-1.5 text-[12px] font-bold leading-none text-white tabular-nums">
                {mapTrips.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:gap-5">
              {/* View Partner — narrows the board to one partner's trucks. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPartnerMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-[6px] border border-[#D3D7DE] bg-white px-3 py-2 text-[12px] font-medium leading-none text-[#1B2432] transition-colors hover:bg-[#F7F8FA]"
                >
                  {partnerFilter === "all" ? "View Partner" : partnerFilter}
                  <span className="text-[#8E95A1]">▾</span>
                </button>
                {partnerMenuOpen ? (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setPartnerMenuOpen(false)} />
                    <div className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-[260px] w-[220px] overflow-y-auto rounded-[8px] border border-[#E2E5E9] bg-white py-1 shadow-[0_14px_32px_-10px_rgba(12,12,13,0.35)]">
                      {[
                        { name: "all", label: "All partners" },
                        ...partners.map((p) => ({ name: p, label: p })),
                      ].map((option) => {
                        const on = partnerFilter === option.name;
                        return (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() => {
                              setPartnerFilter(option.name);
                              setPartnerMenuOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center border-l-[3px] px-3 py-2 text-left text-[13px] font-medium transition-colors",
                              on
                                ? "border-[#ED351D] bg-[#FFF1EF] text-[#ED351D]"
                                : "border-transparent text-[#3C4653] hover:bg-[#F7F8FA]",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>

              {(
                [
                  ["On Schedule", stats.dispatch.onSchedule],
                  ["Slight delay", stats.dispatch.slight],
                  ["Significant Delay", stats.dispatch.significant],
                ] as const
              ).map(([label, count]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5C6470] md:text-[12px]"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TRACKING_DELAY_COLOR[label] }}
                  />
                  {label}
                  <span className="tabular-nums text-[#8E95A1]">({count})</span>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <DashboardLiveMap trips={mapTrips} />
          </div>
        </div>
      </section>

      {/* ------------------------------------ Engineering & Maintenance oversight */}

      {/* ------------------------------------------------- Parts & Inventory oversight */}

      {/* ---------------------------------------------------- Security oversight */}

      {/* --------------------------------------------------------------- dialogs */}
      <AuditDialog
        open={audit === "requests"}
        onClose={() => setAudit(null)}
        title="Total Partner Requests Breakdown"
        subtitle={`Requests raised in the window below · ${range.label}`}
        onPrint={printRequestsAudit}
      >
        {stats.requests.lists.all.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[#8E95A1]">
            No partner request raised in this window.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {stats.requests.lists.all.map((trip) => {
              const bucket = tripBucket(trip);
              const isBudgeted = bucket !== "pending" && bucket !== "declined";
              const c = trip.directCosts;
              const total = directCostOf(trip) + Number(c?.lubricantCost ?? 0);
              return (
                <div
                  key={trip.id}
                  className="flex flex-col gap-2.5 rounded-[8px] border border-[#E2E5E9] p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                      {displayRequestId(trip)} • {partnerOf(trip) || "—"}
                    </p>
                    {requestPill(trip)}
                  </div>
                  <AuditFactGrid
                    facts={[
                      { label: "Destination", value: trip.dropoff || "—" },
                      { label: "Cargo Product", value: trip.cargo || "—" },
                      { label: "Request Date", value: formatDateLines(trip.createdAt).date },
                      ...(isBudgeted
                        ? [
                            {
                              label: "Est Arrival",
                              value: trip.eta ? formatDateTimeStamp(trip.eta) : "—",
                            },
                          ]
                        : []),
                    ]}
                  />
                  {isBudgeted ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] leading-4 text-[#5C6470]">
                        {(
                          [
                            ["Trip Allowance", c?.tripAllowance],
                            ["Return Waybill", c?.returnWaybill],
                            ["Motor Boy", c?.motorBoy],
                            ["Road Tickets", c?.ticket],
                            ["Extra Allowance", c?.extraAllowance],
                            ["Bonus", c?.bonus ?? 0],
                          ] as const
                        )
                          .map(
                            ([label, value]) =>
                              `${label}: ${Number(value ?? 0).toLocaleString("en-NG")}`,
                          )
                          .join("  •  ")}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-[#5C6470]">
                          Lubricant:{" "}
                          {c?.lubricantQuantity
                            ? `${c.lubricantQuantity}${
                                c.lubricantType === "Gas" ? "KG" : "L"
                              } (${formatMoney(c.lubricantCost)})`
                            : "—"}
                        </span>
                        <span className="text-[11px] font-semibold text-[#5C6470]">
                          Total:{" "}
                          <span
                            className="text-[12px] font-bold"
                            style={{ color: TONE.green.text }}
                          >
                            {formatMoney(total)}
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </AuditDialog>

      <AuditDialog
        open={audit === "fleet"}
        onClose={() => setAudit(null)}
        title="Fleet Registry: Total Fleet Assets"
        subtitle="All fleet registry"
        tabs={[
          { id: "head", label: `Truck Head (${stats.fleet.heads.total})` },
          { id: "tail", label: `Truck Tail (${tailsKnown ? stats.fleet.tails.total : "—"})` },
        ]}
        activeTab={fleetAuditTab}
        onTabChange={(id) => setFleetAuditTab(id as "head" | "tail")}
        onPrint={printFleetAudit}
      >
        {fleetAuditTab === "head" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {stats.fleet.allHeads.map((head) => {
              const status = fleetStatusWord(head.status);
              const check = checkUpByReg.get(String(head.registration).trim().toLowerCase());
              return (
                <div
                  key={head.id}
                  className="flex flex-col gap-2.5 rounded-[8px] border p-3.5"
                  style={{ borderColor: TONE[status.tone].border }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                      {headLabel(head)}
                    </p>
                    <StatusPill label={status.word} tone={status.tone} />
                  </div>
                  <div className="flex items-center justify-between rounded-[6px] bg-[#F1F2F4] px-3.5 py-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                      Last Check-up
                    </span>
                    <span className="text-[13px] font-medium text-[#1B2432]">
                      {check ? formatDateLines(check.reportedAt).date : "—"}{" "}
                      <span className="text-[#8E95A1]">
                        ({check?.status === "Completed" ? "Passed" : check ? "Pending" : "None"})
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
            {stats.fleet.allHeads.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[#8E95A1]">
                No truck head on record.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {stats.fleet.allTails.map((tail) => {
              const status = fleetStatusWord(tail.status);
              const check = checkUpByReg.get(String(tail.registration).trim().toLowerCase());
              return (
                <div
                  key={tail.id}
                  className="flex flex-col gap-2.5 rounded-[8px] border p-3.5"
                  style={{ borderColor: TONE[status.tone].border }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                      {tailLabel(tail)}
                    </p>
                    <StatusPill label={status.word} tone={status.tone} />
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-[6px] bg-[#F1F2F4] px-3.5 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                        Tail Type
                      </span>
                      <span className="text-[13px] font-medium text-[#1B2432]">
                        {tail.type || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                        Last Check-up
                      </span>
                      <span className="text-[13px] font-medium text-[#1B2432]">
                        {check ? formatDateLines(check.reportedAt).date : "—"}{" "}
                        <span className="text-[#8E95A1]">
                          ({check?.status === "Completed" ? "Passed" : check ? "Pending" : "None"})
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {stats.fleet.allTails.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[#8E95A1]">
                No truck tail on record.
              </p>
            ) : null}
          </div>
        )}
      </AuditDialog>

      {/* --------------------------------- engineering audit — the TM's own sheet */}
      <AuditDialog
        open={audit === "engineering"}
        onClose={() => setAudit(null)}
        title="Engineering & Maintenance: Workshop Oversight"
        subtitle={`Maintenance spend in the window below · ${range.label}`}
        onPrint={printEngineeringAudit}
      >
        {!eng ? (
          <p className="py-8 text-center text-[13px] text-[#8E95A1]">Reading the workshop…</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AuditFactGrid
                facts={[
                  { label: "Maintenance Spend", value: formatMoney(eng.spend.total) },
                  { label: "Jobs In Window", value: String(eng.spend.jobs) },
                  { label: "Jobs On File", value: String(eng.totalJobs) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Parts Value In Queue", value: formatMoney(eng.partsQueue.value) },
                  { label: "Awaiting Parts", value: String(eng.partsQueue.count) },
                  { label: "Open Job Value", value: formatMoney(eng.open.value) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Under Maintenance", value: String(eng.shop.maintenance) },
                  { label: "Under Check-up", value: String(eng.shop.checkUp) },
                  { label: "Accident", value: String(eng.shop.accident) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  {
                    label: "Longest Downtime",
                    value: formatDuration(eng.downtime.longestDays * 24),
                  },
                  { label: "Past 5 Days", value: String(eng.downtime.flagged) },
                  { label: "Open Jobs", value: String(eng.open.count) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  {
                    label: "Avg Turnaround",
                    value: eng.turnaround.avgDays === null ? "—" : `${eng.turnaround.avgDays}d`,
                  },
                  { label: "Jobs Measured", value: String(eng.turnaround.completed) },
                  { label: "Fault Categories", value: String(eng.defects.length) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Top Cost Asset", value: topAsset?.label ?? "—" },
                  { label: "Its Spend", value: topAsset ? formatMoney(topAsset.spend) : "—" },
                  { label: "Its Jobs", value: topAsset ? String(topAsset.jobs) : "—" },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Awaiting Approval", value: String(eng.requisitions.pending.count) },
                  { label: "Requests Value", value: formatMoney(eng.requisitions.pending.value) },
                  { label: "Blocked By Stock", value: String(eng.requisitions.pending.blocked) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Promised Back", value: String(eng.rts.promised) },
                  { label: "Past Its Date", value: String(eng.rts.overdue.count) },
                  { label: "No Date At All", value: String(eng.rts.missing) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  {
                    label: "Cost Per KM",
                    value: eng.cpk.value === null ? "—" : `${formatMoney(eng.cpk.value)}/km`,
                  },
                  { label: "KM Measured", value: eng.cpk.km.toLocaleString() },
                  {
                    label: "Store Value",
                    value: `${formatMoney(eng.inventory.value)} · ${eng.inventory.outOfStock} out`,
                  },
                ]}
              />
            </div>

            {/* The one queue on this board the TM acts on. */}
            <div>
              <h3 className="mb-2 text-[15px] font-semibold text-[#1B2432]">
                Parts Awaiting Your Approval ({eng.requisitions.pending.count})
              </h3>
              {eng.requisitions.pending.list.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                  Nothing is waiting on your decision.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {eng.requisitions.pending.list.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-col gap-2.5 rounded-[8px] border border-[#E2E5E9] p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                          {request.truck} • {request.part}
                        </p>
                        <span className="shrink-0 text-[13px] font-semibold text-[#1B2432]">
                          {formatMoney(request.cost)}
                        </span>
                      </div>
                      <AuditFactGrid
                        facts={[
                          { label: "Defect", value: request.defect || "—" },
                          { label: "Quantity", value: String(request.quantity) },
                          { label: "Unit Price", value: formatMoney(request.unitCost) },
                          {
                            label: "Store",
                            value:
                              request.stock === null
                                ? "Not a store part"
                                : `${request.stock} on the shelf${request.short ? " — short" : ""}`,
                          },
                          { label: "Mechanic", value: request.mechanic },
                          { label: "Raised", value: formatDateLines(request.requestedAt).date },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-[15px] font-semibold text-[#1B2432]">
                Open Work Orders ({eng.open.count})
              </h3>
              {eng.open.list.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                  No truck is sitting in the workshop.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {eng.open.list.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col gap-2.5 rounded-[8px] border p-3.5"
                      style={{ borderColor: TONE[job.tone].border }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                          {job.truck}
                        </p>
                        <StatusPill label={job.status} tone={job.tone} />
                      </div>
                      <AuditFactGrid
                        facts={[
                          { label: "Defect", value: job.defect },
                          { label: "Category", value: job.category },
                          { label: "Mechanic", value: job.mechanic },
                          {
                            label: "In Shop",
                            value: job.days === null ? "—" : formatDuration(job.days * 24),
                          },
                          { label: "Cost", value: formatMoney(job.cost) },
                          { label: "Reported", value: formatDateLines(job.reportedAt).date },
                          {
                            label: "Return to service",
                            value: job.estimatedReadyAt
                              ? `${formatDateLines(job.estimatedReadyAt).date} · ${promiseWord(job.rtsDays)}`
                              : "No date promised",
                          },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {eng.turnaround.byMechanic.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-[#1B2432]">
                  Mechanic Efficiency
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {eng.turnaround.byMechanic.map((row) => (
                    <div
                      key={row.mechanic}
                      className="flex items-center justify-between rounded-[6px] bg-[#F1F2F4] px-3.5 py-2.5"
                    >
                      <span className="text-[13px] font-medium text-[#1B2432]">{row.mechanic}</span>
                      <span className="text-[12px] text-[#5C6470]">
                        {countLabel(row.jobs, "job")} ·{" "}
                        <span className="font-semibold text-[#1B2432]">
                          {row.avgDays === null ? "—" : `${row.avgDays}d avg`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </AuditDialog>

      {/* ------------------------------------ parts & inventory audit — the TM's own sheet */}
      <AuditDialog
        open={audit === "parts"}
        onClose={() => setAudit(null)}
        title="Parts & Inventory: Store Oversight"
        subtitle={`Store activity in the window below · ${range.label}`}
        onPrint={printPartsAudit}
      >
        {!parts ? (
          <p className="py-8 text-center text-[13px] text-[#8E95A1]">Reading the store…</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AuditFactGrid
                facts={[
                  { label: "Store Valuation", value: formatMoney(parts.valuation.total) },
                  { label: "At Purchase Prices", value: formatMoney(parts.valuation.priced) },
                  { label: "Store Lines", value: String(parts.valuation.lines) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Idle Capital", value: formatMoney(parts.idle.value) },
                  { label: "Idle Lines", value: String(parts.idle.lines) },
                  { label: "Ledger Movements", value: String(movements.length) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Issued In Window", value: formatMoney(parts.consumption.value) },
                  { label: "Units Issued", value: String(parts.consumption.units) },
                  { label: "Issues", value: String(parts.consumption.events) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Purchased In Window", value: formatMoney(parts.purchases.value) },
                  { label: "Units Bought", value: String(parts.purchases.units) },
                  { label: "Purchases", value: String(parts.purchases.events) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Healthy", value: String(parts.health.ok) },
                  { label: "Low", value: String(parts.health.low) },
                  { label: "Out Of Stock", value: String(parts.health.out) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "To Reorder", value: String(parts.reorder.count) },
                  { label: "Est. Reorder Cost", value: formatMoney(parts.reorder.estimatedCost) },
                  { label: "Addressed To Supplier", value: String(parts.reorder.addressed) },
                ]}
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                Reorder list ({parts.reorder.count})
              </p>
              {parts.reorder.list.length === 0 ? (
                <p className="text-[13px] text-[#8E95A1]">Every line is above its reorder level.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.4px] text-[#8E95A1]">
                        <th className="py-1.5 pr-3">Part</th>
                        <th className="py-1.5 pr-3">SKU</th>
                        <th className="py-1.5 pr-3">Held</th>
                        <th className="py-1.5 pr-3">Reorder at</th>
                        <th className="py-1.5 pr-3">To buy</th>
                        <th className="py-1.5 pr-3">Est. cost</th>
                        <th className="py-1.5 pr-3">Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.reorder.list.map((row) => (
                        <tr
                          key={`ar-${row.id}`}
                          className="border-t border-[#E2E5E9] text-[#344256]"
                        >
                          <td className="py-1.5 pr-3 font-medium text-[#1B2432]">{row.item}</td>
                          <td className="py-1.5 pr-3">{row.sku}</td>
                          <td className="py-1.5 pr-3">{row.stock}</td>
                          <td className="py-1.5 pr-3">{row.reorderLevel}</td>
                          <td className="py-1.5 pr-3">{row.toBuy}</td>
                          <td className="py-1.5 pr-3">{formatMoney(row.estimatedCost)}</td>
                          <td className="py-1.5 pr-3">{row.supplier || "no supplier on file"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                Consumption by truck ({parts.consumption.byTruck.length})
              </p>
              {parts.consumption.byTruck.length === 0 ? (
                <p className="text-[13px] text-[#8E95A1]">No part was issued in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.4px] text-[#8E95A1]">
                        <th className="py-1.5 pr-3">Truck</th>
                        <th className="py-1.5 pr-3">Units</th>
                        <th className="py-1.5 pr-3">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.consumption.byTruck.map((row) => (
                        <tr
                          key={`at-${row.truck}`}
                          className="border-t border-[#E2E5E9] text-[#344256]"
                        >
                          <td className="py-1.5 pr-3 font-medium text-[#1B2432]">{row.truck}</td>
                          <td className="py-1.5 pr-3">{row.units}</td>
                          <td className="py-1.5 pr-3">{formatMoney(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                Vendor spend ({parts.purchases.byVendor.length})
              </p>
              {parts.purchases.byVendor.length === 0 ? (
                <p className="text-[13px] text-[#8E95A1]">No vendor was paid in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.4px] text-[#8E95A1]">
                        <th className="py-1.5 pr-3">Vendor</th>
                        <th className="py-1.5 pr-3">Units</th>
                        <th className="py-1.5 pr-3">Lines</th>
                        <th className="py-1.5 pr-3">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.purchases.byVendor.map((row) => (
                        <tr
                          key={`av-${row.vendor}`}
                          className="border-t border-[#E2E5E9] text-[#344256]"
                        >
                          <td className="py-1.5 pr-3 font-medium text-[#1B2432]">{row.vendor}</td>
                          <td className="py-1.5 pr-3">{row.units}</td>
                          <td className="py-1.5 pr-3">{row.lines}</td>
                          <td className="py-1.5 pr-3">{formatMoney(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                Value on typed-in prices ({parts.valuation.unpricedLines.length})
              </p>
              {parts.valuation.unpricedLines.length === 0 ? (
                <p className="text-[13px] text-[#8E95A1]">
                  Every valued line rests on a recorded purchase.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.4px] text-[#8E95A1]">
                        <th className="py-1.5 pr-3">Part</th>
                        <th className="py-1.5 pr-3">SKU</th>
                        <th className="py-1.5 pr-3">Stock</th>
                        <th className="py-1.5 pr-3">Unit price</th>
                        <th className="py-1.5 pr-3">Line value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.valuation.unpricedLines.map((line) => (
                        <tr
                          key={`au-${line.id}`}
                          className="border-t border-[#E2E5E9] text-[#344256]"
                        >
                          <td className="py-1.5 pr-3 font-medium text-[#1B2432]">{line.name}</td>
                          <td className="py-1.5 pr-3">{line.sku}</td>
                          <td className="py-1.5 pr-3">{line.stock}</td>
                          <td className="py-1.5 pr-3">{formatMoney(line.unitCost)}</td>
                          <td className="py-1.5 pr-3">{formatMoney(line.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </AuditDialog>

      {/* ------------------------------------- Diesel & lubricant oversight --- */}
      <AuditDialog
        open={audit === "fuel"}
        onClose={() => setAudit(null)}
        title="Diesel & Lubricant: Fuel Oversight"
        subtitle={`The tank, the releases and every litre pumped · ${range.label}`}
        onPrint={printFuelAudit}
      >
        {!fuel ? (
          <p className="py-8 text-center text-[13px] text-[#8E95A1]">Reading the tank…</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AuditFactGrid
                facts={[
                  {
                    label: "Diesel In Tank",
                    value: dieselTank ? `${formatQuantity(dieselTank.quantity)} L` : "—",
                  },
                  {
                    label: "Gas In Tank",
                    value: gasTank
                      ? `${formatQuantity(gasTank.quantity)} ${unitWord(gasTank.unit)}`
                      : "—",
                  },
                  {
                    label: "Safety Level",
                    value: dieselTank ? `${formatQuantity(dieselTank.minLevel)} L` : "—",
                  },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Tank Value", value: formatMoney(fuel.tanks.value) },
                  { label: "Valued At", value: tankBasisWord ?? "Not valued" },
                  { label: "Below Safety", value: String(fuel.tanks.low) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Awaiting You", value: String(fuel.approvals.count) },
                  { label: "Litres Requested", value: formatQuantity(fuel.approvals.litres) },
                  { label: "Their Value", value: formatMoney(fuel.approvals.value) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Released, Not Pumped", value: String(fuel.pickups.count) },
                  { label: "Litres Held", value: formatQuantity(fuel.pickups.litres) },
                  {
                    label: "Longest Wait",
                    value:
                      fuel.pickups.longestHours === null
                        ? "—"
                        : formatDuration(fuel.pickups.longestHours),
                  },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Pumped Today", value: `${formatQuantity(fuel.spend.todayLitres)} L` },
                  { label: "Today's Value", value: formatMoney(fuel.spend.todayValue) },
                  { label: "Trucks Served", value: String(fuel.spend.todayTrucks) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Over-Pump Flags", value: String(fuel.variance.count) },
                  { label: "Litres Over", value: formatQuantity(fuel.variance.overLitres) },
                  { label: "Value Over", value: formatMoney(fuel.variance.overValue) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "No Release At All", value: String(fuel.variance.unauthorized) },
                  { label: "All-Time Litres", value: formatQuantity(fuel.spend.totalLitres) },
                  { label: "All-Time Value", value: formatMoney(fuel.spend.totalValue) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  {
                    label: "Worst km/L",
                    value: worstEfficiency ? `${worstEfficiency.kmPerLitre}` : "—",
                  },
                  { label: "Trucks Measured", value: String(fuel.efficiency.measured) },
                  { label: "Destinations", value: String(fuel.routes.measured) },
                ]}
              />
            </div>

            <div>
              <h3 className="mb-2 text-[15px] font-semibold text-[#1B2432]">
                Dispensing Ledger ({fuel.ledger.count})
              </h3>
              {fuel.ledger.list.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                  {pumpRead
                    ? "Nothing has been pumped from the tank yet."
                    : "The pump ledger has not been read — this is not yet an all-clear."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {fuel.ledger.list.map((row) => (
                    <div
                      key={`${row.tripId}-${row.at}`}
                      className="flex flex-col gap-2.5 rounded-[8px] border p-3.5"
                      style={{ borderColor: TONE[row.tone].border }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                          {row.reference} • {row.truck}
                        </p>
                        <StatusPill
                          label={
                            row.overLitres > 0
                              ? "Over"
                              : row.unauthorized
                                ? "No release"
                                : "Matched"
                          }
                          tone={row.tone}
                        />
                      </div>
                      <AuditFactGrid
                        facts={[
                          {
                            label: "Pumped",
                            value: `${formatQuantity(row.litres)} ${row.unit.toLowerCase()}`,
                          },
                          { label: "Value", value: formatMoney(row.value) },
                          {
                            label: "Released",
                            value:
                              row.authorizedLitres !== null
                                ? formatQuantity(row.authorizedLitres)
                                : row.requestedLitres !== null
                                  ? `asked ${formatQuantity(row.requestedLitres)}`
                                  : "nothing",
                          },
                          {
                            label: "Variance",
                            value:
                              row.overLitres > 0 ? `${formatQuantity(row.overLitres)} over` : "—",
                          },
                          { label: "Attendant", value: row.attendant },
                          { label: "Pumped at", value: formatDateTimeStamp(row.at) },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-[15px] font-semibold text-[#1B2432]">
                Diesel Per Destination
              </h3>
              {fuel.routes.list.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                  {asksRead
                    ? "No dispatch has requested diesel yet."
                    : "The request book has not been read yet."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fuel.routes.list.map((row) => (
                    <div
                      key={row.route}
                      className="flex items-center justify-between rounded-[6px] bg-[#F1F2F4] px-3.5 py-2.5"
                    >
                      <span className="min-w-0 truncate text-[13px] font-medium text-[#1B2432]">
                        {row.route}
                      </span>
                      <span className="shrink-0 text-[12px] text-[#5C6470]">
                        {countLabel(row.trips, "trip")} · avg {formatQuantity(row.avgAsked)} L · max{" "}
                        <span className="font-semibold text-[#1B2432]">
                          {formatQuantity(row.maxAsked)} L
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </AuditDialog>

      {/* ------------------------------------ security audit — the TM's own sheet */}
      <AuditDialog
        open={audit === "security"}
        onClose={() => setAudit(null)}
        title="Gate Security: Yard & Movement Oversight"
        subtitle={`Movements logged in the window below · ${range.label}`}
        onPrint={printSecurityAudit}
        tabs={[
          { id: "out", label: `Out of Yard (${sec?.yard.out ?? 0})` },
          { id: "exit", label: `Pending Exits (${sec?.pendingExits.count ?? 0})` },
          { id: "tat", label: `Turnaround (${sec?.tat.measured ?? 0})` },
        ]}
        activeTab={gateAuditTab}
        onTabChange={(id) => setGateAuditTab(id as "out" | "exit" | "tat")}
      >
        {!sec ? (
          <p className="py-8 text-center text-[13px] text-[#8E95A1]">Reading the gate log…</p>
        ) : gateAuditTab === "out" ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AuditFactGrid
                facts={[
                  { label: "In Yard", value: String(sec.yard.inYard) },
                  { label: "Out of Yard", value: String(sec.yard.out) },
                  { label: "Heads On Record", value: String(sec.yard.totalHeads) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Awaiting Return", value: String(sec.awaitingReturn.count) },
                  { label: "Expected Known", value: String(sec.awaitingReturn.expectedKnown) },
                  { label: "Overdue", value: String(sec.overdue.count) },
                ]}
              />
              <AuditFactGrid
                facts={[
                  { label: "Logged Out", value: String(sec.movements.departures) },
                  { label: "Logged In", value: String(sec.movements.returns) },
                  { label: "Avg Turnaround", value: formatDuration(sec.tat.avgHours) },
                ]}
              />
            </div>
            {sec.yard.list.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                Every truck is inside the yard.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {sec.yard.list.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-2.5 rounded-[8px] border border-[#E2E5E9] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                        {t.label} • {t.truck}
                      </p>
                      <StatusPill
                        label={t.overdueHours !== null ? "OVERDUE" : "OUT"}
                        tone={t.overdueHours !== null ? "red" : "purple"}
                      />
                    </div>
                    <AuditFactGrid
                      facts={[
                        { label: "Driver", value: t.driver },
                        { label: "Partner", value: t.partner },
                        { label: "Route", value: t.route },
                        { label: "Departed", value: gateStamp(t.departedAt, "Not Departed") },
                        { label: "Out For", value: formatDuration(t.hoursOut) },
                        {
                          label: "Expected Return",
                          value: t.expectedReturn
                            ? formatDateLines(t.expectedReturn.toISOString()).date
                            : "Not set",
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : gateAuditTab === "exit" ? (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-[#5C6470]">
              Dispatches the Transport Manager has released but the gate has not logged out. Waiting
              is measured from the moment of release, so the queue cannot be mistaken for a delay
              caused by dispatch.
            </p>
            {sec.pendingExits.list.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                Every released dispatch has been logged out.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {sec.pendingExits.list.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-2.5 rounded-[8px] border border-[#E2E5E9] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                        {t.label} • {t.truck}
                      </p>
                      <StatusPill label={`WAITING ${formatDuration(t.waitHours)}`} tone={t.tone} />
                    </div>
                    <AuditFactGrid
                      facts={[
                        { label: "Partner", value: t.partner },
                        { label: "Route", value: t.route },
                        { label: "Driver", value: t.driver },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AuditFactGrid
                facts={[
                  { label: "Average", value: formatDuration(sec.tat.avgHours) },
                  { label: "Median", value: formatDuration(sec.tat.medianHours) },
                  { label: "Longest", value: formatDuration(sec.tat.longestHours) },
                ]}
              />
            </div>
            {sec.tat.list.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-[#8E95A1]">
                No trip has both a gate departure and a gate return in this window.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {sec.tat.list.map((t) => (
                  <div
                    key={`${t.id}-tat-card`}
                    className="flex flex-col gap-2.5 rounded-[8px] border p-3.5"
                    style={{ borderColor: TONE[t.tone].border }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1B2432]">
                        {t.label} • {t.truck}
                      </p>
                      <StatusPill label={formatDuration(t.hoursOut)} tone="green" />
                    </div>
                    <AuditFactGrid
                      facts={[
                        { label: "Partner", value: t.partner },
                        { label: "Logged Out", value: gateStamp(t.departedAt, "—") },
                        { label: "Logged In", value: gateStamp(t.returnedAt, "—") },
                        { label: "Driver", value: t.driver },
                        { label: "Route", value: t.route },
                        { label: "Gate-to-Gate", value: formatDuration(t.hoursOut) },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </AuditDialog>
    </div>
  );
}
