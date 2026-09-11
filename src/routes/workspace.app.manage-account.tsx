import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreVertical,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { ADMIN_DEPARTMENTS } from "@/lib/fleetopsx/admin-departments";
import { humanCode } from "@/lib/fleetopsx/display-ids";
import { adminService } from "@/lib/fleetopsx/services";
import { displayStaffDepartment, isManageableStaffUser } from "@/lib/fleetopsx/staff-accounts";
import type { User } from "@/lib/fleetopsx/types";
import { WhatsAppIcon } from "@/components/fleetopsx/portal-overlay";

export const Route = createFileRoute("/workspace/app/manage-account")({
  component: AdminManageAccount,
});

const PAGE_SIZE = 10;

type ConfirmKind = "password" | "suspend" | "activate" | "delete";

function staffIdLabel(user: User) {
  const code = humanCode(user.id, user.username);
  return code ? `ID:${code}` : "ID:—";
}

function displayUsername(user: User) {
  const raw = (user.username || "").trim();
  if (!raw) return "—";
  if (raw.includes("@")) return raw.split("@")[0] || raw;
  return raw;
}

function AdminManageAccount() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: ConfirmKind; userId: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharedTempPassword, setSharedTempPassword] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void adminService
      .users()
      .then(setUsers)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load staff"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (filterRef.current && !filterRef.current.contains(t)) setFilterOpen(false);
      if (menuRef.current && !menuRef.current.contains(t)) setMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const listing = users.filter(isManageableStaffUser);
  const filtered = listing.filter((u) => {
    const dept = displayStaffDepartment(u.department);
    const hay = `${u.name} ${u.username ?? ""} ${u.id} ${dept} ${staffIdLabel(u)}`.toLowerCase();
    const matchesQuery = !query || hay.includes(query.toLowerCase());
    const matchesDept =
      !deptFilter ||
      u.department === deptFilter ||
      displayStaffDepartment(u.department) === deptFilter ||
      displayStaffDepartment(deptFilter) === dept;
    return matchesQuery && matchesDept;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers = "S/N,Name,Department,Staff ID,Username,Status\n";
    const csv = filtered
      .map(
        (u, i) =>
          `${i + 1},${u.name},${displayStaffDepartment(u.department)},${staffIdLabel(u)},${displayUsername(u)},${u.status}`,
      )
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff_accounts.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case "password": {
        const tempPassword = await adminService.resetPassword(confirmAction.userId);
        const pwd = typeof tempPassword === "string" ? tempPassword : "";
        setSharedTempPassword(pwd);
        toast.success(pwd ? `Temporary password: ${pwd}` : "Password reset initiated.", { duration: 12_000 });
        setConfirmAction(null);
        setShowShareModal(true);
        break;
      }
      case "suspend":
        await adminService.suspendUser(confirmAction.userId);
        toast.warning("Account suspended.");
        setConfirmAction(null);
        void adminService.users().then(setUsers);
        break;
      case "activate":
        await adminService.activateUser(confirmAction.userId);
        toast.success("Account activated.");
        setConfirmAction(null);
        void adminService.users().then(setUsers);
        break;
      case "delete":
        await adminService.deleteUser(confirmAction.userId);
        toast.error("Account deleted (soft).");
        setConfirmAction(null);
        void adminService.users().then(setUsers);
        break;
      default: {
        const _exhaustive: never = confirmAction.type;
        return _exhaustive;
      }
    }
  };

  const shareText = `Hello,\n\nYour account password has been reset for the Transport Manager Portal.\nTemporary password: ${sharedTempPassword || "(see your administrator)"}\nLogin at: ${window.location.origin}`;

  return (
    <>
      {/* Figma 93:1637 */}
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Manage Staff Account</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              manage listing of internal staff
            </p>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2.5">
            <Link
              to="/workspace/app/add-account"
              className="flex h-10 shrink-0 items-center justify-center rounded bg-[#ED351D] px-4 text-[14px] font-medium leading-5 tracking-[0.4px] whitespace-nowrap text-white hover:bg-[#d62e19]"
            >
              + Add New Staff Account
            </Link>
            <button
              type="button"
              onClick={exportCSV}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] whitespace-nowrap text-white"
            >
              <Download className="size-4" strokeWidth={1.75} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-[520px] min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search"
              className="h-10 w-full rounded border border-[#E2E5E9] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
            />
          </div>
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className="flex size-10 items-center justify-center rounded bg-[#ED351D] text-white"
              aria-label="Filter"
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            </button>
            {filterOpen && (
              <div className="absolute top-12 right-0 z-40 w-64 rounded border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                <button
                  type="button"
                  onClick={() => {
                    setDeptFilter(null);
                    setPage(0);
                    setFilterOpen(false);
                  }}
                  className="flex w-full px-4 py-2 text-left text-[14px] text-[#5C6470] hover:bg-[#F1F2F4]"
                >
                  All departments
                </button>
                {ADMIN_DEPARTMENTS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDeptFilter(d);
                      setPage(0);
                      setFilterOpen(false);
                    }}
                    className={`flex w-full px-4 py-2 text-left text-[14px] hover:bg-[#F1F2F4] ${
                      deptFilter === d ? "font-medium text-[#ED351D]" : "text-[#5C6470]"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {loading && <FigmaLoadingState label="Loading staff accounts…" />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query || deptFilter ? "No matching staff accounts" : "No staff accounts yet"}
              body={
                query || deptFilter
                  ? "Try a different name, department, or staff ID."
                  : "Create internal staff from New Account — portal login accounts (gate, fleet, manager…) stay off this list."
              }
              action={
                !query && !deptFilter ? (
                  <Link
                    to="/workspace/app/add-account"
                    className="flex h-10 items-center rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white"
                  >
                    + Add New Staff Account
                  </Link>
                ) : undefined
              }
            />
          )}

          {!loading && filtered.length > 0 && (
            <>
          {/* Mobile cards — Figma Staff-Card-1 `134:3253` */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {slice.map((u, i) => (
              <div
                key={u.id}
                className="relative flex flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-semibold text-[#5C6470]">
                    #{currentPage * PAGE_SIZE + i + 1}
                  </span>
                  <div ref={menuFor === u.id ? menuRef : undefined} className="relative">
                    <button
                      type="button"
                      className="grid size-5 place-items-center text-[#1B2432]"
                      aria-label="Account options"
                      onClick={() => setMenuFor((id) => (id === u.id ? null : u.id))}
                    >
                      <MoreVertical className="size-5" />
                    </button>
                    {menuFor === u.id && (
                      <div className="absolute top-6 right-0 z-50 w-44 rounded border border-[#E2E5E9] bg-white py-1 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                        <button
                          type="button"
                          className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                          onClick={() => {
                            setMenuFor(null);
                            toast.message("Account details", { description: `${u.name} · ${u.email}` });
                          }}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                          onClick={() => {
                            setMenuFor(null);
                            setConfirmAction({ type: "password", userId: u.id });
                          }}
                        >
                          Reset password
                        </button>
                        {u.status === "Suspended" ? (
                          <button
                            type="button"
                            className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                            onClick={() => {
                              setMenuFor(null);
                              setConfirmAction({ type: "activate", userId: u.id });
                            }}
                          >
                            Activate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                            onClick={() => {
                              setMenuFor(null);
                              setConfirmAction({ type: "suspend", userId: u.id });
                            }}
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          type="button"
                          className="w-full px-4 py-2 text-left text-[14px] text-[#ED351D] hover:bg-[#F1F2F4]"
                          onClick={() => {
                            setMenuFor(null);
                            setConfirmAction({ type: "delete", userId: u.id });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">{u.name}</p>
                  {u.status === "Suspended" ? (
                    <span className="inline-flex h-[18px] items-center rounded bg-[#ED351D] px-2.5 text-[10px] font-medium text-white">
                      Suspended
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-[5px] text-[12px]">
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-[#5C6470]">Department:</span>
                    <span className="min-w-0 flex-1 text-[#344256]">{displayStaffDepartment(u.department)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-[#5C6470]">Staff ID:</span>
                    <span className="min-w-0 flex-1 font-semibold text-[#ED351D]">{staffIdLabel(u)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-[#5C6470]">Username:</span>
                    <span className="min-w-0 flex-1 text-[#344256]">{displayUsername(u)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table — Figma Account Listing `124:3133` / Manage Account `93:1637` */}
          <div className="hidden w-full overflow-x-auto rounded-[10px] border border-[#E2E5E9] bg-white md:block">
            <div className="min-w-[640px] w-full">
              <div className="grid grid-cols-[40px_minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] items-center gap-x-3 border-b border-[#E2E5E9] px-4 py-3 xl:gap-x-4 xl:px-5">
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">S/N</span>
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">Name</span>
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">Department</span>
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">Staff ID</span>
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">Username</span>
                <span className="w-5" />
              </div>
              {slice.map((u, i) => (
                <div
                  key={u.id}
                  className="relative z-0 grid grid-cols-[40px_minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] items-center gap-x-3 border-b border-[#E2E5E9] px-4 py-3 last:border-b-0 data-[open=true]:z-20 xl:gap-x-4 xl:px-5"
                  data-open={menuFor === u.id ? "true" : "false"}
                >
                  <span className="text-[14px] text-[#5C6470]">{currentPage * PAGE_SIZE + i + 1}</span>
                  <span className="truncate text-[14px] tracking-[0.4px] text-[#1B2432]">{u.name}</span>
                  <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {displayStaffDepartment(u.department)}
                  </span>
                  <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">{staffIdLabel(u)}</span>
                  <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">{displayUsername(u)}</span>
                  <div className="relative flex shrink-0 items-center justify-end gap-2">
                    <div ref={menuFor === u.id ? menuRef : undefined} className="relative">
                      <button
                        type="button"
                        className="grid size-5 place-items-center text-[#1B2432]"
                        onClick={() => setMenuFor((id) => (id === u.id ? null : u.id))}
                        aria-label="Staff options"
                      >
                        <MoreVertical className="size-5" strokeWidth={1.75} />
                      </button>
                      {menuFor === u.id && (
                        <div className="absolute top-6 right-0 z-50 w-44 rounded border border-[#E2E5E9] bg-white py-1 shadow-[0px_4px_16px_rgba(0,0,0,0.12)]">
                          <button
                            type="button"
                            className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                            onClick={() => {
                              setMenuFor(null);
                              toast.message("Account details", { description: `${u.name} · ${u.email}` });
                            }}
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                            onClick={() => {
                              setMenuFor(null);
                              setConfirmAction({ type: "password", userId: u.id });
                            }}
                          >
                            Reset password
                          </button>
                          {u.status === "Suspended" ? (
                            <button
                              type="button"
                              className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                              onClick={() => {
                                setMenuFor(null);
                                setConfirmAction({ type: "activate", userId: u.id });
                              }}
                            >
                              Activate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                              onClick={() => {
                                setMenuFor(null);
                                setConfirmAction({ type: "suspend", userId: u.id });
                              }}
                            >
                              Suspend
                            </button>
                          )}
                          <button
                            type="button"
                            className="w-full px-4 py-2 text-left text-[14px] text-[#ED351D] hover:bg-[#F1F2F4]"
                            onClick={() => {
                              setMenuFor(null);
                              setConfirmAction({ type: "delete", userId: u.id });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {u.status === "Suspended" && (
                      <span className="inline-flex h-[22px] shrink-0 items-center rounded bg-[#ED351D] px-2.5 text-[10px] font-medium text-white">
                        Suspended
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2.5 pt-2">
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
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/75 p-4">
          <div className="flex w-full max-w-[440px] flex-col items-center rounded-[10px] bg-white p-8 shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full border-[3px] border-[#ED351D]">
              <AlertCircle className="size-7 text-[#ED351D]" />
            </div>
            <p className="mb-8 whitespace-pre-line text-center text-[16px] text-[#5C6470]">
              {confirmAction.type === "password" && "Are you sure you want to\nreset this user's password?"}
              {confirmAction.type === "suspend" && "Are you sure you want to\nsuspend this account?"}
              {confirmAction.type === "activate" && "Are you sure you want to\nactivate this account?"}
              {confirmAction.type === "delete" && "Are you sure you want to\ndelete this account?"}
            </p>
            <div className="flex w-full items-center justify-between gap-6">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="text-[14px] font-medium text-[#ED351D]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className="flex-1 rounded bg-[#ED351D] py-2.5 text-[14px] font-medium text-white hover:bg-[#d62e19]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/75 p-4">
          <div className="relative w-[360px] rounded-[10px] bg-white shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
            <button
              type="button"
              onClick={() => setShowShareModal(false)}
              className="absolute top-5 right-5 text-[#8E95A1]"
            >
              <X className="size-4" />
            </button>
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-[16px] font-semibold text-[#ED351D]">Share Password</h3>
            </div>
            <div className="h-px bg-[#E2E5E9]" />
            <div className="flex justify-between px-10 py-8">
              <button
                type="button"
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
                  setShowShareModal(false);
                }}
              >
                <WhatsAppIcon className="size-6" />
                <span className="text-[12px] font-medium text-[#5C6470]">WhatsApp</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  window.open(`mailto:?subject=Password Reset&body=${encodeURIComponent(shareText)}`, "_blank");
                  setShowShareModal(false);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141A1F" />
                </svg>
                <span className="text-[12px] font-medium text-[#5C6470]">Gmail</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  void navigator.clipboard.writeText(shareText);
                  toast.success("Details copied to clipboard");
                  setShowShareModal(false);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#141A1F" />
                </svg>
                <span className="text-[12px] font-medium text-[#5C6470]">Copy</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
