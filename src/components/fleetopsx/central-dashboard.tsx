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
import {
  DOWNTIME_FLAG_DAYS,
  buildEngineeringOversight,
  buildSecurityOversight,
  formatDuration,
  type EngJob,
  type SecTrip,
} from "@/lib/fleetopsx/dashboard-departments";
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
  const [audit, setAudit] = useState<"requests" | "fleet" | "engineering" | "security" | null>(
    null,
  );
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
    () => (clock ? buildEngineeringOversight(workOrders, live.trucks ?? [], range, clock) : null),
    [workOrders, live.trucks, clock, range],
  );

  /**
   * The Gate House, as the Transport Manager audits it: what is physically in
   * the yard, what the gate was released but never logged out, which trucks are
   * past their expected return, and how long a trip really took gate to gate.
   */
  const sec = useMemo(
    () => (clock ? buildSecurityOversight(live.trips ?? [], live.trucks ?? [], range, clock) : null),
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
        <span className="shrink-0 text-[11px] font-semibold text-white">{formatMoney(job.cost)}</span>
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
          `<tr><td>${t.label}</td><td>${t.truck}</td><td>${t.partner}</td><td>${
            gateStamp(t.departedAt, "—")
          }</td><td>${gateStamp(t.returnedAt, "—")}</td><td>${
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

      {/* ------------------------------------ Engineering & Maintenance oversight */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={Wrench}
          title="Engineering & Maintenance (Workshop Oversight)"
          subtitle="Maintenance spend, the parts queue, trucks sitting in the shop and the faults that keep coming back · the department works this board, the Transport Manager audits it"
        >
          <PeriodNote>{range.note}</PeriodNote>
          <AuditButton onClick={() => setAudit("engineering")} />
        </SectionHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1 — the money committed in the window. */}
          <div className="relative">
            <LiveMetricTile
              label="Maintenance Spend"
              value={money(eng?.spend.total)}
              hint={countLabel(eng?.spend.jobs ?? 0, "job")}
              tone="green"
              icon={Wrench}
              hasDrill
              onClick={() => drill.toggle("eng-spend")}
              valueClass="text-[24px]"
              detail={
                <TileNote tone="grey">{countLabel(eng?.totalJobs ?? 0, "job")} on file</TileNote>
              }
            />
            <DrillPopover
              open={drill.isOpen("eng-spend")}
              onClose={drill.close}
              title={`Maintenance Spend (${money(eng?.spend.total)})`}
              width={380}
              footer={
                <span>
                  {countLabel(eng?.spend.jobs ?? 0, "job")} · {range.label}
                </span>
              }
            >
              <p className="pb-2 text-[10px] leading-4 text-white/50">
                Jobs raised or closed inside the selected window — what the workshop committed in that
                window, whether or not the money has been spent yet.
              </p>
              {!eng || eng.spend.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  No maintenance spend in this window.
                </p>
              ) : (
                eng.spend.list.map(engJobRow)
              )}
            </DrillPopover>
          </div>

          {/* 2 — money not yet spent: the parts queue. */}
          <div className="relative">
            <LiveMetricTile
              label="Parts Value in Queue"
              value={money(eng?.partsQueue.value)}
              hint={countLabel(eng?.partsQueue.count ?? 0, "job")}
              tone="amber"
              icon={History}
              hasDrill
              onClick={() => drill.toggle("eng-parts")}
              valueClass="text-[24px]"
              detail={
                <TileDetailRows
                  rows={[
                    { label: "Open jobs:", value: eng?.open.count ?? "—", tone: "blue" },
                    { label: "Open value:", value: money(eng?.open.value), tone: "amber" },
                  ]}
                />
              }
            />
            <DrillPopover
              open={drill.isOpen("eng-parts")}
              onClose={drill.close}
              title={`Awaiting Parts (${money(eng?.partsQueue.value)})`}
              width={380}
              footer={
                <span>
                  {countLabel(eng?.partsQueue.count ?? 0, "job")} · open work is worth {" "}
                  {money(eng?.open.value)}
                </span>
              }
            >
              {eng && eng.unpricedInQueue > 0 ? (
                <p className="pb-2 text-[10px] leading-4 text-white/50">
                  {countLabel(eng.unpricedInQueue, "job")} in this queue carries no cost yet, so this
                  figure is a floor, not a total.
                </p>
              ) : null}
              {!eng || eng.partsQueue.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">Nothing is waiting on parts.</p>
              ) : (
                eng.partsQueue.list.map(engJobRow)
              )}
            </DrillPopover>
          </div>

          {/* 3 — the live fleet states Engineering owns. */}
          <div className="relative">
            <LiveMetricTile
              label="Under Maintenance"
              value={eng?.shop.maintenance ?? "—"}
              hint="Under Repair"
              tone="amber"
              icon={Wrench}
              hasDrill
              onClick={() => drill.toggle("eng-shop")}
              split={{
                aLabel: "Under Check-up",
                aValue: eng?.shop.checkUp ?? "—",
                bLabel: "Accident",
                bValue: eng?.shop.accident ?? "—",
              }}
            />
            <DrillPopover
              open={drill.isOpen("eng-shop")}
              onClose={drill.close}
              title={`Trucks in Engineering (${(eng?.shop.maintenance ?? 0) + (eng?.shop.checkUp ?? 0) + (eng?.shop.accident ?? 0)})`}
              width={360}
              footer={
                <span>
                  {eng?.shop.maintenance ?? 0} Maintenance · {eng?.shop.checkUp ?? 0} Check-up ·{" "}
                  {eng?.shop.accident ?? 0} Accident
                </span>
              }
            >
              {!eng ||
              eng.shop.maintenanceList.length + eng.shop.checkUpList.length + eng.shop.accidentList.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No truck is sitting in the workshop.</p>
              ) : (
                <>
                  {eng.shop.maintenanceList.map(shopTruckRow)}
                  {eng.shop.checkUpList.map(shopTruckRow)}
                  {eng.shop.accidentList.map(shopTruckRow)}
                </>
              )}
            </DrillPopover>
          </div>

          {/* 4 — the truck the workshop has held longest. */}
          <div className="relative">
            <LiveMetricTile
              label="Longest Downtime"
              value={
                eng && eng.downtime.list.length > 0
                  ? formatDuration(eng.downtime.longestDays * 24)
                  : "—"
              }
              hint={
                (eng?.downtime.flagged ?? 0) > 0
                  ? `${countLabel(eng?.downtime.flagged ?? 0, "truck")} past ${DOWNTIME_FLAG_DAYS} days`
                  : "Inside the 5-day line"
              }
              tone={downtimeTone}
              icon={Clock}
              hasDrill
              onClick={() => drill.toggle("eng-downtime")}
            />
            <DrillPopover
              open={drill.isOpen("eng-downtime")}
              onClose={drill.close}
              title={`Time in the Shop (${eng?.open.count ?? 0} open)`}
              width={380}
              footer={
                <span>
                  Flags red past {DOWNTIME_FLAG_DAYS} days · {eng?.downtime.flagged ?? 0} flagged
                </span>
              }
            >
              <p className="pb-2 text-[10px] leading-4 text-white/50">
                Measured from the moment the workshop began the job, not from when the truck entered
                the yard.
              </p>
              {!eng || eng.downtime.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No open job — nothing is in the shop.</p>
              ) : (
                eng.downtime.list.map(engJobRow)
              )}
            </DrillPopover>
          </div>

          {/* 5 — how long the workshop actually takes. */}
          <div className="relative">
            <LiveMetricTile
              label="Avg Repair Turnaround"
              value={eng?.turnaround.avgDays === null || eng?.turnaround.avgDays === undefined ? "—" : `${eng.turnaround.avgDays}d`}
              hint={countLabel(eng?.turnaround.completed ?? 0, "job") + " closed"}
              tone="blue"
              icon={Clock}
              hasDrill
              onClick={() => drill.toggle("eng-tat")}
            />
            <DrillPopover
              open={drill.isOpen("eng-tat")}
              onClose={drill.close}
              title="Repair Turnaround by Mechanic"
              width={360}
              footer={
                <span>
                  {eng?.turnaround.completed ?? 0} finished job(s) measured from start to close
                </span>
              }
            >
              {!eng || eng.turnaround.byMechanic.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  No job has both a start and a completion stamp yet, so there is nothing honest to
                  average.
                </p>
              ) : (
                eng.turnaround.byMechanic.map((row) => (
                  <DrillRow
                    key={row.mechanic}
                    title={row.mechanic}
                    meta={countLabel(row.jobs, "job")}
                    right={
                      <span className="shrink-0 text-[11px] font-semibold text-white">
                        {row.avgDays === null ? "—" : `${row.avgDays}d avg`}
                      </span>
                    }
                  />
                ))
              )}
            </DrillPopover>
          </div>

          {/* 6 — which truck is eating the budget. */}
          <div className="relative">
            <LiveMetricTile
              label="Cost Per Asset"
              value={money(topAsset?.spend)}
              hint={topAsset?.label ?? "No job on record"}
              tone="purple"
              icon={ClipboardList}
              hasDrill
              onClick={() => drill.toggle("eng-assets")}
              valueClass="text-[24px]"
            />
            <DrillPopover
              open={drill.isOpen("eng-assets")}
              onClose={drill.close}
              title="Repair Spend Per Truck"
              width={380}
              footer={<span>All-time workshop spend, worst first</span>}
            >
              {!eng || eng.costPerAsset.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No work order has been raised yet.</p>
              ) : (
                eng.costPerAsset.map((asset) => (
                  <DrillRow
                    key={asset.label}
                    title={asset.label}
                    meta={countLabel(asset.jobs, "job")}
                    right={
                      <span className="shrink-0 text-[11px] font-semibold text-white">
                        {formatMoney(asset.spend)}
                      </span>
                    }
                  />
                ))
              )}
            </DrillPopover>
          </div>

          {/* 7 — the faults that keep coming back. */}
          <div className="relative">
            <LiveMetricTile
              label="Frequent Defects"
              value={topDefect?.count ?? "—"}
              hint={topDefect?.label ?? "No job on record"}
              tone="grey"
              icon={CircleAlert}
              hasDrill
              onClick={() => drill.toggle("eng-defects")}
            />
            <DrillPopover
              open={drill.isOpen("eng-defects")}
              onClose={drill.close}
              title="Most Frequent Defects"
              width={340}
              footer={<span>Every job on file, by fault category</span>}
            >
              {!eng || eng.defects.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No work order has been raised yet.</p>
              ) : (
                eng.defects.map((defect) => (
                  <DrillRow
                    key={defect.label}
                    title={defect.label}
                    right={
                      <span className="shrink-0 text-[11px] font-semibold text-white">
                        {countLabel(defect.count, "job")}
                      </span>
                    }
                  />
                ))
              )}
            </DrillPopover>
          </div>

          {/* 8 — who the workshop is least quick with. */}
          <div className="relative">
            <LiveMetricTile
              label="Mechanic Efficiency"
              value={topMechanic?.avgDays === null || topMechanic?.avgDays === undefined ? "—" : `${topMechanic.avgDays}d`}
              hint={topMechanic?.mechanic ?? "No finished job yet"}
              tone="teal"
              icon={Users}
              hasDrill
              onClick={() => drill.toggle("eng-mechanics")}
            />
            <DrillPopover
              open={drill.isOpen("eng-mechanics")}
              onClose={drill.close}
              title="Mechanic Efficiency"
              width={360}
              footer={<span>Average days from job start to close, quickest first</span>}
            >
              {!eng || eng.turnaround.byMechanic.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  No job has both a start and a completion stamp yet.
                </p>
              ) : (
                eng.turnaround.byMechanic.map((row) => (
                  <DrillRow
                    key={row.mechanic}
                    title={row.mechanic}
                    meta={countLabel(row.jobs, "job")}
                    right={
                      <span className="shrink-0 text-[11px] font-semibold text-white">
                        {row.avgDays === null ? "—" : `${row.avgDays}d avg`}
                      </span>
                    }
                  />
                ))
              )}
            </DrillPopover>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- Security oversight */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={ShieldCheck}
          title="Gate Security (Yard & Movement Oversight)"
          subtitle="What is physically in the yard, what the gate was released but never logged out, which trucks are past their expected return and how long a trip really took · Security logs the gate, the Transport Manager audits it"
        >
          <PeriodNote>{range.note}</PeriodNote>
          <AuditButton onClick={() => setAudit("security")} />
        </SectionHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1 — the digital roster, told by the gate. */}
          <div className="relative">
            <LiveMetricTile
              label="Trucks In Yard"
              value={sec?.yard.inYard ?? "—"}
              hint={`of ${sec?.yard.totalHeads ?? "—"} heads`}
              tone="green"
              icon={ShieldCheck}
              hasDrill
              onClick={() => drill.toggle("sec-yard")}
              split={{
                aLabel: "In Yard",
                aValue: sec?.yard.inYard ?? "—",
                bLabel: "Out of Yard",
                bValue: sec?.yard.out ?? "—",
              }}
            />
            <DrillPopover
              open={drill.isOpen("sec-yard")}
              onClose={drill.close}
              title={`Out of the Yard (${sec?.yard.out ?? 0})`}
              width={380}
              footer={
                <span>
                  {sec?.yard.inYard ?? 0} in the yard · {sec?.yard.out ?? 0} out ·{" "}
                  {sec?.yard.totalHeads ?? 0} heads on record
                </span>
              }
            >
              <p className="pb-2 text-[10px] leading-4 text-white/50">
                A truck is out because the gate logged it out and has not logged it back in — not
                because a status field says so.
              </p>
              {!sec || sec.yard.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">Every truck is inside the yard.</p>
              ) : (
                sec.yard.list.map((t) => gateTripRow(t, "OUT"))
              )}
            </DrillPopover>
          </div>

          {/* 2 — the internal bottleneck the gate exposes. */}
          <div className="relative">
            <LiveMetricTile
              label="Pending Exits"
              value={sec?.pendingExits.count ?? "—"}
              hint={
                sec?.pendingExits.longestHours === null || sec?.pendingExits.longestHours === undefined
                  ? "The gate is clear"
                  : `Longest wait ${formatDuration(sec.pendingExits.longestHours)}`
              }
              tone={exitTone}
              icon={Clock}
              hasDrill
              onClick={() => drill.toggle("sec-exits")}
            />
            <DrillPopover
              open={drill.isOpen("sec-exits")}
              onClose={drill.close}
              title={`Released, Not Yet Logged Out (${sec?.pendingExits.count ?? 0})`}
              width={380}
              footer={<span>Waiting is measured from the Transport Manager's release</span>}
            >
              {!sec || sec.pendingExits.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  Every released dispatch has been logged out.
                </p>
              ) : (
                sec.pendingExits.list.map((t) => gateTripRow(t, "WAITING"))
              )}
            </DrillPopover>
          </div>

          {/* 3 — what is still out. */}
          <div className="relative">
            <LiveMetricTile
              label="Expected Returns"
              value={sec?.awaitingReturn.expectedKnown ?? "—"}
              hint={`of ${sec?.awaitingReturn.count ?? 0} trucks out`}
              tone="purple"
              icon={Navigation}
              hasDrill
              onClick={() => drill.toggle("sec-return")}
            />
            <DrillPopover
              open={drill.isOpen("sec-return")}
              onClose={drill.close}
              title={`Trucks Out of the Yard (${sec?.awaitingReturn.count ?? 0})`}
              width={400}
              footer={<span>Expected return = gate departure + the turnaround set at approval</span>}
            >
              <p className="pb-2 text-[10px] leading-4 text-white/50">
                Without a turnaround on the ticket there is no expectation to miss — that is why the
                overdue count can be zero while dozens of trucks are away.
              </p>
              {!sec || sec.awaitingReturn.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">No truck is out of the yard.</p>
              ) : (
                sec.awaitingReturn.list.map((t) =>
                  gateTripRow(t, t.overdueHours !== null ? "OVERDUE" : "OUT"),
                )
              )}
            </DrillPopover>
          </div>

          {/* 4 — the red flags. */}
          <div className="relative">
            <LiveMetricTile
              label="Overdue Trips"
              value={sec?.overdue.count ?? "—"}
              hint="Past expected return"
              tone="red"
              icon={CircleAlert}
              hasDrill
              onClick={() => drill.toggle("sec-overdue")}
            />
            <DrillPopover
              open={drill.isOpen("sec-overdue")}
              onClose={drill.close}
              title={`Overdue Trips (${sec?.overdue.count ?? 0})`}
              width={400}
            >
              <p className="pb-2 text-[10px] leading-4 text-white/50">
                Only dispatches with a turnaround set at approval can go overdue — without one there
                is no expectation to miss.
              </p>
              {!sec || sec.overdue.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  Nothing is past its expected return.
                </p>
              ) : (
                sec.overdue.list.map((t) => gateTripRow(t, "OVERDUE"))
              )}
            </DrillPopover>
          </div>

          {/* 5 — the gate's own measure of a trip. */}
          <div className="relative">
            <LiveMetricTile
              label="Avg Gate Turnaround"
              value={formatDuration(sec?.tat.avgHours)}
              hint={countLabel(sec?.tat.measured ?? 0, "trip") + " measured"}
              tone="blue"
              icon={Clock}
              hasDrill
              onClick={() => drill.toggle("sec-tat")}
            />
            <DrillPopover
              open={drill.isOpen("sec-tat")}
              onClose={drill.close}
              title="Gate-to-Gate Turnaround"
              width={400}
              footer={
                <span>
                  Median {formatDuration(sec?.tat.medianHours)} · longest{" "}
                  {formatDuration(sec?.tat.longestHours)}
                </span>
              }
            >
              <p className="pb-2 text-[10px] leading-4 text-white/50">
                From Security's Log Out stamp to its Log In stamp — the true duration of the trip,
                independent of what the driver reports.
              </p>
              {!sec || sec.tat.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  No trip has both a gate departure and a gate return in this window.
                </p>
              ) : (
                sec.tat.list.map((t) => (
                  <DrillRow
                    key={`${t.id}-tat`}
                    title={`${t.label} • ${t.truck}`}
                    meta={`${t.partner} · out ${gateStamp(t.departedAt, "—")} → back ${gateStamp(
                      t.returnedAt,
                      "—",
                    )}`}
                    right={
                      <span className="shrink-0 text-[11px] font-semibold text-white">
                        {formatDuration(t.hoursOut)}
                      </span>
                    }
                  />
                ))
              )}
            </DrillPopover>
          </div>

          {/* 6 — the ledger for the window. */}
          <div className="relative">
            <LiveMetricTile
              label="Gate Movements"
              value={sec?.movements.departures ?? "—"}
              hint={`${sec?.movements.returns ?? 0} returns`}
              tone="grey"
              icon={MapPinned}
              hasDrill
              onClick={() => drill.toggle("sec-movements")}
              detail={
                <TileDetailRows
                  rows={[
                    { label: "Logged out:", value: sec?.movements.departures ?? "—", tone: "purple" },
                    { label: "Logged in:", value: sec?.movements.returns ?? "—", tone: "green" },
                  ]}
                />
              }
            />
            <DrillPopover
              open={drill.isOpen("sec-movements")}
              onClose={drill.close}
              title={`Movements Logged · ${range.prefix}`}
              width={380}
              footer={
                <span>
                  {sec?.movements.departures ?? 0} out · {sec?.movements.returns ?? 0} in ·{" "}
                  {longestTrip ? `longest ${formatDuration(longestTrip.hoursOut)}` : "no measured trip"}
                </span>
              }
            >
              {!sec || sec.movements.list.length === 0 ? (
                <p className="py-3 text-[12px] text-white/60">
                  The gate logged no movement in this window.
                </p>
              ) : (
                sec.movements.list.map((t) =>
                  gateTripRow(t, t.returnedAt ? "RETURNED" : "DEPARTED"),
                )
              )}
            </DrillPopover>
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
                  { label: "Longest Downtime", value: formatDuration(eng.downtime.longestDays * 24) },
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
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {eng.turnaround.byMechanic.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[15px] font-semibold text-[#1B2432]">Mechanic Efficiency</h3>
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
