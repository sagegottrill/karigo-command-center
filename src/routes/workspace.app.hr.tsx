import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ChevronLeft, ChevronRight, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/fleetopsx/confirm-dialog";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import {
  CustomRangePicker,
  PeriodFilter,
  SummaryBar,
  inWindow,
  resolvePeriod,
  useCustomRange,
} from "@/lib/fleetopsx/report-kit";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  StaffRecordForm,
  draftFromDriver,
  type StaffDraft,
} from "@/components/fleetopsx/hr-staff-form";
import { RecordDetailsModal } from "@/components/fleetopsx/record-details-modal";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import { formatLicenseDate, licenseExpiry, licenseToneClass } from "@/lib/fleetopsx/license";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import {
  driverHasOpenDispatches,
  liveTripsFor,
  releaseConfirmBody,
} from "@/lib/fleetopsx/driver-duty";
import { displayDispatchId } from "@/lib/fleetopsx/request-id";
import {
  HR_ACCESS_ROLES,
  employmentStatusForWrite,
  employmentStatusOf,
  rolesCanMaintainStaff,
  staffStatusLabel,
  type EmploymentStatus,
} from "@/lib/fleetopsx/hr-helpers";
import type { Driver, DriverStatus, Trip } from "@/lib/fleetopsx/types";
import { csvCell } from "@/lib/fleetopsx/csv";
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

/*
 * EMPLOYMENT, "ON LEAVE" AND IN TRANSIT.
 *
 * The board filters the two questions a staff register is asked separately:
 * what the department has decided about the person (Active / On Leave /
 * Suspended), and whether a dispatch has already put him on the road today
 * (In Transit). "On Trip" used to sit in this list as an HR word, which let the
 * register file a man as being on a trip nobody had given him.
 */
const STAFF_STATUS_FILTERS = ["All", "Active", "On Leave", "Suspended"] as const;
type StaffStatusWord = (typeof STAFF_STATUS_FILTERS)[number];

/** The roles whose portal this page is when they open it: see `isManager`. */
const MANAGER_ROLES = ["Transport Manager", "Platform Admin"];

/**
 * Who maintains the staff record, and who may only read it.
 *
 * The rule lives in ONE place (lib/fleetopsx/hr-helpers.ts) and is imported here,
 * because this file and Licence & Compliance each used to carry their own copy of
 * the same role list — which is how one page keeps a control the other drops.
 */

/** The pill for a staff row: green for active, amber for on the road, grey for
 * on leave, red for suspended — the register's four words, and the stored
 * spellings alongside them so a record read straight off the API still paints. */
function statusPillClass(status: DriverStatus | "In Transit" | EmploymentStatus) {
  switch (status) {
    case "Active":
    case "Available":
      return "bg-[#34C759] text-white";
    // One amber for "out on the road", whether the word came from HR or from
    // the dispatch the man is on.
    case "On Trip":
    case "In Transit":
      return "bg-[#F99E1F] text-white";
    case "On Leave":
    case "Off Duty":
      // Amber, as the department draws it — the same tone a licence that needs
      // attention wears, because both are things somebody has to look at.
      return "bg-[#F99E1F] text-white";
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
  /**
   * The Manager reads this register as "HR and Personnel" — his own page in the
   * Transport Manager Portal, with the card's own heading and a row menu that
   * VIEWS, EDITS or DELETES — where the department opens the same rows as
   * "Staff Records" and works the pencil. One page, drawn for whoever is looking
   * at it, because the TM is a second pair of hands on this desk and not a
   * visitor to it.
   */
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    // beforeLoad cannot see the session on a hard page load (it runs server-side),
    // so the role is re-checked in the browser as well.
    const roles = authService.getRoles();
    setCanEdit(rolesCanMaintainStaff());
    setIsManager(roles.some((r: string) => MANAGER_ROLES.includes(r)));
    if (!roles.some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
    }
  }, [navigate]);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  /** Every dispatch — read only to answer the release question on a save. */
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // The three words the register files a person under, and "All".
  const [statusFilter, setStatusFilter] = useState<StaffStatusWord>("All");
  const [page, setPage] = useState(0);
  const [idEdit, setIdEdit] = useState<{ driver: Driver; draft: StaffDraft } | null>(null);
  /** The "close his open dispatch?" question, asked in-app (see handleSaveEdits). */
  const [pendingFree, setPendingFree] = useState<{
    driver: Driver;
    status: EmploymentStatus;
    openDispatches: Trip[];
  } | null>(null);
  /** The record the delete confirmation is holding, and whether it is working. */
  const [deleteFor, setDeleteFor] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      { label: "Department", value: driver.department || "—" },
      { label: "Employment status", value: staffStatusLabel(driver) },
      { label: "Guarantor", value: driver.guarantorName || "—" },
      { label: "Guarantor phone", value: driver.guarantorPhone || "—" },
      { label: "Licence document", value: driver.licenseDocName || "— none on file" },
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
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed to load staff directory"),
      )
      .finally(() => setLoading(false));
  }, []);

  /** The register's own time frame — by the day each hand joined. */
  const [periodFilter, setPeriodFilter] = useState<string>("All time");
  const rangeCustom = useCustomRange();
  const range = useMemo(
    () => resolvePeriod(periodFilter, rangeCustom.custom),
    [periodFilter, rangeCustom.custom],
  );

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      // The column's word decides, so the filter and the pills can never
      // disagree about who is Active, On Leave or Suspended.
      if (statusFilter !== "All" && staffStatusLabel(d) !== statusFilter) return false;
      if (!inWindow(d.dateJoined, range)) return false;
      const salary = displayDriverSalary(d);
      // The licence date is searchable too ("2027", "Mar 2027") so the expiry can
      // be found without knowing whose licence it is; so are the department, the
      // guarantor HR recorded and the truck pairing.
      const hay =
        `${salary} ${d.employeeId} ${d.name} ${d.phone} ${d.department} ${d.guarantorName ?? ""} ${d.guarantorPhone ?? ""} ${d.licenseNumber} ${d.licenseCategory} ${d.licenseExpiry} ${formatLicenseDate(d.licenseExpiry)} ${d.assignedTruck ?? ""} ${d.assignedTail ?? ""} ${staffStatusLabel(d)}`.toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    });
  }, [drivers, query, statusFilter, range]);

  /** The roster's footer: heads on file and the licence clock against them. */
  const staffSummary = (
    <SummaryBar
      items={[
        { label: "Staff", value: String(filtered.length) },
        {
          label: "Active",
          value: String(filtered.filter((d) => staffStatusLabel(d) === "Active").length),
        },
        {
          label: "On leave",
          value: String(filtered.filter((d) => staffStatusLabel(d) === "On Leave").length),
        },
        {
          label: "Licences expiring soon",
          value: String(
            filtered.filter((d) => {
              const state = licenseState(d);
              return state.tone === "soon" || state.tone === "expired";
            }).length,
          ),
        },
      ]}
    />
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  /**
   * Onboarding walks to its own page.
   *
   * The record carries ten fields and a document to attach; the dialog that used
   * to hold it scrolled behind its own footer and lost the field you were on
   * when the roster reloaded. The department draws it as a screen, so it is one.
   */
  const openOnboard = () => navigate({ to: "/workspace/app/hr-onboard" });

  /** Open the pre-filled staff editor for an existing driver — every writable field. */
  const openEdit = (driver: Driver) => setIdEdit({ driver, draft: draftFromDriver(driver) });

  /**
   * Delete a staff record for good, once the confirmation is answered.
   *
   * The licence document and the record go together: the document lives on the
   * row, so removing the row removes it — which is why the confirmation names
   * the person rather than asking about "this record".
   */
  const confirmDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    try {
      await driverService.delete(deleteFor.id);
      toast.success(`${deleteFor.name} removed from the staff register.`);
      setDeleteFor(null);
      setIdEdit(null);
      await refreshDrivers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that staff record.");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Save corrections to an existing staff record: the payroll number, name,
   * phone, department, employment decision, the licence itself (number, expiry,
   * and the document on file), the guarantor and the truck the driver is paired
   * with. These are exactly the columns the API whitelists on PATCH, so HR can
   * fix a misspelt name, a wrong phone or a renewed licence without deleting and
   * re-onboarding.
   */
  const handleSaveEdits = async (forceClose = false) => {
    if (!idEdit) return;
    const { draft } = idEdit;
    const staffId = draft.staffId.trim().toUpperCase();
    const name = draft.name.trim();
    if (!name) {
      toast.error("Full Name is required.");
      return;
    }
    if (!staffId) {
      toast.error("Staff Salary Number is required (eg: SL-00830).");
      return;
    }
    if (!draft.phone.trim()) {
      toast.error(
        "Phone Number is required — it is the number dispatchers and the tracking desk call.",
      );
      return;
    }
    if (!draft.department.trim()) {
      toast.error("Choose the department this staff member belongs to.");
      return;
    }
    /*
     * THE HUMAN DECISION IS THE FACT.
     *
     * Availability is derived from the dispatch list, which is the safe default —
     * but a dispatch nobody closed then holds a man hostage: the record is saved
     * as Active and the fleet desk still refuses to offer him, because a trip
     * from days ago still carries his name. That is what left drivers stranded.
     *
     * So when HR or the Transport Manager files a driver under any employment
     * decision while open dispatches still name him, the dispatches are ended
     * with him — named on screen first, never silently, because a release is a
     * decision someone signed.
     *
     * Note there is no longer a status that skips the question: the form files
     * EMPLOYMENT (Active / On Leave / Suspended), and none of those is the word
     * a dispatch uses, so every save is a decision about the open trips.
     */
    const openDispatches = liveTripsFor(idEdit.driver, trips);
    let closeDispatches = forceClose;
    /*
     * Asked in the app, NOT with window.confirm: a native dialog the browser
     * dismisses returns false, which made this save do nothing at all — the
     * reported "make available from HR does not work".
     *
     * And the question is raised from the SERVER's open-dispatch count, so a
     * trip list that failed to load can no longer turn the release into a
     * silent no-op that leaves the driver committed.
     */
    if (!forceClose && driverHasOpenDispatches(idEdit.driver, trips)) {
      setPendingFree({ driver: idEdit.driver, status: draft.status, openDispatches });
      return;
    }
    if (forceClose) closeDispatches = true;
    try {
      // Only live Driver columns — the API whitelists exactly these on PATCH.
      // Anything HR empties is sent as "" (never left out, which would silently
      // keep the old value) so a licence that was reassigned or a truck that was
      // handed back can actually be cleared.
      await driverService.update(idEdit.driver.id, {
        staffId,
        name,
        phone: draft.phone.trim(),
        department: draft.department.trim(),
        status: employmentStatusForWrite(draft.status),
        licenseNumber: draft.licenseNumber.trim(),
        licenseExpiry: draft.licenseExpiry.trim(),
        category: draft.licenseCategory.trim(),
        truckReg: draft.truckReg.trim(),
        truckReg2: draft.truckReg2.trim(),
        guarantorName: draft.guarantorName.trim(),
        guarantorPhone: draft.guarantorPhone.trim(),
        ...(closeDispatches ? { closeDispatches: true } : {}),
      } as never);

      /*
       * The document travels on its own request, and its failure must not undo
       * the record: a scan that would not upload is a missing attachment, not a
       * lost correction to the man's name and licence date.
       */
      try {
        if (draft.licenceFile) {
          await driverService.attachLicence(
            idEdit.driver.id,
            draft.licenceFile.name,
            draft.licenceFile.dataUrl,
          );
        } else if (draft.removeLicence) {
          await driverService.removeLicence(idEdit.driver.id);
        }
      } catch (err) {
        toast.error(`${name} was saved, but the licence document did not change.`, {
          description: err instanceof Error ? err.message : "Try attaching it again.",
        });
      }

      toast.success(`${name} updated.`);
      setIdEdit(null);
      await refreshDrivers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save staff details";
      toast.error(
        /unique|409/i.test(msg)
          ? "That Staff Salary Number is already assigned to another driver."
          : msg,
      );
    }
  };

  const exportCSV = () => {
    /*
     * The whole staff file, in the register's own words: the payroll number
     * leads so the sheet sorts the way the office files it, the employment
     * decision is written as the department says it (Active / On Leave /
     * Suspended), and the department and guarantor travel with the row so a
     * payroll or surety question can be answered from the export alone.
     *
     * Every field is quoted: a department or a name containing a comma used to
     * split into two columns and shift everything after it. The header names are
     * the ones the importer reads back.
     */
    const headers = [
      "Staff ID",
      "Name",
      "Phone",
      "Department",
      "Employment Status",
      "License Number",
      "License Class",
      "License Expiry",
      "Truck Head",
      "Truck Tail",
      "Guarantor Name",
      "Guarantor Phone Number",
    ];
    const quote = (value: string) => csvCell(value);
    const csv = filtered
      .map((d) =>
        [
          displayDriverSalary(d) || d.employeeId,
          d.name,
          d.phone,
          d.department,
          employmentStatusOf(d),
          d.licenseNumber,
          d.licenseCategory,
          d.licenseExpiry ? formatLicenseDate(d.licenseExpiry) : "",
          d.assignedTruck ?? "",
          d.assignedTail ?? "",
          d.guarantorName ?? "",
          d.guarantorPhone ?? "",
        ]
          .map(quote)
          .join(","),
      )
      .join("\n");
    return `${headers.map(quote).join(",")}\n${csv}`;
  };

  return (
    <>
      <DepartmentTabs department="hr" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        {" "}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            {/* The department's drawn page: one title, one subtitle, and the
                  red button on the same row. The Manager sees the same page —
                  his earlier "HR and Personnel" wording came from a different
                  draw; this set is the register's own. */}
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Staff Records</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              Manage staff records and license status
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — HR &amp; Personnel maintains these records
              </span>
            )}
          </div>
          <div className={cn("flex items-center gap-2", !canEdit && "hidden")}>
            {/*
              ONE button, the way the department draws it. A second "Import CSV"
              control used to sit here for bulk onboarding a spreadsheet; the
              form that files a person is the Onboard New Staff page, and a row
              of staff is filed on it one record at a time.
            */}
            <button
              type="button"
              onClick={openOnboard}
              className="flex h-8 items-center gap-1.5 rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              <UserPlus className="size-4" />
              Onboard New Staff
            </button>
          </div>
        </div>
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-5 border-b border-[#E2E5E9] pb-5">
            {/* The drawn card carries no heading — search and the red filter are
                the whole header row, for every viewer. */}
            <div className="flex items-center gap-5">
              <div className="relative w-full max-w-[400px]">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                  strokeWidth={1.5}
                />
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
              <PeriodFilter
                value={periodFilter}
                onChange={(v) => {
                  setPeriodFilter(v);
                  setPage(0);
                }}
                custom={rangeCustom.custom}
                customOpen={rangeCustom.open}
                onToggleCustom={rangeCustom.setOpen}
              >
                <CustomRangePicker
                  custom={rangeCustom.custom}
                  onSet={rangeCustom.set}
                  onClear={() => {
                    rangeCustom.clear();
                    setPage(0);
                  }}
                />
              </PeriodFilter>
              <FilterButton
                options={STAFF_STATUS_FILTERS}
                value={statusFilter}
                onChange={(s) => {
                  setStatusFilter(s);
                  setPage(0);
                }}
                allLabel="All Statuses"
                iconOnly
              />
            </div>
          </div>

          {/* Salary ID leads, the way HR files a man; the department says which
              side of the business he belongs to. The assigned truck moved off
              this register — it belongs to the fleet board, where it moves. */}
          <div className="hidden grid-cols-[110px_150px_130px_1fr_130px_160px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px] md:grid">
            {["Salary ID", "Staff Name", "Phone No", "Department", "Status", "License No"].map(
              (h) => (
                <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  {h}
                </span>
              ),
            )}
          </div>

          {slice.map((driver, index) => {
            const staffId = displayDriverSalary(driver) || driver.employeeId || "—";
            const sn = currentPage * PAGE_SIZE + index + 1;
            const licence = licenseState(driver);
            // The register's own word for the row: HR's employment decision.
            const statusWord = staffStatusLabel(driver);
            return (
              <div key={driver.id}>
                <div className="mb-3 flex flex-col gap-2 rounded-[6px] border border-[#E2E5E9] bg-white px-3.5 py-2.5 md:hidden">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-semibold text-[#5C6470]">
                      #{sn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">
                      {driver.name}
                    </p>
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
                      <span className={cn("flex-1", licenseToneClass(licence.tone))}>
                        {licence.text}
                      </span>
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
                  {statusWord !== "Suspended" && (
                    <span
                      className={cn(
                        "mt-1 inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                        statusPillClass(statusWord),
                      )}
                    >
                      {statusWord}
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

                <div className="hidden grid-cols-[110px_150px_130px_1fr_130px_160px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5 md:grid">
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                    {staffId}
                  </span>
                  <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                    {driver.name}
                  </span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {driver.phone || "—"}
                  </span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {driver.department || "—"}
                  </span>
                  {/* The register's word for the row, in the column the
                      department files it under — Status, then the licence. */}
                  <span className="flex flex-col items-start gap-0.5">
                    <span
                      className={cn(
                        "inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                        statusPillClass(statusWord),
                      )}
                    >
                      {statusWord}
                    </span>
                  </span>
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
                  {/* One control per row, the way the design draws it: the
                      department's screen shows a bare pencil — the edit sheet
                      carries Delete and its own confirm — while the Manager's
                      screen keeps the 3-dots (View Details / Edit / Delete),
                      which is how his board reads an action. */}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openEdit(driver)}
                      aria-label={`Edit ${driver.name}`}
                      className="grid size-8 place-items-center justify-self-end rounded text-[#1B2432] hover:bg-[#F1F2F4]"
                    >
                      <Pencil className="size-4" strokeWidth={1.5} />
                    </button>
                  ) : (
                    <RowActionMenu
                      items={[{ label: "View Details", onSelect: () => setDetails(driver) }]}
                      open={menuFor === driver.id}
                      onOpenChange={(open) => setMenuFor(open ? driver.id : null)}
                      label={`Actions for ${driver.name}`}
                      width={190}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {!loading && filtered.length > 0 && staffSummary}

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching staff" : "No staff records yet"}
              body={
                query
                  ? "Try a different name, staff ID, or phone number."
                  : "Staff and driver records will appear here."
              }
            />
          )}

          {/* How much of the register is on screen, at the left, and the way
              through it at the right — the shape the department draws. */}
          {!loading && filtered.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#E2E5E9] pt-5">
              <div className="flex items-center gap-2.5">
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  {from} - {to}
                </span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  of {filtered.length}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
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
                <ExportMenu
                  csv={exportCSV}
                  rows={filtered.length}
                  title="Staff Directory"
                  fileNameBase="staff_directory"
                  label="Export CSV"
                />
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
                statusPillClass(staffStatusLabel(details)),
              )}
            >
              {staffStatusLabel(details)}
            </span>
          ) : null
        }
        facts={details ? staffFacts(details) : []}
        note="Read-only view — HR & Personnel maintains this record. Ask them to change a licence, a phone number or the truck pairing."
      />

      {idEdit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[92vh] w-[840px] max-w-full flex-col gap-5 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#E2E5E9] pb-5">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                Edit Staff Record: {idEdit.driver.name}
              </h3>
              {/*
                Delete sits on the record it deletes — the trash in the header,
                the way the department draws it — rather than as a row action
                that one stray click can reach on a 40-line register.
              */}
              <button
                type="button"
                onClick={() => setDeleteFor(idEdit.driver)}
                aria-label={`Delete the staff record for ${idEdit.driver.name}`}
                title="Delete this staff record"
                className="grid size-8 shrink-0 place-items-center rounded text-[#ED351D] hover:bg-[#FDECEA]"
              >
                <Trash2 className="size-[18px]" strokeWidth={1.75} />
              </button>
            </div>

            <StaffRecordForm
              value={idEdit.draft}
              onChange={(draft) => setIdEdit({ ...idEdit, draft })}
              extras
              attachedLicenceName={idEdit.driver.licenseDocName ?? null}
            />

            <div className="flex items-center justify-between gap-2 border-t border-[#E2E5E9] pt-4">
              <button
                type="button"
                onClick={() => setIdEdit(null)}
                className="text-[14px] font-medium tracking-[0.4px] text-[#ED351D] hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdits()}
                className="flex h-9 items-center rounded bg-[#ED351D] px-3 text-[12px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingFree !== null}
        title="Close his open dispatch?"
        body={pendingFree ? releaseConfirmBody(pendingFree.driver, trips, pendingFree.status) : ""}
        confirmLabel={`Save as ${pendingFree?.status ?? "Active"}`}
        onCancel={() => setPendingFree(null)}
        onConfirm={() => {
          setPendingFree(null);
          void handleSaveEdits(true);
        }}
      />

      {/* The delete question, in the department's own shape: the warning, the
          question, then the two answers. It names the person, because "this
          record" is exactly what a bad click gets wrong. */}
      <ConfirmDialog
        open={deleteFor !== null}
        layout="stacked"
        tone="danger"
        title="Delete staff record"
        body={
          deleteFor
            ? `Are you sure you want to delete this record?\n\n${deleteFor.name}${
                displayDriverSalary(deleteFor) ? ` (${displayDriverSalary(deleteFor)})` : ""
              } will be removed from the staff register.${
                deleteFor.licenseDocName ? " The licence document on file goes with it." : ""
              }`
            : ""
        }
        confirmLabel="Confirm"
        busy={deleting}
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
