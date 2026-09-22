import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Clock,
  History,
  MapPinned,
  Navigation,
  Users,
  Wrench,
} from "lucide-react";
import {
  adminService,
  authService,
  dashboardService,
  engineeringService,
  fleetService,
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
import { formatDateLines, formatDateTimeStamp, formatTableDate } from "@/lib/fleetopsx/display-dates";
import { getTrackingDelayStatus, partnerOf, TRACKING_DELAY_COLOR } from "@/lib/fleetopsx/tracking-ops";
import { formatMoney } from "@/lib/fleetopsx/lubricant";
import { licenseExpiry } from "@/lib/fleetopsx/license";
import { cn } from "@/lib/utils";
import type { Driver, Expense, Trip, TruckHead, TruckTail, User, WorkOrder } from "@/lib/fleetopsx/types";
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
 * `KTU193XC / B078` — the head assigned to a dispatch.
 *
 * The column carries the plate and the tail code separated by a slash, and a
 * dispatch whose tail was never paired arrives as `KTU193XC / None`. Drop the
 * empty slots so the row reads `KTU193XC`, never `/ None`.
 */
function truckRegText(trip: Trip) {
  const raw = String(trip.truckReg ?? "").trim();
  if (!raw || raw === "Unassigned") return "";
  return raw
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && !/^none$/i.test(part))
    .join(" / ");
}

/** `1 Head` / `2 Heads` — the design pluralises its group headers and footers. */
function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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
        {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
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
  const [clock, setClock] = useState<Date | null>(null);

  /**
   * The window this board reports on. It opens on TODAY — the daily capture is
   * what an operator reads first — and Month / Custom widen it when someone
   * needs a longer read. Every activity figure below belongs to this window.
   */
  const [periodKind, setPeriodKind] = useState<PeriodKind>("day");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [segment, setSegment] = useState<FleetSegment>("all");
  const [audit, setAudit] = useState<"requests" | "fleet" | null>(null);
  const [fleetAuditTab, setFleetAuditTab] = useState<"head" | "tail">("head");
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
      if (canListUsers) {
        void adminService
          .users()
          .then((u) => {
            if (!cancelled) setUsers(u);
          })
          .catch(() => {});
      }
    };

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
      const key = String(wo.truckReg ?? "").trim().toLowerCase();
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
    const wo = checkUpByReg.get(String(registration ?? "").trim().toLowerCase());
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
                    <span className="font-semibold text-white">{stats.requests.dispatched} dispatches</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span>Committed Direct Cost</span>
                    <span className="font-semibold text-white">{formatMoney(stats.spend.cost)}</span>
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
                    Live fleet — every request, whenever it was raised. A truck on the road today
                    is a live fact, not one that belongs to the selected window.
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
              label:
                segmentCounts[s.id] === "—" ? s.label : `${s.label} (${segmentCounts[s.id]})`,
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
            const value = segment === "all" ? totalValue : segment === "tail" ? tailValue : card.head;
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
                          {countLabel(assets.heads.length, "Truck Head")} (
                          {assets.heads.length})
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
                          {countLabel(assets.tails.length, "Truck Tail")} (
                          {assets.tails.length})
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
              <h3 className="text-[18px] font-semibold leading-6 text-[#1B2432]">Active Dispatch</h3>
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
                            ["Contingency", c?.extraAllowance],
                            ["Bonus", c?.bonus ?? 0],
                          ] as const
                        )
                          .map(([label, value]) => `${label}: ${Number(value ?? 0).toLocaleString("en-NG")}`)
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
                          <span className="text-[12px] font-bold" style={{ color: TONE.green.text }}>
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
              <p className="py-8 text-center text-[13px] text-[#8E95A1]">No truck head on record.</p>
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
                      <span className="text-[13px] font-medium text-[#1B2432]">{tail.type || "—"}</span>
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
              <p className="py-8 text-center text-[13px] text-[#8E95A1]">No truck tail on record.</p>
            ) : null}
          </div>
        )}
      </AuditDialog>
    </div>
  );
}
