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
import { adminService } from "@/lib/fleetopsx/services";
import { isPartnerUser } from "@/lib/fleetopsx/staff-accounts";
import type { User } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/app/manage-partner")({
  component: AdminManagePartner,
});

const PAGE_SIZE = 10;

type ConfirmKind = "password" | "suspend" | "activate" | "delete";
type SortKey = "name" | "username" | "company";
type SortDir = "asc" | "desc";

function AdminManagePartner() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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

  const listing = users.filter((u) => u.status !== "Deleted" && isPartnerUser(u));
  const filtered = listing
    .filter((u) => {
      const hay = `${u.name} ${u.username ?? ""} ${u.partnerCompanyName ?? ""}`.toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const dir = sortDir === "asc" ? 1 : -1;
      const av =
        sortKey === "company" ? (a.partnerCompanyName ?? "") : sortKey === "username" ? (a.username ?? "") : a.name;
      const bv =
        sortKey === "company" ? (b.partnerCompanyName ?? "") : sortKey === "username" ? (b.username ?? "") : b.name;
      return av.localeCompare(bv) * dir;
    });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers = "S/N,Name,Company Name,Username,Status\n";
    const csv = filtered
      .map((u, i) => `${i + 1},${u.name},${u.partnerCompanyName || "-"},${u.username ?? ""},${u.status}`)
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "partner_accounts.csv";
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
        toast.warning("Partner account suspended.");
        setConfirmAction(null);
        void adminService.users().then(setUsers);
        break;
      case "activate":
        await adminService.activateUser(confirmAction.userId);
        toast.success("Partner account activated.");
        setConfirmAction(null);
        void adminService.users().then(setUsers);
        break;
      case "delete":
        await adminService.deleteUser(confirmAction.userId);
        toast.error("Partner account deleted.");
        setConfirmAction(null);
        void adminService.users().then(setUsers);
        break;
      default: {
        const _exhaustive: never = confirmAction.type;
        return _exhaustive;
      }
    }
  };

  const shareText = `Hello,\n\nYour account password has been reset for the Partner Portal.\nTemporary password: ${sharedTempPassword || "(see your administrator)"}\nLogin at: ${window.location.origin}/workspace/customer-portal/login`;

  return (
    <>
      {/* Figma 327:11712 */}
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Manage Partner Account</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              manage listing of partner companies
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Link
              to="/workspace/app/add-partner"
              className="flex h-10 items-center justify-center rounded bg-[#ED351D] px-4 text-[14px] font-medium leading-5 tracking-[0.4px] text-white hover:bg-[#d62e19]"
            >
              + Add New Account
            </Link>
            <button
              type="button"
              onClick={exportCSV}
              className="flex h-10 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              <Download className="size-4" strokeWidth={1.75} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-[540px] min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search"
              className="h-10 w-full rounded border border-[#E2E5E9] bg-white pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
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
              <div className="absolute top-12 right-0 z-40 w-56 rounded border border-[#E2E5E9] bg-white py-3 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                <p className="px-4 pb-2 text-[12px] font-semibold uppercase tracking-[0.4px] text-[#ED351D]">Sort by</p>
                {(
                  [
                    ["name", "Full Name"],
                    ["username", "Username"],
                    ["company", "Company"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortKey(key)}
                    className={`flex w-full px-4 py-2 text-left text-[14px] hover:bg-[#F1F2F4] ${
                      sortKey === key ? "font-medium text-[#ED351D]" : "text-[#5C6470]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="my-2 h-px bg-[#E2E5E9]" />
                <p className="px-4 pb-2 text-[12px] font-semibold uppercase tracking-[0.4px] text-[#ED351D]">Order</p>
                {(
                  [
                    ["asc", "Ascending"],
                    ["desc", "Descending"],
                  ] as const
                ).map(([dir, label]) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setSortDir(dir)}
                    className={`flex w-full px-4 py-2 text-left text-[14px] hover:bg-[#F1F2F4] ${
                      sortDir === dir ? "font-medium text-[#ED351D]" : "text-[#5C6470]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="mt-2 w-full px-4 py-2 text-left text-[13px] text-[#8E95A1] hover:bg-[#F1F2F4]"
                  onClick={() => {
                    setSortKey(null);
                    setSortDir("asc");
                    setFilterOpen(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border border-[#E2E5E9] bg-white max-md:border-0 max-md:bg-transparent">
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching partner accounts" : "No partner accounts yet"}
              body={
                query
                  ? "Try a different name, company, or username."
                  : "Partner companies you create will list here from the live API."
              }
              action={
                !query ? (
                  <Link
                    to="/workspace/app/add-partner"
                    className="flex h-10 items-center rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white"
                  >
                    + Add New Account
                  </Link>
                ) : undefined
              }
            />
          )}
          {!loading && filtered.length > 0 && (
            <>
              <div className="flex flex-col gap-3 md:hidden">
                {slice.map((u, i) => (
                  <div
                    key={`m-${u.id}`}
                    className="relative flex flex-col gap-2 rounded-[6px] border border-[#E2E5E9] bg-white px-3.5 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-semibold text-[#5C6470]">
                        #{currentPage * PAGE_SIZE + i + 1}
                      </span>
                      <div ref={menuFor === `m-${u.id}` ? menuRef : undefined} className="relative">
                        <button
                          type="button"
                          className="grid size-5 place-items-center text-[#1B2432]"
                          onClick={() => setMenuFor((id) => (id === `m-${u.id}` ? null : `m-${u.id}`))}
                          aria-label="Partner options"
                        >
                          <MoreVertical className="size-4" />
                        </button>
                        {menuFor === `m-${u.id}` && (
                          <div className="absolute top-6 right-0 z-50 w-44 rounded border border-[#E2E5E9] bg-white py-1 shadow-[0px_4px_16px_rgba(0,0,0,0.12)]">
                            <button
                              type="button"
                              className="w-full px-4 py-2 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                              onClick={() => {
                                setMenuFor(null);
                                toast.message("Account details", {
                                  description: `${u.name} · ${u.partnerCompanyName || "Partner"} · ${u.email}`,
                                });
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
                      <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">
                        {u.partnerCompanyName || u.name}
                      </p>
                      {u.status === "Suspended" && (
                        <span className="inline-flex h-[18px] items-center rounded bg-[#ED351D] px-2.5 text-[10px] font-medium text-white">
                          Suspended
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 text-[12px]">
                      <div className="flex gap-2">
                        <span className="w-20 font-medium text-[#5C6470]">Name:</span>
                        <span className="flex-1 text-[#344256]">{u.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="w-20 font-medium text-[#5C6470]">Username:</span>
                        <span className="flex-1 text-[#344256]">{u.username || "—"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[720px]">
                  <div className="flex items-center gap-[60px] border-b border-[#E2E5E9] px-5 py-3">
                    <span className="w-[29px] shrink-0 text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">S/N</span>
                    <div className="flex w-[590px] shrink-0 items-center text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                      <span className="w-[167px] shrink-0">Name</span>
                      <span className="w-[250px] shrink-0">Company Name</span>
                      <span className="w-[167px] shrink-0">Username</span>
                    </div>
                    <span className="w-5 shrink-0" />
                  </div>

                  {slice.map((u, i) => (
                    <div
                      key={u.id}
                      className="relative z-0 flex items-center gap-[60px] border-b border-[#E2E5E9] px-5 py-3 last:border-b-0 data-[open=true]:z-20"
                      data-open={menuFor === u.id ? "true" : "false"}
                    >
                      <span className="w-[29px] shrink-0 text-[14px] capitalize text-[#5C6470]">
                        {currentPage * PAGE_SIZE + i + 1}
                      </span>
                      <div className="flex w-[590px] shrink-0 items-center text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        <span className="w-[167px] shrink-0 truncate">{u.name}</span>
                        <span className="w-[250px] shrink-0 truncate">{u.partnerCompanyName}</span>
                        <span className="w-[167px] shrink-0 truncate normal-case">{u.username}</span>
                      </div>
                      <div className="relative flex shrink-0 items-center gap-2">
                        <div ref={menuFor === u.id ? menuRef : undefined} className="relative">
                          <button
                            type="button"
                            className="grid size-5 place-items-center text-[#1B2432]"
                            onClick={() => setMenuFor((id) => (id === u.id ? null : u.id))}
                            aria-label="Partner options"
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
                                  toast.message("Account details", {
                                    description: `${u.name} · ${u.partnerCompanyName || "Partner"} · ${u.email}`,
                                  });
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

              <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] px-5 py-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex w-full max-w-[440px] flex-col items-center rounded-[10px] bg-white p-8 shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full border-[3px] border-[#ED351D]">
              <AlertCircle className="size-7 text-[#ED351D]" />
            </div>
            <p className="mb-8 whitespace-pre-line text-center text-[16px] text-[#5C6470]">
              {confirmAction.type === "password" && "Are you sure you want to\nreset this partner's password?"}
              {confirmAction.type === "suspend" && "Are you sure you want to\nsuspend this account?"}
              {confirmAction.type === "activate" && "Are you sure you want to\nactivate this account?"}
              {confirmAction.type === "delete" && "Are you sure you want to\ndelete this account?"}
            </p>
            <div className="flex w-full items-center justify-between gap-6">
              <button type="button" onClick={() => setConfirmAction(null)} className="text-[14px] font-medium text-[#ED351D]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="relative w-[360px] rounded-[10px] bg-white shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
            <button type="button" onClick={() => setShowShareModal(false)} className="absolute top-5 right-5 text-[#8E95A1]">
              <X className="size-4" />
            </button>
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-[16px] font-semibold text-[#ED351D]">Share Sign In Details</h3>
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#141A1F" />
                </svg>
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
