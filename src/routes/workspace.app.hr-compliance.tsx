import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import { formatLicenseDate, licenseExpiry, licenseToneClass } from "@/lib/fleetopsx/license";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { authService, driverService } from "@/lib/fleetopsx/services";
import type { Driver } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * The HR side of the roster: who may legally drive, and who is about to not be.
 *
 * Derived from the licence date on the record rather than a stored flag — a
 * licence that lapsed last month can never read as valid.
 */
export const Route = createFileRoute("/workspace/app/hr-compliance")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "HR", "Platform Admin", "Fleet Operations"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: HrCompliance,
});

const HR_OWNER_ROLES = ["HR", "HR & Personnel", "HR and Personnel", "Platform Admin"];
const HR_ACCESS_ROLES = [...HR_OWNER_ROLES, "Transport Manager", "Fleet Operations"];

const FILTERS = ["All", "Valid", "Expiring", "Expired", "No date on file"] as const;

const inputClass =
  "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";

function HrCompliance() {
  const navigate = useNavigate();
  const [canEdit, setCanEdit] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{
    driver: Driver;
    licenseNumber: string;
    licenseCategory: string;
    licenseExpiry: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const roles = authService.getRoles();
    setCanEdit(roles.some((r: any) => HR_OWNER_ROLES.includes(r)));
    if (!roles.some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
    void driverService
      .list()
      .then(setDrivers)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the roster"))
      .finally(() => setLoading(false));
  }, [navigate]);

  /** One reading of a licence, used by the tiles, the filter and the row. */
  const stateOf = (driver: Driver) => {
    const expiry = licenseExpiry(driver.licenseExpiry);
    const bucket = expiry.tone === "missing" ? "No date on file" : expiry.tone === "expired" ? "Expired" : expiry.tone === "soon" ? "Expiring" : "Valid";
    return { ...expiry, bucket };
  };

  const totals = useMemo(() => {
    const of = (bucket: string) => drivers.filter((d) => stateOf(d).bucket === bucket).length;
    return {
      total: drivers.length,
      valid: of("Valid"),
      expiring: of("Expiring"),
      expired: of("Expired"),
      missing: of("No date on file"),
      noNumber: drivers.filter((d) => !d.licenseNumber?.trim()).length,
      noPairing: drivers.filter((d) => !d.assignedTruck).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers
      .filter((d) => filter === "All" || stateOf(d).bucket === filter)
      .filter((d) => {
        if (!q) return true;
        return `${d.name} ${displayDriverSalary(d)} ${d.licenseNumber} ${d.licenseCategory} ${d.phone}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        // What needs HR first: a lapsed licence, then one about to lapse, then a
        // record with no date at all (a gap to fill, and 100+ of them), and only
        // then the licences that are comfortably valid.
        const rank = (d: Driver) => {
          const tone = licenseExpiry(d.licenseExpiry).tone;
          return tone === "expired" ? 0 : tone === "soon" ? 1 : tone === "missing" ? 2 : 3;
        };
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const da = licenseExpiry(a.licenseExpiry).days ?? Number.POSITIVE_INFINITY;
        const db = licenseExpiry(b.licenseExpiry).days ?? Number.POSITIVE_INFINITY;
        return da - db || a.name.localeCompare(b.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + PAGE_SIZE);

  const saveLicence = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      // The live Driver columns, exactly as the API whitelists them on PATCH:
      // `category` is the licence class, and an emptied field is sent as "" so a
      // licence that was reassigned can actually be cleared.
      const updated = await driverService.update(editing.driver.id, {
        licenseNumber: editing.licenseNumber.trim(),
        category: editing.licenseCategory.trim(),
        licenseExpiry: editing.licenseExpiry,
      } as never);
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success(`Licence updated for ${updated.name}.`);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the licence");
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const headers = "Name,Phone,License Number,License Class,License Expiry,Days Left,State,Staff ID\n";
    const csv = filtered
      .map((d) => {
        const state = stateOf(d);
        return [
          d.name,
          d.phone,
          d.licenseNumber,
          d.licenseCategory,
          d.licenseExpiry ? formatLicenseDate(d.licenseExpiry) : "",
          state.days ?? "",
          state.bucket,
          displayDriverSalary(d) || d.employeeId,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "licence_compliance.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  return (
    <>
      <DepartmentTabs department="hr" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Licence &amp; Compliance</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              who can be put on a truck, and who is about to fall off it
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — HR &amp; Personnel maintains these records
              </span>
            )}
          </div>
          {/* Export stays available to the Transport Manager's glimpse: an
              auditor who cannot take the register away has no audit. */}
          <button
            type="button"
            onClick={exportCSV}
            className="flex h-8 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
          >
            <Download className="size-[18px]" strokeWidth={1.75} />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Total Staff", value: totals.total, tone: "text-[#1B2432]" },
            { label: "Licence Valid", value: totals.valid, tone: "text-[#0A8F4D]" },
            { label: "Expiring (60 days)", value: totals.expiring, tone: "text-[#B26A00]" },
            { label: "Expired", value: totals.expired, tone: "text-[#ED351D]" },
            { label: "No Expiry On File", value: totals.missing, tone: "text-[#B26A00]" },
            { label: "No Licence Number", value: totals.noNumber, tone: "text-[#5C6470]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                {stat.label}
              </span>
              <span className={cn("text-[20px] font-semibold leading-7", stat.tone)}>{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[360px]">
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
                placeholder="Search name, licence or staff ID"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={FILTERS}
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(0);
              }}
              allLabel="All Licences"
              noun="licence state"
            />
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-[1fr_160px_150px_130px_150px_110px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {["Name", "Phone", "Licence", "Class", "Expires", "Staff ID"].map((h) => (
                  <span key={h} className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">
                    {h}
                  </span>
                ))}
              </div>

              {slice.map((driver) => {
                const state = stateOf(driver);
                const staffId = displayDriverSalary(driver) || driver.employeeId || "—";
                return (
                  <div
                    key={driver.id}
                    className="grid grid-cols-[1fr_160px_150px_130px_150px_110px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5"
                  >
                    <span className="text-[14px] capitalize text-[#344256]">{driver.name}</span>
                    <span className="text-[14px] text-[#5C6470]">{driver.phone || "—"}</span>
                    <span className="text-[14px] text-[#5C6470]">{driver.licenseNumber || "—"}</span>
                    <span className="text-[14px] text-[#5C6470]">{driver.licenseCategory || "—"}</span>
                    <span className={cn("flex flex-col gap-0.5 text-[14px]", licenseToneClass(state.tone))}>
                      <span>{state.text}</span>
                      {state.days !== null ? (
                        <span className="text-[11px]">
                          {state.days >= 0 ? `${state.days} day(s) left` : `${Math.abs(state.days)} day(s) ago`}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[14px] font-semibold text-[#5C6470]">{staffId}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            driver,
                            licenseNumber: driver.licenseNumber ?? "",
                            licenseCategory: driver.licenseCategory ?? "",
                            licenseExpiry: (driver.licenseExpiry ?? "").slice(0, 10),
                          })
                        }
                        className="grid size-7 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
                        aria-label={`Edit the licence for ${driver.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#98A0AC]">View only</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query || filter !== "All" ? "No matching licences" : "No staff records yet"}
              body={
                query || filter !== "All"
                  ? "Try another name, licence or staff ID, or clear the state filter."
                  : "Staff and driver records will appear here."
              }
            />
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to}
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
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
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[440px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                Licence — {editing.driver.name}
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                Staff ID {displayDriverSalary(editing.driver) || editing.driver.employeeId}
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Licence Number</span>
              <input
                value={editing.licenseNumber}
                onChange={(e) => setEditing({ ...editing, licenseNumber: e.target.value })}
                placeholder="example: ABC-123456"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Licence Class</span>
              <input
                value={editing.licenseCategory}
                onChange={(e) => setEditing({ ...editing, licenseCategory: e.target.value })}
                placeholder="example: Professional"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Expiry Date</span>
              <input
                type="date"
                value={editing.licenseExpiry}
                onChange={(e) => setEditing({ ...editing, licenseExpiry: e.target.value })}
                className={inputClass}
              />
              <span className="text-[11px] text-[#5C6470]">
                Clearing the date moves the driver to “No Expiry On File” rather than reading as valid.
              </span>
            </label>
            <div className="flex items-center justify-end gap-2 border-t border-[#E2E5E9] pt-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-9 rounded border border-[#E2E5E9] px-4 text-[14px] font-medium text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveLicence()}
                className="h-9 rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save licence"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
