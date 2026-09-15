import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Pencil, Search, SlidersHorizontal, Upload, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import { authService, driverService } from "@/lib/fleetopsx/services";
import type { Driver, DriverStatus } from "@/lib/fleetopsx/types";
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

const PAGE_SIZE = 10;

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

function HrStaffDirectory() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: "",
    phone: "",
    staffId: "",
  });
  const [idEdit, setIdEdit] = useState<{ driver: Driver; value: string } | null>(null);

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
    const list = await driverService.list();
    setDrivers(list);
  };

  useEffect(() => {
    void refreshDrivers()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load staff directory"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      const salary = displayDriverSalary(d);
      const hay = `${salary} ${d.employeeId} ${d.name} ${d.phone} ${d.licenseNumber} ${d.assignedTruck ?? ""} ${d.status}`.toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    });
  }, [drivers, query]);

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
      // The live Driver model is { staffId (unique), name, phone, status } —
      // send exactly those so Prisma doesn't reject unknown fields.
      await driverService.create({
        name: newStaff.name.trim(),
        phone: newStaff.phone.trim(),
        staffId,
        status: "Active",
      });
      toast.success("Staff added successfully.");
      setIsAddOpen(false);
      setNewStaff({ name: "", phone: "", staffId: "" });
      await refreshDrivers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add staff";
      toast.error(/unique/i.test(msg) ? `Driver ID ${staffId} is already assigned to another driver.` : msg);
    }
  };

  /** Add or correct the Driver ID (staffId) of an existing driver. */
  const handleSaveId = async () => {
    if (!idEdit) return;
    const staffId = idEdit.value.trim().toUpperCase();
    if (!staffId) {
      toast.error("Enter a Driver ID (e.g. P0123).");
      return;
    }
    try {
      // staffId is the live column behind the driver's ID everywhere.
      await driverService.update(idEdit.driver.id, { staffId } as never);
      toast.success(`Driver ID ${staffId} saved for ${idEdit.driver.name}.`);
      setIdEdit(null);
      await refreshDrivers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save Driver ID";
      toast.error(/unique/i.test(msg) ? "That Driver ID is already assigned to another driver." : msg);
    }
  };

  const exportCSV = () => {
    const headers = "Staff ID,Name,Phone,License,Assigned Asset,Status\n";
    const csv = filtered
      .map((d) => `${displayDriverSalary(d) || d.employeeId},${d.name},${d.phone},${d.licenseNumber},${d.assignedTruck ?? ""},${d.status}`)
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
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Staff Records</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              manage staff records and license status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast.message("Bulk upload", { description: "Connect your HR import endpoint to enable CSV/Excel upload." })}
              className="flex h-8 items-center gap-1.5 px-[7px] text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
            >
              <Upload className="size-[18px]" strokeWidth={1.75} />
              Import CSV
            </button>
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
            <button type="button" className="grid size-9 place-items-center rounded bg-[#ED351D] hover:bg-[#d62e19] text-white" aria-label="Filter">
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="hidden grid-cols-[120px_180px_140px_140px_1fr_110px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px] md:grid">
            {["Staff ID", "Name", "Phone", "License", "Assigned Asset", "Status"].map((h) => (
              <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
          </div>

          {slice.map((driver, index) => {
            const staffId = displayDriverSalary(driver) || driver.employeeId || "—";
            const sn = currentPage * PAGE_SIZE + index + 1;
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
                      <span className="w-20 font-medium text-[#5C6470]">Staff ID:</span>
                      <span className="flex-1 font-semibold text-[#ED351D]">ID:{staffId}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Phone:</span>
                      <span className="flex-1 text-[#344256]">{driver.phone || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">License:</span>
                      <span className="flex-1 text-[#344256]">{driver.licenseNumber || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 font-medium text-[#5C6470]">Asset:</span>
                      <span className="flex-1 text-[#344256]">{driver.assignedTruck || "—"}</span>
                    </div>
                  </div>
                  {driver.status !== "Suspended" && (
                    <span className={cn("mt-1 inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium", statusPillClass(driver.status))}>
                      {driver.status}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIdEdit({ driver, value: displayDriverSalary(driver) || "" })}
                    className="mt-1 inline-flex h-[22px] w-fit items-center rounded border border-[#E2E5E9] px-2.5 text-[10px] font-medium text-[#1B2432]"
                  >
                    {staffId === "—" ? "Add Driver ID" : "Edit Driver ID"}
                  </button>
                </div>

                <div className="hidden grid-cols-[120px_180px_140px_140px_1fr_110px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5 md:grid">
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{staffId}</span>
                  <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{driver.name}</span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{driver.phone}</span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{driver.licenseNumber}</span>
                  <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{driver.assignedTruck || "—"}</span>
                  <span className={cn("inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium", statusPillClass(driver.status))}>
                    {driver.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIdEdit({ driver, value: displayDriverSalary(driver) || "" })}
                    className="grid size-7 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
                    aria-label={`Set Driver ID for ${driver.name}`}
                    title={staffId === "—" ? "Add Driver ID" : "Edit Driver ID"}
                  >
                    <Pencil className="size-4" />
                  </button>
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

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex w-[406px] max-w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Onboard New Staff</h3>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Name</span>
              <input
                value={newStaff.name}
                onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                className="h-10 rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
                Driver ID <span className="text-[#ED351D]">*</span>
              </span>
              <input
                value={newStaff.staffId}
                onChange={(e) => setNewStaff({ ...newStaff, staffId: e.target.value })}
                placeholder="example: P0123"
                className="h-10 rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none"
              />
              <span className="text-[11px] text-[#5C6470]">Shown on dispatches, security logs and the driver roster. Pre-filled with the next free ID.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Phone</span>
              <input
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                className="h-10 rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none"
              />
            </label>
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
          <div className="flex w-[406px] max-w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Set Driver ID</h3>
            </div>
            <p className="text-[13px] text-[#5C6470]">
              {idEdit.driver.name} · {idEdit.driver.phone || "no phone"}
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
                Driver ID <span className="text-[#ED351D]">*</span>
              </span>
              <input
                autoFocus
                value={idEdit.value}
                onChange={(e) => setIdEdit({ ...idEdit, value: e.target.value })}
                placeholder="example: P0123"
                className="h-10 rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none"
              />
              <span className="text-[11px] text-[#5C6470]">
                This ID becomes the driver's identity across dispatch, security log and roster. It must be unique.
              </span>
            </label>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setIdEdit(null)} className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveId()}
                className="flex h-8 items-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[12px] tracking-[0.4px] text-white"
              >
                Save Driver ID
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
