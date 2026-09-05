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
    {
      key: "actions", header: "", align: "right", cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); handleAction("password", r.id); }}>Reset Password</Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); handleAction("suspend", r.id); }}>Suspend</Button>
        </div>
      )
    },
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
    <>
      <PageHeader
        title="Transport Manager Portal"
        description="Manage the lifecycle of every account within the company to maintain data integrity."
        actions={
          <>
            <Button size="sm" variant="outline" className="h-10 text-[14px]" onClick={exportCSV}>
              Export CSV
            </Button>
            <Button asChild size="sm" className="h-10 bg-[#ed351d] hover:bg-[#d62e19] text-[14px]">
              <Link to="/workspace/app/add-account">+ Add New Staff Account</Link>
            </Button>
          </>
        }
      />

      <SectionPanel title="Manage Staff Account" description="Manage listing of internal company staff" bodyClassName="p-0 mt-4">
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(r) => `${r.name} ${r.username} ${r.id} ${r.department}`}
          pageSize={10}
        />
      </SectionPanel>

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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#141a1f" /></svg>
                <span className="text-[12px] font-[500] text-[#5c6470]">WhatsApp</span>
              </div>
              <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareEmail}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141a1f" /></svg>
                <span className="text-[12px] font-[500] text-[#5c6470]">Gmail</span>
              </div>
              <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleCopyLink}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#141a1f" /></svg>
                <span className="text-[12px] font-[500] text-[#5c6470]">Copy</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
