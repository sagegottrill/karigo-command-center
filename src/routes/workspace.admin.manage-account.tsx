import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, MoreVertical, X, ArrowLeft, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import type { User } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/admin/manage-account")({
  component: AdminManageAccount,
});

function AdminManageAccount() {
  const [users, setUsers] = useState<User[]>([]);
  const currentUser = authService.getCurrentUser();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("Username");
  const [orderBy, setOrderBy] = useState("Ascending");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showSortModal, setShowSortModal] = useState(false);

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{ type: "password" | "suspend" | "delete"; userId: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    void adminService.users().then(setUsers);
  }, []);

  // Filter & sort
  const filtered = users
    .filter(u => u.status !== "Deleted")
    .filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let valA = "", valB = "";
      if (sortBy === "Username") { valA = a.username || ""; valB = b.username || ""; }
      else if (sortBy === "Full Name") { valA = a.name; valB = b.name; }
      else if (sortBy === "Department") { valA = a.department || ""; valB = b.department || ""; }
      else if (sortBy === "Staff ID") { valA = a.id; valB = b.id; }
      const cmp = valA.localeCompare(valB);
      return orderBy === "Ascending" ? cmp : -cmp;
    });

  const handleAction = (type: "password" | "suspend" | "delete", userId: string) => {
    setActiveMenu(null);
    setConfirmAction({ type, userId });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "password") {
      await adminService.resetPassword(confirmAction.userId);
      setConfirmAction(null);
      setShowShareModal(true);
    } else if (confirmAction.type === "suspend") {
      await adminService.suspendUser(confirmAction.userId);
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    } else if (confirmAction.type === "delete") {
      await adminService.deleteUser(confirmAction.userId);
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    }
  };

  const removeFilter = (type: "sort" | "order") => {
    if (type === "sort") setSortBy("Username");
    if (type === "order") setOrderBy("Ascending");
  };

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-col w-[260px] bg-[#1B2432] h-full shrink-0">
        <div className="pt-[24px] pb-[32px] px-[24px] flex justify-center border-b border-[#ffffff]/5">
          <img src="/petroline-transparent.png" alt="Petroline Transport Ltd" className="w-[140px] h-[48px] object-contain" />
        </div>
        <div className="flex flex-col flex-1 py-[24px]">
          <div className="px-[24px] mb-[12px]">
            <span className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">STAFF ACCOUNT</span>
          </div>
          <div className="flex flex-col">
            <Link to="/workspace/admin/add-account" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full border-[1.5px] border-[#ffffff]">
                <span className="text-[#ffffff] text-[10px] font-bold leading-none">+</span>
              </div>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Add New Account</span>
            </Link>
            <Link to="/workspace/admin/manage-account" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] bg-[#ed351d]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
              </svg>
              <span className="text-[14px] font-[500] leading-[16.94px] text-[#ffffff]">Account Management</span>
            </Link>
            <Link to="/workspace/admin/password-request" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full border-[1.5px] border-[#ffffff]">
                <span className="text-[#ffffff] text-[10px] font-bold leading-none">?</span>
              </div>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Password Request</span>
            </Link>
          </div>
        </div>
        <div className="mt-auto p-[24px] border-t border-[#ffffff]/5">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-[12px]">
              <div className="w-[32px] h-[32px] rounded-[4px] bg-[#e2e5e9] flex items-center justify-center">
                <span className="text-[14px] font-[600] text-[#141a1f]">{currentUser?.initials || "JD"}</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[14px] font-[600] leading-[16.94px] text-[#ffffff]">{currentUser?.name || "J.Doe"}</span>
                <span className="text-[12px] font-[400] leading-[14.52px] text-[#8e95a1]">{currentUser?.email || "j.doe@gmail.com"}</span>
              </div>
            </div>
            <MoreVertical className="w-[16px] h-[16px] text-[#8e95a1] cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-auto relative pb-[80px] lg:pb-0">
        {/* Mobile Header */}
        <div className="flex lg:hidden flex-row items-center justify-between px-[16px] py-[16px] bg-[#1B2432]">
          <div className="flex items-center gap-[12px]">
            <button onClick={() => navigate({ to: "/workspace/app" })}>
              <ArrowLeft className="w-[20px] h-[20px] text-[#ffffff]" />
            </button>
            <span className="text-[16px] font-[500] text-[#ffffff]">Transport Manager Portal</span>
          </div>
          <div className="w-[32px] h-[32px] rounded-full bg-[#ed351d] flex items-center justify-center">
            <span className="text-[12px] font-[600] text-[#ffffff]">{currentUser?.initials || "JD"}</span>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">Transport Manager Portal</h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        {/* Content Body */}
        <div className="flex flex-col px-[16px] lg:px-[40px] py-[24px] lg:py-[32px] flex-1">
          {/* Title row */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between mb-[16px] lg:mb-[32px]">
            <div className="flex flex-col gap-[4px] lg:gap-[8px]">
              <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f]">Manage Staff Account</h2>
              <p className="text-[12px] font-[400] lg:font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] lg:uppercase">
                Manage listing of internal company staff
              </p>
            </div>
            <Link to="/workspace/admin/add-account" className="hidden lg:flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors">
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">+ Add New Staff Account</span>
            </Link>
          </div>

          {/* Mobile: Add New Staff Account Button */}
          <Link to="/workspace/admin/add-account" className="flex lg:hidden flex-row items-center justify-center py-[12px] rounded-[8px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors mb-[16px]">
            <span className="text-[14px] font-[500] text-[#ffffff]">+ Add New Staff Account</span>
          </Link>

          {/* Search + Filter */}
          <div className="flex flex-row items-center gap-[12px] lg:gap-[16px] mb-[12px] lg:mb-[16px]">
            <div className="flex flex-row items-center flex-1 lg:w-[400px] lg:flex-none h-[40px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] lg:bg-[#f6f7f9] px-[12px] gap-[10px]">
              <Search className="w-[16px] h-[16px] text-[#8e95a1]" />
              <input 
                type="text" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search" 
                className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] text-[#141a1f] placeholder-[#8e95a1]"
              />
            </div>
            <button onClick={() => setShowSortModal(true)} className="flex flex-row items-center justify-center w-[40px] h-[40px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 4.5H13.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M5 8.5H11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M7 12.5H9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-row items-center gap-[8px] mb-[16px] lg:mb-[24px]">
            <div className="flex flex-row items-center gap-[6px] py-[4px] px-[10px] rounded-[4px] bg-[#ed351d]">
              <span className="text-[12px] font-[500] text-[#ffffff]">{sortBy}</span>
              <button onClick={() => removeFilter("sort")} className="text-[#ffffff]"><X className="w-[12px] h-[12px]" /></button>
            </div>
            <div className="flex flex-row items-center gap-[6px] py-[4px] px-[10px] rounded-[4px] bg-[#141a1f]">
              <span className="text-[12px] font-[500] text-[#ffffff]">{orderBy === "Ascending" ? "Accending" : "Descending"}</span>
              <button onClick={() => removeFilter("order")} className="text-[#ffffff]"><X className="w-[12px] h-[12px]" /></button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:flex flex-col w-full rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex flex-row items-center w-full px-[24px] py-[16px] border-b-[1px] border-[#e2e5e9] bg-[#ffffff]">
              <div className="w-[80px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">S/N</span></div>
              <div className="flex-1 min-w-[200px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Name</span></div>
              <div className="flex-1 min-w-[200px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Department</span></div>
              <div className="flex-1 min-w-[150px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Staff ID</span></div>
              <div className="flex-1 min-w-[150px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Username</span></div>
              <div className="w-[80px]"></div>
            </div>
            <div className="flex flex-col w-full">
              {filtered.map((account, index) => (
                <div key={account.id} className="flex flex-row items-center w-full px-[24px] py-[20px] border-b-[1px] border-[#e2e5e9] bg-[#ffffff] last:border-b-0 hover:bg-[#fafafa] transition-colors relative">
                  <div className="w-[80px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.name}</span>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.department}</span>
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">ID:{account.id}</span>
                  </div>
                  <div className="flex-1 min-w-[150px] flex items-center gap-[8px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.username}</span>
                  </div>
                  <div className="w-[80px] flex items-center justify-end gap-[8px] relative">
                    <button onClick={() => setActiveMenu(activeMenu === account.id ? null : account.id)} className="w-[32px] h-[32px] flex items-center justify-center rounded-[4px] hover:bg-[#e2e5e9] transition-colors">
                      <MoreVertical className="w-[16px] h-[16px] text-[#141a1f]" />
                    </button>
                    {account.status === "Suspended" && (
                      <div className="flex items-center justify-center py-[2px] px-[8px] rounded-[4px] bg-[#ed351d]">
                        <span className="text-[10px] font-[500] leading-[14px] text-[#ffffff]">Suspended</span>
                      </div>
                    )}
                    {/* Action Menu */}
                    {activeMenu === account.id && (
                      <div className="absolute top-[36px] right-0 z-40 w-[180px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                        <button onClick={() => handleAction("password", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Reset Password</button>
                        <button onClick={() => handleAction("suspend", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Suspend</button>
                        <button onClick={() => handleAction("delete", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#ed351d] hover:bg-[#f6f7f9]">Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="flex lg:hidden flex-col gap-[12px]">
            {filtered.map((account, index) => (
              <div key={account.id} className="flex flex-col rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] px-[16px] py-[16px] relative">
                <div className="flex flex-row items-start justify-between mb-[8px]">
                  <span className="text-[12px] font-[400] text-[#8e95a1]">#{index + 1}</span>
                  <div className="flex items-center gap-[8px]">
                    {account.status === "Suspended" && (
                      <div className="flex items-center justify-center py-[2px] px-[8px] rounded-[4px] bg-[#ed351d]">
                        <span className="text-[10px] font-[500] text-[#ffffff]">Suspended</span>
                      </div>
                    )}
                    <button onClick={() => setActiveMenu(activeMenu === account.id ? null : account.id)} className="p-[4px]">
                      <MoreVertical className="w-[16px] h-[16px] text-[#141a1f]" />
                    </button>
                  </div>
                </div>
                <span className="text-[16px] font-[600] leading-[24px] text-[#141a1f] mb-[8px]">{account.name}</span>
                <div className="flex flex-col gap-[4px]">
                  <div className="flex flex-row items-center gap-[8px]">
                    <span className="text-[13px] font-[500] text-[#8e95a1] w-[90px]">Department:</span>
                    <span className="text-[13px] font-[400] text-[#5c6470]">{account.department}</span>
                  </div>
                  <div className="flex flex-row items-center gap-[8px]">
                    <span className="text-[13px] font-[500] text-[#8e95a1] w-[90px]">Staff ID:</span>
                    <span className="text-[13px] font-[400] text-[#ed351d]">ID:{account.id}</span>
                  </div>
                  <div className="flex flex-row items-center gap-[8px]">
                    <span className="text-[13px] font-[500] text-[#8e95a1] w-[90px]">Username:</span>
                    <span className="text-[13px] font-[400] text-[#5c6470]">{account.username}</span>
                  </div>
                </div>
                {/* Mobile Action Menu */}
                {activeMenu === account.id && (
                  <div className="absolute top-[40px] right-[16px] z-40 w-[180px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                    <button onClick={() => handleAction("password", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Reset Password</button>
                    <button onClick={() => handleAction("suspend", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Suspend</button>
                    <button onClick={() => handleAction("delete", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#ed351d] hover:bg-[#f6f7f9]">Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <div className="fixed bottom-0 left-0 right-0 flex lg:hidden flex-row items-center justify-around bg-[#ffffff] border-t border-[#e2e5e9] py-[10px] z-30">
          <Link to="/workspace/admin/add-account" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 4V16M4 10H16" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span className="text-[10px] font-[500] text-[#8e95a1]">New{"\n"}Account</span>
          </Link>
          <Link to="/workspace/admin/manage-account" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 14C13 11.79 11.21 10 9 10C6.79 10 5 11.79 5 14" stroke="#141a1f" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="6" r="3" stroke="#141a1f" strokeWidth="1.5"/><path d="M15 10L17 12L15 14" stroke="#141a1f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="text-[10px] font-[600] text-[#141a1f]">Manage{"\n"}Account</span>
            <div className="w-[40px] h-[2px] bg-[#141a1f] rounded-full"></div>
          </Link>
          <Link to="/workspace/admin/password-request" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="12" height="9" rx="2" stroke="#8e95a1" strokeWidth="1.5"/><path d="M7 8V6C7 4.34 8.34 3 10 3C11.66 3 13 4.34 13 6V8" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="13" r="1.5" fill="#8e95a1"/></svg>
            <span className="text-[10px] font-[500] text-[#8e95a1]">Password{"\n"}Requests</span>
          </Link>
        </div>

        {/* Sort By Modal */}
        {showSortModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60" onClick={() => setShowSortModal(false)}>
            <div className="flex flex-col w-[320px] lg:w-[400px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)] p-[24px]" onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-[600] text-[#ed351d] mb-[16px]">Sort By</h3>
              <div className="flex flex-col gap-[12px] mb-[24px]">
                {["Full Name", "Username", "Department", "Staff ID"].map(opt => (
                  <label key={opt} className="flex items-center gap-[12px] cursor-pointer">
                    <div className={`w-[18px] h-[18px] rounded-[3px] border-[1.5px] flex items-center justify-center ${sortBy === opt ? "bg-[#ed351d] border-[#ed351d]" : "border-[#8e95a1]"}`}>
                      {sortBy === opt && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-[14px] font-[400] text-[#5c6470]">{opt}</span>
                  </label>
                ))}
              </div>
              <h3 className="text-[16px] font-[600] text-[#ed351d] mb-[16px]">Order By</h3>
              <div className="flex flex-col gap-[12px] mb-[24px]">
                {["Ascending", "Descending"].map(opt => (
                  <label key={opt} className="flex items-center gap-[12px] cursor-pointer">
                    <div className={`w-[18px] h-[18px] rounded-[3px] border-[1.5px] flex items-center justify-center ${orderBy === opt ? "bg-[#ed351d] border-[#ed351d]" : "border-[#8e95a1]"}`}>
                      {orderBy === opt && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-[14px] font-[400] text-[#5c6470]">{opt}</span>
                  </label>
                ))}
              </div>
              <button onClick={() => setShowSortModal(false)} className="w-full py-[10px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] text-[14px] font-[500] text-[#ffffff]">Save</button>
            </div>
          </div>
        )}

        {/* Confirmation Modals */}
        {confirmAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col items-center w-[360px] lg:w-[440px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)] p-[32px]">
              <div className="w-[56px] h-[56px] rounded-full border-[3px] border-[#ed351d] flex items-center justify-center mb-[20px]">
                <AlertCircle className="w-[28px] h-[28px] text-[#ed351d]" />
              </div>
              <p className="text-[16px] font-[400] text-[#5c6470] text-center mb-[32px]">
                {confirmAction.type === "password" && "Are you sure you want to send\na new password?"}
                {confirmAction.type === "suspend" && "Are you sure you want to\nsuspend this account?"}
                {confirmAction.type === "delete" && "Are you sure you want to\ndelete this account?"}
              </p>
              <div className="flex flex-row items-center justify-between w-full gap-[24px]">
                <button onClick={() => setConfirmAction(null)} className="text-[14px] font-[500] text-[#ed351d] hover:underline">Cancel</button>
                <button onClick={handleConfirmAction} className="flex-1 py-[10px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] text-[14px] font-[500] text-[#ffffff]">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Share Password Modal */}
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col w-[360px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)] relative">
              <button onClick={() => setShowShareModal(false)} className="absolute top-[20px] right-[20px] text-[#8e95a1] hover:text-[#141a1f]">
                <X className="w-[16px] h-[16px]" />
              </button>
              <div className="px-[24px] pt-[24px] pb-[16px]">
                <h3 className="text-[16px] font-[600] leading-[24px] text-[#ed351d]">Share Password</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              <div className="flex flex-row justify-between items-center px-[40px] py-[32px]">
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={() => setShowShareModal(false)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">WhatsApp</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={() => setShowShareModal(false)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Gmail</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={() => setShowShareModal(false)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Copy</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Click away to close menus */}
      {activeMenu && <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)} />}
    </div>
  );
}
