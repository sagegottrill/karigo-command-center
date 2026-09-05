import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, MoreVertical, X, ArrowLeft, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import type { User } from "@/lib/fleetopsx/types";
import { toast } from "sonner";

import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/workspace/app/manage-account")({
  component: AdminManageAccount,
});

function AdminManageAccount() {
  const [users, setUsers] = useState<User[]>([]);
  const currentUser = authService.getCurrentUser();
  const navigate = useNavigate();

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{ type: "password" | "suspend" | "delete"; userId: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    void adminService.users().then(setUsers);
  }, []);

  const filtered = users.filter(u => u.status !== "Deleted");

  const columns: Column<User>[] = [
    { key: "sn", header: "S/N", cell: (_, i) => <span className="text-[14px] font-[400] text-[#5c6470]">{i + 1}</span> },
    { key: "name", header: "Name", sortValue: (r) => r.name, cell: (r) => r.name },
    { key: "dept", header: "Department", sortValue: (r) => r.department, cell: (r) => r.department },
    { key: "id", header: "Staff ID", sortValue: (r) => r.id, cell: (r) => <span className="text-[#5c6470]">ID:{r.id}</span> },
    { key: "user", header: "Username", sortValue: (r) => r.username, cell: (r) => r.username },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "actions", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); handleAction("password", r.id); }}>Reset Password</Button>
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); handleAction("suspend", r.id); }}>Suspend</Button>
      </div>
    )},
  ];

  const handleAction = (type: "password" | "suspend" | "delete", userId: string) => {
    setConfirmAction({ type, userId });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "password") {
      await adminService.resetPassword(confirmAction.userId);
      toast.success("Password reset initiated. User must change password on next login.");
      setConfirmAction(null);
      setShowShareModal(true);
    } else if (confirmAction.type === "suspend") {
      await adminService.suspendUser(confirmAction.userId);
      toast.warning("Account suspended.");
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    } else if (confirmAction.type === "delete") {
      await adminService.deleteUser(confirmAction.userId);
      toast.error("Account deleted (soft).");
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    }
  };

  const shareText = `Hello,\n\nYour account password has been reset for the Transport Manager Portal.\nPlease check your email or contact your administrator for the temporary password.\nLogin at: ${window.location.origin}`;

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
    setShowShareModal(false);
  };

  const handleShareEmail = () => {
    window.open(`mailto:?subject=Password Reset&body=${encodeURIComponent(shareText)}`, "_blank");
    setShowShareModal(false);
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(shareText);
    toast.success("Details copied to clipboard");
    setShowShareModal(false);
  };



  const exportCSV = () => {
    const headers = "S/N,Name,Department,Staff ID,Username,Status\n";
    const csv = filtered.map((u, i) => `${i + 1},${u.name},${u.department},${u.id},${u.username},${u.status}`).join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff_accounts.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  return (

          {/* Mobile Card List */}
          <div className="flex lg:hidden flex-col gap-[12px]">
            {paginatedUsers.map((account, index) => (
              <div key={account.id} className="flex flex-col rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] px-[16px] py-[16px] relative">
                <div className="flex flex-row items-start justify-between mb-[8px]">
                  <span className="text-[12px] font-[400] text-[#8e95a1]">#{((page - 1) * pageSize) + index + 1}</span>
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
                    <button onClick={() => handleAction("view", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">View</button>
                    <button onClick={() => handleAction("password", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Reset Password</button>
                    <button onClick={() => handleAction("suspend", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Suspend</button>
                    <button onClick={() => handleAction("delete", account.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#ed351d] hover:bg-[#f6f7f9]">Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination UI Mobile */}
          {pageCount > 1 && (
            <div className="flex lg:hidden flex-row items-center justify-between mt-[24px]">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-[12px] py-[6px] rounded-[4px] border border-[#e2e5e9] disabled:opacity-50">Prev</button>
              <span className="text-[14px] font-[500] text-[#141a1f]">{page} / {pageCount}</span>
              <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="px-[12px] py-[6px] rounded-[4px] border border-[#e2e5e9] disabled:opacity-50">Next</button>
            </div>
          )}
        </div>

        {/* Mobile Bottom Nav */}
        <div className="fixed bottom-0 left-0 right-0 flex lg:hidden flex-row items-center justify-around bg-[#ffffff] border-t border-[#e2e5e9] py-[10px] z-30">
          <Link to="/workspace/app/add-account" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 4V16M4 10H16" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span className="text-[10px] font-[500] text-[#8e95a1]">New{"\n"}Account</span>
          </Link>
          <Link to="/workspace/app/manage-account" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 14C13 11.79 11.21 10 9 10C6.79 10 5 11.79 5 14" stroke="#141a1f" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="6" r="3" stroke="#141a1f" strokeWidth="1.5"/><path d="M15 10L17 12L15 14" stroke="#141a1f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="text-[10px] font-[600] text-[#141a1f]">Manage{"\n"}Account</span>
            <div className="w-[40px] h-[2px] bg-[#141a1f] rounded-full"></div>
          </Link>
          <Link to="/workspace/app/password-request" className="flex flex-col items-center gap-[4px]">
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
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareWhatsApp}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">WhatsApp</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareEmail}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Gmail</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleCopyLink}>
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
