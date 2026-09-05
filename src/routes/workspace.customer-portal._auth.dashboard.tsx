import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { tripService, authService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { MoreVertical } from "lucide-react";

export const Route = createFileRoute("/workspace/customer-portal/_auth/dashboard")({
  component: SisterCompanyDashboard,
});

function SisterCompanyDashboard() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const [requests, setRequests] = useState<Trip[]>([]);
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    tripService.list().then((allTrips) => {
      setRequests(allTrips.filter((t) => t.customer === "Customer Portal"));
    });
  }, []);

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/workspace/customer-portal/login" });
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const companyName = mounted && currentUser?.department ? currentUser.department : "Saba Steel";
  const userEmail = mounted && currentUser?.email ? currentUser.email : "logistics@s.steel.com";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "SS";

  const columns: Column<Trip>[] = [
    { key: "id", header: "Request ID", cell: (r) => <span className="font-medium text-xs">{r.id}</span> },
    { key: "customerConsignee", header: "Customer Name", cell: (r) => <span className="text-xs">{r.customerConsignee || "—"}</span> },
    { key: "pickup", header: "Pickup", cell: (r) => <span className="text-xs">{r.loadingSite && r.loadingSite.length > 1 ? `${r.loadingSite.length} Sites` : (r.pickup || "—")}</span> },
    { key: "dropoff", header: "Destination", cell: (r) => <span className="text-xs">{r.dropoff}</span> },
    { key: "tailType", header: "Tail Type", cell: (r) => <span className="text-xs">{r.tailType || "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-[260px] bg-[#1B2432] h-full shrink-0">
        <div className="pt-[24px] pb-[32px] px-[24px] flex justify-center border-b border-[#ffffff]/5">
          <img src="/petroline-transparent.png" alt="Petroline Transport Ltd" className="w-[140px] h-[48px] object-contain" />
        </div>
        <div className="flex flex-col flex-1 py-[24px]">
          <div className="px-[24px] mb-[12px]">
            <span className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">TRANSPORT REQUEST</span>
          </div>
          <div className="flex flex-col">
            <Link to="/workspace/customer-portal/dashboard" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] bg-[#ed351d]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
              </svg>
              <span className="text-[14px] font-[500] leading-[16.94px] text-[#ffffff]">Dashboard</span>
            </Link>
            <Link to="/workspace/customer-portal/request" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3V13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 8H13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">New Request</span>
            </Link>
          </div>
        </div>

        <div className="mt-auto">
          {showLogout && (
            <div className="px-[24px] pb-[12px]">
              <button onClick={handleLogout} className="flex flex-row items-center justify-center w-full py-[10px] rounded-[8px] border-[1px] border-[#ed351d] hover:bg-[#ed351d]/10 transition-colors">
                <span className="text-[14px] font-[500] text-[#ed351d]">Log Out</span>
              </button>
            </div>
          )}
          <div className="p-[24px] border-t border-[#ffffff]/5">
            <div className="flex flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-[12px]">
                <div className="w-[32px] h-[32px] rounded-[4px] bg-[#e2e5e9] flex items-center justify-center">
                  <span className="text-[14px] font-[600] text-[#141a1f]">{userInitials}</span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[14px] font-[600] leading-[16.94px] text-[#ffffff]">{companyName}</span>
                  <span className="text-[12px] font-[400] leading-[14.52px] text-[#8e95a1]">{userEmail}</span>
                </div>
              </div>
              <button onClick={() => setShowLogout(!showLogout)}>
                <MoreVertical className="w-[16px] h-[16px] text-[#8e95a1] cursor-pointer" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-auto relative pb-[80px] lg:pb-0">
        
        {/* Mobile Header */}
        <div className="flex lg:hidden flex-row items-center justify-between px-[16px] py-[16px] bg-[#1B2432]">
          <div className="flex items-center gap-[12px]">
            <span className="text-[16px] font-[500] text-[#ffffff]">Partner Portal</span>
          </div>
          <button onClick={() => setShowLogout(!showLogout)} className="w-[32px] h-[32px] rounded-full bg-[#ed351d] flex items-center justify-center relative">
            <span className="text-[12px] font-[600] text-[#ffffff]">{userInitials}</span>
          </button>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">Partner Portal</h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        <div className="flex flex-col px-[16px] lg:px-[40px] py-[24px] lg:py-[32px] flex-1">
          <div className="flex flex-row items-start justify-between mb-[24px] lg:mb-[32px]">
            <div className="flex flex-col gap-[8px]">
              <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f]">Dashboard</h2>
              <p className="text-[12px] font-[400] lg:font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
                TRACK YOUR TRANSPORT REQUESTS AND THEIR CURRENT STATUSES
              </p>
            </div>
            <Link to="/workspace/customer-portal/request" className="hidden lg:flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors">
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">+ New Request</span>
            </Link>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block rounded-[10px] border border-[#e2e5e9] bg-[#ffffff] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] p-4">
            <DataTable
              rows={requests}
              columns={columns}
              pageSize={10}
              searchKeys={(r) => `${r.id} ${r.customerConsignee} ${r.dropoff}`}
              onRowClick={(r) => navigate({ to: "/workspace/customer-portal/$requestId", params: { requestId: r.id } })}
            />
          </div>

          {/* Mobile Card List */}
          <div className="flex lg:hidden flex-col gap-[12px]">
            {requests.length === 0 ? (
              <div className="text-center py-8 text-[#8e95a1] text-[14px]">No requests found.</div>
            ) : (
              requests.map((req) => (
                <div 
                  key={req.id} 
                  className="flex flex-col rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] px-[16px] py-[16px] relative cursor-pointer hover:border-[#ed351d] transition-colors"
                  onClick={() => navigate({ to: "/workspace/customer-portal/$requestId", params: { requestId: req.id } })}
                >
                  <div className="flex flex-row items-center justify-between mb-[12px]">
                    <span className="text-[14px] font-[600] text-[#141a1f]">{req.id}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  
                  <div className="flex flex-col gap-[8px]">
                    <div className="flex flex-row items-start justify-between">
                      <div className="flex flex-col flex-1">
                        <span className="text-[11px] font-[500] text-[#8e95a1] uppercase mb-[2px]">Customer Name</span>
                        <span className="text-[14px] font-[500] text-[#141a1f]">{req.customerConsignee || "—"}</span>
                      </div>
                      <div className="flex flex-col flex-1">
                        <span className="text-[11px] font-[500] text-[#8e95a1] uppercase mb-[2px]">Asset Type</span>
                        <span className="text-[14px] font-[500] text-[#141a1f]">{req.tailType || "—"}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-row items-center gap-[12px] mt-[4px]">
                      <div className="flex flex-col items-center gap-[4px] mt-[4px]">
                        <div className="w-[8px] h-[8px] rounded-full border-[2px] border-[#141a1f]"></div>
                        <div className="w-[2px] h-[16px] bg-[#e2e5e9]"></div>
                        <div className="w-[8px] h-[8px] rounded-full bg-[#ed351d]"></div>
                      </div>
                      <div className="flex flex-col justify-between h-[44px]">
                        <span className="text-[13px] font-[400] text-[#5c6470]">{req.loadingSite && req.loadingSite.length > 1 ? `${req.loadingSite.length} Sites` : (req.pickup || "—")}</span>
                        <span className="text-[13px] font-[400] text-[#5c6470]">{req.dropoff}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Mobile Floating Action Button */}
        <Link 
          to="/workspace/customer-portal/request" 
          className="lg:hidden fixed bottom-[24px] right-[24px] w-[56px] h-[56px] rounded-full bg-[#ed351d] shadow-[0px_4px_16px_rgba(237,53,29,0.4)] flex items-center justify-center z-40"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        
        {/* Mobile Logout Dropdown */}
        {showLogout && (
          <div className="lg:hidden fixed top-[60px] right-[16px] z-50 w-[160px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] p-[8px]">
            <button onClick={handleLogout} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[500] text-[#ed351d] hover:bg-[#f6f7f9] rounded-[4px]">Log Out</button>
          </div>
        )}
      </div>

      {showLogout && <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setShowLogout(false)} />}
    </div>
  );
}
