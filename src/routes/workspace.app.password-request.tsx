import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MoreVertical, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import type { User } from "@/lib/fleetopsx/types";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/app/password-request")({
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
    <>
      <div className="w-full max-w-[1000px]">
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


      {/* Click away to close menus */}
      {activeMenu && <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)} />}
    </>
  );
}
