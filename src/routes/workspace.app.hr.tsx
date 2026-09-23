import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ChevronLeft, ChevronRight, Download, Pencil, Search, Upload, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RecordDetailsModal } from "@/components/fleetopsx/record-details-modal";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import { dutyStatusForWrite } from "@/lib/fleetopsx/hr-helpers";
import { formatLicenseDate, licenseExpiry, licenseToneClass } from "@/lib/fleetopsx/license";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import { staleDutyStatus } from "@/lib/fleetopsx/driver-duty";
import { HR_ACCESS_ROLES, rolesCanMaintainStaff } from "@/lib/fleetopsx/hr-helpers";
import type { Driver, DriverStatus, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/hr")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "HR", "Platform Admin", "Fleet Operations"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: HrStaffDirectory,
});

// Rows per page — the shared portal setting (lib/fleetopsx/pagination).

const DRIVER_STATUS_FILTERS = ["All", "Available", "On Trip", "Off Duty", "Suspended"] as const;

/**
 * Who maintains the staff record, and who may only read it.
 *
 * The rule lives in ONE place (lib/fleetopsx/hr-helpers.ts) and is imported here,
 * because this file and Licence & Compliance each used to carry their own copy of
 * the same role list — which is how one page keeps a control the other drops.
 */

/**
 * Every field HR can write on a staff record.
 *
 * These are exactly the columns the live Driver row holds (the API whitelists
 * the same list), so each one genuinely saves — the roster carries no department,
 * date-joined or experience columns, and inventing inputs for them would only
 * produce edits that silently vanish on reload.
 */
type StaffDraft = {
  staffId: string;
  name: string;
  phone: string;
  /** Licence class — "Professional", "Heavy Duty"… stored on the record as `category`. */
  licenseCategory: string;
  /** The truck normally paired with this driver: head (cap/plate) and tail. */
  truckReg: string;
  truckReg2: string;
  status: DriverStatus;
  licenseNumber: string;
  licenseExpiry: string;
};

const emptyStaffDraft = (): StaffDraft => ({
  staffId: "",
  name: "",
  phone: "",
  licenseCategory: "",
  truckReg: "",
  truckReg2: "",
  status: "Available",
  licenseNumber: "",
  licenseExpiry: "",
});

/** Label + control + optional hint — one shape for every field in both dialogs. */
function StaffField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
        {label}
        {required ? <span className="text-[#ED351D]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-[#5C6470]">{hint}</span> : null}
    </label>
  );
}

const staffInputClass =
  "h-10 rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";
const staffSelectClass = `${staffInputClass} bg-white`;

/**
 * Minimal RFC-4180 reader for the bulk-onboard sheet: quoted fields, embedded
 * commas, embedded newlines and CRLF — so a staff name containing a comma does
 * not silently split the row and drop half a record.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function statusPillClass(status: DriverStatus) {
  switch (status) {
    case "Available":
      return "bg-[#34C759] text-white";
    case "On Trip":
      return "bg-[#F99E1F] text-white";
    case "Off Duty":
      return "bg-[#627084] text-white";
    case "Suspended":
      return "bg-[#ED351D] text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Licence state for a driver row — one shape for the table cell and the phone card. */
const licenseState = (driver: Driver) => licenseExpiry(driver.licenseExpiry);

function HrStaffDirectory() {
  const navigate = useNavigate();
  // Decided after mount: the session lives in localStorage, so the server render
  // cannot know the role, and a first-paint guess would hydrate mismatched.
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    // beforeLoad cannot see the session on a hard page load (it runs server-side),
    // so the role is re-checked in the browser as well.
    const roles = authService.getRoles();
    setCanEdit(rolesCanMaintainStaff());
    if (!roles.some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
    }
  }, [navigate]);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  /** Every dispatch — read only to tell a stale duty word from a real one. */
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriverStatus | "All">("All");
  const [page, setPage] = useState(0);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [newStaff, setNewStaff] = useState<StaffDraft>(() => emptyStaffDraft());
  const [idEdit, setIdEdit] = useState<{ driver: Driver; draft: StaffDraft } | null>(null);
  /** Which row's 3-dots is open, and which record the read-only dialog shows. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [details, setDetails] = useState<Driver | null>(null);

  /**
   * The read-only staff record the Transport Manager opens from his row menu.
   *
   * The glimpse boards used to print a grey "View only" where the 3-dots should
   * be: he could see the row but could not open the record — no licence date, no
   * phone, no truck pairing, nothing to read before he asks HR about it. These
   * are the same fields HR edits, in the same words, with nothing to type in.
   */
  const staffFacts = (driver: Driver) => {
    const licence = licenseState(driver);
    return [
      { label: "Staff ID", value: displayDriverSalary(driver) || driver.employeeId || "—" },
      { label: "Name", value: driver.name || "—" },
      { label: "Phone", value: driver.phone || "—" },
      { label: "Duty status", value: driver.status },
      { label: "Licence number", value: driver.licenseNumber || "—" },
      { label: "Licence class", value: driver.licenseCategory || "—" },
      {
        label: "Licence expiry",
        value: <span className={licenseToneClass(licence.tone)}>{licence.text}</span>,
      },
      { label: "Assigned truck head", value: driver.assignedTruck || "—" },
      { label: "Assigned truck tail", value: driver.assignedTail || "—" },
      {
        label: "Date joined",
        value: driver.dateJoined ? formatDateLines(driver.dateJoined).date : "—",
      },
    ];
  };

  /** Highest numeric part of existing P#### IDs — used to suggest the next free Driver ID. */
  const nextStaffId = () => {
    let max = 0;
    for (const d of drivers) {
      const m = /(\d+)\s*$/.exec((displayDriverSalary(d) || d.employeeId || "").trim());
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `P${String(max + 1).padStart(4, "0")}`;
  };

  const refreshDrivers = async () => {
    /*
     * The roster AND the dispatch list: the duty status alone cannot say whether
     * a driver is really on the road, and that mismatch is what makes a free
     * driver look unavailable to the fleet desk (lib/fleetopsx/driver-duty.ts).
     */
    const [list, live] = await Promise.all([
      driverService.list(),
      tripService.list().catch(() => [] as Trip[]),
    ]);
    setDrivers(list);
    setTrips(live);
  };

  useEffect(() => {
    void refreshDrivers()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load staff directory"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (statusFilter !== "All" && d.status !== statusFilter) return false;
      const salary = displayDriverSalary(d);
      // The licence date is searchable too ("2027", "Mar 2027") so the expiry can
      // be found without knowing whose licence it is; so are the truck pairing
      // and licence class, which HR now records here.
      const hay =
        `${salary} ${d.employeeId} ${d.name} ${d.phone} ${d.licenseNumber} ${d.licenseCategory} ${d.licenseExpiry} ${formatLicenseDate(d.licenseExpiry)} ${d.assignedTruck ?? ""} ${d.assignedTail ?? ""} ${d.status}`.toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    });
  }, [drivers, query, statusFilter]);

  /**
   * The headcount the department is asked about, counted from the records on
   * screen: how many can be put on a truck today, and how many licences need
   * attention before they can.
   */
  const summary = useMemo(() => {
    const by = (s: DriverStatus) => drivers.filter((d) => d.status === s).length;
    let expiring = 0;
    let expired = 0;
    let notRecorded = 0;
    for (const d of drivers) {
      const state = licenseExpiry(d.licenseExpiry);
      if (state.tone === "expired") expired += 1;
      else if (state.tone === "soon") expiring += 1;
      // A licence with no date on file is its own count. Rolling it in with
      // "expiring" would report the whole roster as about to lapse.
      else if (state.tone === "missing") notRecorded += 1;
    }
    return {
      total: drivers.length,
      available: by("Available"),
      onTrip: by("On Trip"),
      offDuty: by("Off Duty"),
      suspended: by("Suspended"),
      expiring,
      expired,
      notRecorded,
    };
  }, [drivers]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const handleAddStaff = async () => {
    const staffId = newStaff.staffId.trim().toUpperCase();
    if (!newStaff.name.trim() || !newStaff.phone.trim()) {
      toast.error("Name and Phone are required.");
      return;
    }
    if (!staffId) {
      toast.error("Driver ID is required (e.g. P0123).");
      return;
    }
    try {
      // Every field on the form is a live Driver column, so nothing typed here is
      // quietly dropped. Blank optional fields are omitted rather than written as
      // empty strings — a new record should read "not recorded", not "cleared".
      await driverService.create({
        name: newStaff.name.trim(),
        phone: newStaff.phone.trim(),
        staffId,
        status: dutyStatusForWrite(newStaff.status),
        licenseNumber: newStaff.licenseNumber.trim(),
        licenseExpiry: newStaff.licenseExpiry.trim(),
        category: newStaff.licenseCategory.trim(),
        truckReg: newStaff.truckReg.trim(),
        truckReg2: newStaff.truckReg2.trim(),
      } as never);
      toast.success(`${newStaff.name.trim()} onboarded as ${staffId}.`);
      setIsAddOpen(false);
      setNewStaff(emptyStaffDraft());
      await refreshDrivers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add staff";
      toast.error(/unique|409/i.test(msg) ? `Driver ID ${staffId} is already assigned to another driver.` : msg);
    }
  };

  /** Open the pre-filled staff editor for an existing driver — every writable field. */
  const openEdit = (driver: Driver) =>
    setIdEdit({
      driver,
      draft: {
        staffId: displayDriverSalary(driver) || driver.employeeId || "",
        name: driver.name,
        phone: driver.phone ?? "",
        licenseCategory: driver.licenseCategory ?? "",
        truckReg: driver.assignedTruck ?? "",
        truckReg2: driver.assignedTail ?? "",
        status: driver.status,
        licenseNumber: driver.licenseNumber ?? "",
        // <input type="date"> needs yyyy-mm-dd; the API may return a full stamp.
        licenseExpiry: (driver.licenseExpiry ?? "").slice(0, 10),
      },
    });

  /**
   * Save corrections to an existing staff record: ID, name, phone, status, the
   * licence itself (number, class, expiry) and the truck the driver is paired
   * with. These are exactly the columns the API whitelists on PATCH, so HR can
   * fix a misspelt name, a wrong phone or a renewed licence without deleting and
   * re-onboarding.
   */
  const handleSaveEdits = async () => {
    if (!idEdit) return;
    const { draft } = idEdit;
    const staffId = draft.staffId.trim().toUpperCase();
    const name = draft.name.trim();
    if (!name) {
      toast.error("Name is required.");
      return;
    }
    if (!staffId) {
      toast.error("Enter a Driver ID (e.g. P0123).");
      return;
    }
    if (!draft.phone.trim()) {
      toast.error("Phone is required — it is the number dispatchers and the tracking desk call.");
      return;
    }
    try {
      // Only live Driver columns — the API whitelists exactly these on PATCH.
      // Anything HR empties is sent as "" (never left out, which would silently
      // keep the old value) so a licence that was reassigned or a truck that was
      // handed back can actually be cleared.
      await driverService.update(idEdit.driver.id, {
        staffId,
        name,
        phone: draft.phone.trim(),
        status: dutyStatusForWrite(draft.status),
        licenseNumber: draft.licenseNumber.trim(),
        licenseExpiry: draft.licenseExpiry.trim(),
        category: draft.licenseCategory.trim(),
        truckReg: draft.truckReg.trim(),
        truckReg2: draft.truckReg2.trim(),
      } as never);
      toast.success(`${name} updated.`);
      setIdEdit(null);
      await refreshDrivers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save staff details";
      toast.error(/unique|409/i.test(msg) ? "That Driver ID is already assigned to another driver." : msg);
    }
  };

  /**
   * Bulk onboard from a CSV — the roster arrives as a spreadsheet, so retyping
   * 100 drivers one dialog at a time is not an option.
   *
   * Same columns as the export (plus the two HR now records), read by header name
   * so the order does not matter and a sheet missing a column still imports what
   * it has. Each row is created on its own: one bad row never costs the good
   * ones, and the toast names what failed.
   */
  const importCSV = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("That file has no rows. Expected a header row and one line per staff member.");
      return;
    }
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => {
      for (const name of names) {
        const i = header.indexOf(name);
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = {
      name: col("name", "staff name", "full name"),
      phone: col("phone", "phone number", "staff phone number"),
      staffId: col("staff id", "staff no", "staff no.", "driver id", "id"),
      licence: col("license number", "licence number"),
      licenceClass: col("license class", "licence class", "category"),
      expiry: col("license expiry", "licence expiry", "expiry"),
      head: col("truck head", "assigned truck", "truck", "cap number"),
      tail: col("truck tail", "assigned tail", "tail"),
      status: col("status"),
    };
    if (idx.name < 0) {
      toast.error("No Name column found — the first row must name its columns.");
      return;
    }
    const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    const valid: DriverStatus[] = ["Available", "On Trip", "Off Duty", "Suspended"];
    let created = 0;
    const failed: string[] = [];
    for (const row of rows.slice(1)) {
      if (row.every((c) => !c.trim())) continue;
      const name = at(row, idx.name);
      if (!name) continue;
      const statusRaw = at(row, idx.status);
      // A blank or unknown Status column onboards the driver ready to work —
      // which the column stores as "Active" (see dutyStatusForWrite).
      const status = dutyStatusForWrite(
        (valid as string[]).includes(statusRaw) ? (statusRaw as DriverStatus) : "Available",
      );
      try {
        await driverService.create({
          name,
          phone: at(row, idx.phone),
          staffId: at(row, idx.staffId).toUpperCase(),
          status,
          licenseNumber: at(row, idx.licence),
          licenseExpiry: at(row, idx.expiry),
          category: at(row, idx.licenceClass),
          truckReg: at(row, idx.head),
          truckReg2: at(row, idx.tail),
        } as never);
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "failed";
        failed.push(`${name}: ${/unique|409/i.test(msg) ? "that Staff ID is already taken" : msg}`);
      }
    }
    await refreshDrivers();
    if (failed.length === 0) {
      toast.success(`${created} staff member${created === 1 ? "" : "s"} onboarded.`);
    } else {
      // Loud partial failure: what landed, and exactly which rows did not.
      toast.error(`${created} onboarded, ${failed.length} failed.`, {
        description: failed.slice(0, 4).join(" · "),
      });
    }
  };

  const exportCSV = () => {
    // Same order as the table — the Staff ID closes the row — with the two fields
    // HR now records exposed for payroll and maintenance reports.
    const headers =
      "Name,Phone,License Number,License Class,License Expiry,Truck Head,Truck Tail,Status,Staff ID\n";
    const csv = filtered
      .map(
        (d) =>
          `${d.name},${d.phone},${d.licenseNumber},${d.licenseCategory},${d.licenseExpiry ? formatLicenseDate(d.licenseExpiry) : ""},${d.assignedTruck ?? ""},${d.assignedTail ?? ""},${d.status},${displayDriverSalary(d) || d.employeeId}`,
      )
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff_directory.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  return (
    <>
      <DepartmentTabs department="hr" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Staff Records</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              manage staff records and license status
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — HR &amp; Personnel maintains these records
              </span>
            )}
          </div>
          <div className={cn("flex items-center gap-2", !canEdit && "hidden")}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-8 items-center gap-1.5 px-[7px] text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
            >
              <Upload className="size-[18px]" strokeWidth={1.75} />
              Import CSV
            </button>
            {/* Bulk onboard — export first, fill it in, load it back. Columns are
                matched by header name, so the order does not matter. */}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importCSV(file);
                // Reset so choosing the same file twice still fires a change.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                setNewStaff((s) => ({ ...s, staffId: s.staffId || nextStaffId() }));
                setIsAddOpen(true);
              }}
              className="flex h-8 items-center gap-1.5 rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              <UserPlus className="size-4" />
              Onboard New Staff
            </button>
          </div>
        </div>

        {/* The headcount the department is asked for, before any filtering: how
            many drivers can be put on a truck today and how many licences need
            attention first. Counted from the roster itself, never a guess. */}
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Total Staff", value: summary.total, tone: "text-[#1B2432]" },
            { label: "Available", value: summary.available, tone: "text-[#0A8F4D]" },
            { label: "On Trip", value: summary.onTrip, tone: "text-[#B26A00]" },
            { label: "Off Duty", value: summary.offDuty, tone: "text-[#5C6470]" },
            { label: "Suspended", value: summary.suspended, tone: "text-[#ED351D]" },
            { label: "Licence Expiring", value: summary.expiring, tone: "text-[#B26A00]" },
            { label: "Licence Expired", value: summary.expired, tone: "text-[#ED351D]" },
            { label: "No Expiry On File", value: summary.notRecorded, tone: "text-[#B26A00]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex min-w-[130px] flex-1 flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                {stat.label}
              </span>
              <span className={cn("text-[22px] font-semibold leading-7", stat.tone)}>{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
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
            <FilterButton
              options={DRIVER_STATUS_FILTERS}
              value={statusFilter}
              onChange={(s) => {
                setStatusFilter(s);
                setPage(0);
              }}
              allLabel="All Statuses"
            />
          </div>

          <div className="hidden grid-cols-[180px_140px_140px_1fr_110px_120px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px] md:grid">
            {["Name", "Phone", "License", "Assigned Truck", "Status", "Staff ID"].map((h) => (
              <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
          </div>

          {slice.map((driver, index) => {
            const staffId = displayDriverSalary(driver) || driver.employeeId || "—";
            const sn = currentPage * PAGE_SIZE + index + 1;
            const licence = licenseState(driver);
            return (
              <div key={driver.id}>
                <div className="mb-3 flex flex-col gap-2 rounded-[6px] border border-[#E2E5E9] bg-white px-3.5 py-2.5 md:hidden">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-semibold text-[#5C6470]">#{sn}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">{driver.name}</p>
                    {driver.status === "Suspended" && (
                      <span className="inline-flex h-[18px] items-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-2.5 text-[10px] font-medium text-white">
                        Suspended
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 text-[12px]">
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Phone:</span>
                      <span className="flex-1 text-[#344256]">{driver.phone || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">License:</span>
                      <span className="flex-1 text-[#344256]">{driver.licenseNumber || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Expires:</span>
                      <span className={cn("flex-1", licenseToneClass(licence.tone))}>{licence.text}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Truck:</span>
                      <span className="flex-1 text-[#344256]">{driver.assignedTruck || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Tail:</span>
                      <span className="flex-1 text-[#344256]">{driver.assignedTail || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Class:</span>
                      <span className="flex-1 text-[#344256]">{driver.licenseCategory || "—"}</span>
                    </div>
                  </div>
                  {driver.status !== "Suspended" && (
                    <span className={cn("mt-1 inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium", statusPillClass(driver.status))}>
                      {driver.status}
                    </span>
                  )}
                  {/* The ID closes the card, exactly like the table's last column. */}
                  <div className="flex gap-2 text-[12px]">
                    <span className="w-20 font-medium text-[#5C6470]">Staff ID:</span>
                    <span className="flex-1 font-semibold text-[#ED351D]">ID:{staffId}</span>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openEdit(driver)}
                      className="mt-1 inline-flex h-[22px] w-fit items-center rounded border border-[#E2E5E9] px-2.5 text-[10px] font-medium text-[#1B2432]"
                    >
                      {staffId === "—" ? "Add Driver ID" : "Edit Staff Details"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDetails(driver)}
                      className="mt-1 inline-flex h-[22px] w-fit items-center rounded border border-[#E2E5E9] px-2.5 text-[10px] font-medium text-[#1B2432]"
                    >
                      View Staff Details
                    </button>
                  )}
                </div>

                <div className="hidden grid-cols-[180px_140px_140px_1fr_110px_120px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5 md:grid">
                  <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{driver.name}</span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{driver.phone}</span>
                  {/* Licence number over its expiry date — the column he reads to
                      know whether a driver can still be put on a truck. */}
                  <span className="flex flex-col gap-0.5 text-[14px] tracking-[0.4px]">
                    {driver.licenseNumber ? (
                      <span className="text-[#5C6470]">{driver.licenseNumber}</span>
                    ) : (
                      <span className="text-[#5C6470]">—</span>
                    )}
                    {(driver.licenseNumber || driver.licenseExpiry) && (
                      <span
                        className={cn("text-[11px] leading-none", licenseToneClass(licence.tone))}
                        title={
                          licence.days !== null && licence.days >= 0
                            ? `${licence.days} day(s) left on this licence`
                            : undefined
                        }
                      >
                        {licence.text}
                      </span>
                    )}
                  </span>
                  {/* Head over tail — the pairing HR records and dispatch reads. */}
                  <span className="flex flex-col gap-0.5 text-[14px] tracking-[0.4px]">
                    <span className="text-[#5C6470]">{driver.assignedTruck || "—"}</span>
                    {driver.assignedTail ? (
                      <span className="text-[11px] leading-none text-[#5C6470]">
                        Tail: {driver.assignedTail}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col items-start gap-0.5">
                    <span className={cn("inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium", statusPillClass(driver.status))}>
                      {driver.status}
                    </span>
                    {/* The duty word against the live dispatch list — the row
                        HR has to correct so the fleet desk can use him. */}
                    {staleDutyStatus(driver, trips) === "should-be-free" ? (
                      <span className="text-[11px] leading-none text-[#B26A00]">No live dispatch</span>
                    ) : null}
                    {staleDutyStatus(driver, trips) === "should-be-on-trip" ? (
                      <span className="text-[11px] leading-none text-[#B26A00]">On a live dispatch</span>
                    ) : null}
                  </span>
                  {/* The ID closes the row — the reference you quote once the
                      driver you were looking for is found. */}
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{staffId}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openEdit(driver)}
                      className="grid size-7 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
                      aria-label={`Edit staff details for ${driver.name}`}
                      title={staffId === "—" ? "Add Driver ID" : "Edit staff details"}
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : (
                    <RowActionMenu
                      items={[{ label: "View staff details", onSelect: () => setDetails(driver) }]}
                      open={menuFor === driver.id}
                      onOpenChange={(open) => setMenuFor(open ? driver.id : null)}
                      label={`Details for ${driver.name}`}
                      width={190}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching staff" : "No staff records yet"}
              body={query ? "Try a different name, staff ID, or phone number." : "Staff and driver records will appear here."}
            />
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to}
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">of {filtered.length}</span>
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
                  Export CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <RecordDetailsModal
        open={details !== null}
        onClose={() => setDetails(null)}
        title={details?.name || "Staff record"}
        subtitle="Staff record · read only"
        badge={
          details ? (
            <span
              className={cn(
                "inline-flex h-[22px] items-center rounded px-2.5 text-[10px] font-medium",
                statusPillClass(details.status),
              )}
            >
              {details.status}
            </span>
          ) : null
        }
        facts={details ? staffFacts(details) : []}
        note="Read-only view — HR & Personnel maintains this record. Ask them to change a licence, a phone number or the truck pairing."
      />

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[406px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Onboard New Staff</h3>
            </div>
            <StaffField label="Name" required>
              <input
                value={newStaff.name}
                onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                className={staffInputClass}
              />
            </StaffField>
            <StaffField
              label="Driver ID"
              required
              hint="Shown on dispatches, security logs and the driver roster. Pre-filled with the next free ID."
            >
              <input
                value={newStaff.staffId}
                onChange={(e) => setNewStaff({ ...newStaff, staffId: e.target.value })}
                placeholder="example: P0123"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Phone" required hint="Dispatchers and the tracking desk call this number.">
              <input
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                placeholder="example: 08031234567"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="License Number">
              <input
                value={newStaff.licenseNumber}
                onChange={(e) => setNewStaff({ ...newStaff, licenseNumber: e.target.value })}
                placeholder="example: ABC-123456"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="License Class">
              <input
                value={newStaff.licenseCategory}
                onChange={(e) => setNewStaff({ ...newStaff, licenseCategory: e.target.value })}
                placeholder="example: Professional"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField
              label="License Expiry"
              hint="Staff Records flags the licence amber 60 days before this date, and red once it passes."
            >
              <input
                type="date"
                value={newStaff.licenseExpiry}
                onChange={(e) => setNewStaff({ ...newStaff, licenseExpiry: e.target.value })}
                className={staffInputClass}
              />
            </StaffField>
            <StaffField
              label="Assigned Truck Head"
              hint="The truck this driver normally drives — cap number or plate. Dispatch can still put them on another."
            >
              <input
                value={newStaff.truckReg}
                onChange={(e) => setNewStaff({ ...newStaff, truckReg: e.target.value })}
                placeholder="example: P073 or GGE98YK"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Assigned Truck Tail" hint="The tail normally paired with that head.">
              <input
                value={newStaff.truckReg2}
                onChange={(e) => setNewStaff({ ...newStaff, truckReg2: e.target.value })}
                placeholder="example: B056"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Status" hint="Available means they can be put on a dispatch today.">
              <select
                value={newStaff.status}
                onChange={(e) => setNewStaff({ ...newStaff, status: e.target.value as DriverStatus })}
                className={staffSelectClass}
              >
                {DRIVER_STATUS_FILTERS.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </StaffField>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">
                Go Back
              </button>
              <button
                type="button"
                onClick={() => void handleAddStaff()}
                className="flex h-8 items-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[12px] tracking-[0.4px] text-white"
              >
                Onboard New Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {idEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[406px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Edit Staff Details</h3>
            </div>
            <StaffField
              label="Driver ID"
              required
              hint="This ID becomes the driver's identity across dispatch, security log and roster. It must be unique."
            >
              <input
                autoFocus
                value={idEdit.draft.staffId}
                onChange={(e) => setIdEdit({ ...idEdit, draft: { ...idEdit.draft, staffId: e.target.value } })}
                placeholder="example: P0123"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Name" required>
              <input
                value={idEdit.draft.name}
                onChange={(e) => setIdEdit({ ...idEdit, draft: { ...idEdit.draft, name: e.target.value } })}
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Phone" required hint="Dispatchers and the tracking desk call this number.">
              <input
                value={idEdit.draft.phone}
                onChange={(e) => setIdEdit({ ...idEdit, draft: { ...idEdit.draft, phone: e.target.value } })}
                placeholder="example: 08031234567"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="License Number" hint="Leave blank to clear a number that was entered by mistake.">
              <input
                value={idEdit.draft.licenseNumber}
                onChange={(e) => setIdEdit({ ...idEdit, draft: { ...idEdit.draft, licenseNumber: e.target.value } })}
                placeholder="example: ABC-123456"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="License Class">
              <input
                value={idEdit.draft.licenseCategory}
                onChange={(e) =>
                  setIdEdit({ ...idEdit, draft: { ...idEdit.draft, licenseCategory: e.target.value } })
                }
                placeholder="example: Professional"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="License Expiry">
              <input
                type="date"
                value={idEdit.draft.licenseExpiry}
                onChange={(e) =>
                  setIdEdit({ ...idEdit, draft: { ...idEdit.draft, licenseExpiry: e.target.value } })
                }
                className={staffInputClass}
              />
              {idEdit.draft.licenseExpiry && (
                <span
                  className={cn("text-[11px]", licenseToneClass(licenseExpiry(idEdit.draft.licenseExpiry).tone))}
                >
                  {licenseExpiry(idEdit.draft.licenseExpiry).text}
                </span>
              )}
            </StaffField>
            <StaffField label="Assigned Truck Head" hint="Cap number or plate. Blank means no regular truck.">
              <input
                value={idEdit.draft.truckReg}
                onChange={(e) => setIdEdit({ ...idEdit, draft: { ...idEdit.draft, truckReg: e.target.value } })}
                placeholder="example: P073 or GGE98YK"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Assigned Truck Tail">
              <input
                value={idEdit.draft.truckReg2}
                onChange={(e) => setIdEdit({ ...idEdit, draft: { ...idEdit.draft, truckReg2: e.target.value } })}
                placeholder="example: B056"
                className={staffInputClass}
              />
            </StaffField>
            <StaffField label="Status" hint="Set to Suspended and the driver stops being offered for dispatch.">
              <select
                value={idEdit.draft.status}
                onChange={(e) =>
                  setIdEdit({ ...idEdit, draft: { ...idEdit.draft, status: e.target.value as DriverStatus } })
                }
                className={staffSelectClass}
              >
                {DRIVER_STATUS_FILTERS.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </StaffField>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setIdEdit(null)} className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdits()}
                className="flex h-8 items-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[12px] tracking-[0.4px] text-white"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
