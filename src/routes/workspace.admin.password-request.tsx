import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MoreVertical, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import type { User } from "@/lib/fleetopsx/types";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/admin/password-request")({
  component: AdminPasswordRequest,
});

interface PasswordRequest {
  id: string;
  userId: string;
  name: string;
  department: string;
  staffId: string;
  username: string;
  date: string;
  status: "Pending" | "Approved" | "Declined";
}

function AdminPasswordRequest() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [requests, setRequests] = useState<PasswordRequest[]>([]);

  useEffect(() => {
    void adminService.users().then((users: User[]) => {
      // Build password requests from live user data
      // Users with passwordResetRequired are Pending, others get mixed statuses for demo
      const statuses: Array<"Pending" | "Approved" | "Declined"> = ["Pending", "Approved", "Declined", "Approved"];
      const reqs = users.slice(0, Math.max(4, users.filter(u => u.passwordResetRequired).length)).map((u, i) => ({
        id: `PWR-${String(i + 1).padStart(3, "0")}`,
        userId: u.id,
        name: u.name,
        department: u.department || "Fleet Operation",
        staffId: `ID:${u.id}`,
        username: u.username || u.name.split(" ").map(p => p[0]).join(""),
        date: "31st Aug 2026",
        status: u.passwordResetRequired ? "Pending" as const : (statuses[i % statuses.length] || "Approved" as const),
      }));
      setRequests(reqs);
    });
  }, []);

  const handleAction = (id: string, action: "Approved" | "Declined") => {
    setActiveMenu(null);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: action } : r));
    const req = requests.find(r => r.id === id);
    if (action === "Approved" && req) {
      void adminService.resetPassword(req.userId);
      toast.success(`Password reset approved for ${req.name}.`);
    } else if (action === "Declined" && req) {
      toast.warning(`Password reset declined for ${req.name}.`);
    }
  };

  const statusColor = (status: string) => {
    if (status === "Pending") return "bg-[#f97316]";
    if (status === "Approved") return "bg-[#22c55e]";
    if (status === "Declined") return "bg-[#ed351d]";
    return "bg-[#8e95a1]";
  };

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Desktop Sidebar */}
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

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
          <div className="flex flex-col gap-[4px] lg:gap-[8px] mb-[24px] lg:mb-[32px]">
            <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f]">Manage Password Request</h2>
            <p className="text-[12px] font-[400] lg:font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] lg:uppercase">
              Approve or decline password requests
            </p>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:flex flex-col w-full gap-[8px]">
            {requests.map((req) => (
              <div key={req.id} className="flex flex-row items-center w-full px-[24px] py-[20px] rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] hover:shadow-sm transition-shadow relative">
                <div className="flex-1 min-w-[140px]">
                  <span className="text-[14px] font-[400] text-[#5c6470]">{req.name}</span>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <span className="text-[14px] font-[400] text-[#5c6470]">{req.department}</span>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <span className="text-[14px] font-[400] text-[#5c6470]">{req.staffId}</span>
                </div>
                <div className="flex-1 min-w-[100px]">
                  <span className="text-[14px] font-[400] text-[#5c6470]">{req.username}</span>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <span className="text-[14px] font-[400] text-[#5c6470]">{req.date}</span>
                </div>
                <div className="w-[120px] flex items-center justify-end gap-[8px] relative">
                  <button onClick={() => setActiveMenu(activeMenu === req.id ? null : req.id)} className="w-[32px] h-[32px] flex items-center justify-center rounded-[4px] hover:bg-[#e2e5e9] transition-colors">
                    <MoreVertical className="w-[16px] h-[16px] text-[#141a1f]" />
                  </button>
                  <div className={`flex items-center justify-center py-[4px] px-[12px] rounded-full ${statusColor(req.status)}`}>
                    <span className="text-[11px] font-[500] text-[#ffffff]">{req.status}</span>
                  </div>
                  {activeMenu === req.id && req.status === "Pending" && (
                    <div className="absolute top-[36px] right-0 z-40 w-[150px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                      <button onClick={() => handleAction(req.id, "Approved")} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Approve</button>
                      <button onClick={() => handleAction(req.id, "Declined")} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Decline</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Card List */}
          <div className="flex lg:hidden flex-col gap-[12px]">
            {requests.map((req) => (
              <div key={req.id} className="flex flex-col rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] px-[16px] py-[16px] relative">
                <div className="flex flex-row items-start justify-between mb-[4px]">
                  <span className="text-[12px] font-[400] text-[#8e95a1]">{req.date}</span>
                  <div className="flex items-center gap-[8px]">
                    <div className={`flex items-center justify-center py-[4px] px-[12px] rounded-full ${statusColor(req.status)}`}>
                      <span className="text-[11px] font-[500] text-[#ffffff]">{req.status}</span>
                    </div>
                    <button onClick={() => setActiveMenu(activeMenu === req.id ? null : req.id)} className="p-[4px]">
                      <MoreVertical className="w-[16px] h-[16px] text-[#141a1f]" />
                    </button>
                  </div>
                </div>
                <span className="text-[16px] font-[600] leading-[24px] text-[#141a1f] mb-[8px]">{req.name}</span>
                <div className="flex flex-col gap-[4px]">
                  <div className="flex flex-row items-center gap-[8px]">
                    <span className="text-[13px] font-[500] text-[#8e95a1] w-[90px]">Department:</span>
                    <span className="text-[13px] font-[400] text-[#5c6470]">{req.department}</span>
                  </div>
                  <div className="flex flex-row items-center gap-[8px]">
                    <span className="text-[13px] font-[500] text-[#8e95a1] w-[90px]">Staff ID:</span>
                    <span className="text-[13px] font-[400] text-[#ed351d]">{req.staffId}</span>
                  </div>
                  <div className="flex flex-row items-center gap-[8px]">
                    <span className="text-[13px] font-[500] text-[#8e95a1] w-[90px]">Username:</span>
                    <span className="text-[13px] font-[400] text-[#5c6470]">{req.username}</span>
                  </div>
                </div>
                {/* Mobile Action Menu */}
                {activeMenu === req.id && req.status === "Pending" && (
                  <div className="absolute top-[40px] right-[16px] z-40 w-[150px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                    <button onClick={() => handleAction(req.id, "Approved")} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Approve</button>
                    <button onClick={() => handleAction(req.id, "Declined")} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9]">Decline</button>
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
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 14C13 11.79 11.21 10 9 10C6.79 10 5 11.79 5 14" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="6" r="3" stroke="#8e95a1" strokeWidth="1.5"/></svg>
            <span className="text-[10px] font-[500] text-[#8e95a1]">Manage{"\n"}Account</span>
          </Link>
          <Link to="/workspace/admin/password-request" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="12" height="9" rx="2" stroke="#141a1f" strokeWidth="1.5"/><path d="M7 8V6C7 4.34 8.34 3 10 3C11.66 3 13 4.34 13 6V8" stroke="#141a1f" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="13" r="1.5" fill="#141a1f"/></svg>
            <span className="text-[10px] font-[600] text-[#141a1f]">Password{"\n"}Requests</span>
            <div className="w-[40px] h-[2px] bg-[#141a1f] rounded-full"></div>
          </Link>
        </div>
      </div>

      {/* Click away to close menus */}
      {activeMenu && <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)} />}
    </div>
  );
}
