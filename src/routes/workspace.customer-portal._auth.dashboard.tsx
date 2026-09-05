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

  const companyName = currentUser?.department || "Saba Steel";
  const userEmail = currentUser?.email || "logistics@s.steel.com";
  const userInitials = currentUser?.initials || companyName.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  const columns: Column<Trip>[] = [
    { key: "id", header: "Request ID", cell: (r) => <span className="font-medium text-xs">{r.id}</span> },
    { key: "customerConsignee", header: "Consignee", cell: (r) => <span className="text-xs">{r.customerConsignee || "—"}</span> },
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
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">Partner Portal</h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        <div className="flex flex-col px-[40px] py-[32px] flex-1">
          <div className="flex flex-col gap-[8px] mb-[32px]">
            <h2 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Dashboard</h2>
            <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
              TRACK YOUR TRANSPORT REQUESTS AND THEIR CURRENT STATUSES
            </p>
          </div>

          <div className="rounded-[10px] border border-[#e2e5e9] bg-[#ffffff] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] p-4">
            <DataTable
              rows={requests}
              columns={columns}
              pageSize={10}
              searchKeys={(r) => `${r.id} ${r.customerConsignee} ${r.dropoff}`}
              onRowClick={(r) => navigate({ to: "/workspace/customer-portal/$requestId", params: { requestId: r.id } })}
            />
          </div>
        </div>
      </div>

      {showLogout && <div className="fixed inset-0 z-30" onClick={() => setShowLogout(false)} />}
    </div>
  );
}
