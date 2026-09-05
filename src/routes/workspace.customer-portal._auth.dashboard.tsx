import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { tripService, authService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { MoreVertical, Search, ListFilter, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/workspace/customer-portal/_auth/dashboard")({
  component: PartnerPortalDashboard,
});

function PartnerPortalDashboard() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const [requests, setRequests] = useState<Trip[]>([]);
  const [showLogout, setShowLogout] = useState(false);
  
  // Modals state
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState<Trip | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);

  // Filters state (mock for UI)
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"Ascending" | "Descending">("Ascending");

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

  const totalRequests = requests.length;
  const inTransit = requests.filter(r => r.status === "In transit").length;
  const pending = requests.filter(r => r.status === "Pending").length;
  const declined = requests.filter(r => r.status === "Declined").length;
  const completed = requests.filter(r => r.status === "Completed").length;

  return (
    <div className="flex h-screen w-full bg-[#E5E6EB] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-[260px] bg-[#1a232f] h-full shrink-0">
        <div className="pt-[32px] pb-[40px] px-[24px] flex justify-start">
          <img src="/petroline-transparent.png" alt="Petroline Transport Ltd" className="h-[40px] object-contain" />
        </div>
        <div className="flex flex-col flex-1">
          <div className="px-[24px] mb-[16px]">
            <span className="text-[10px] font-[600] tracking-[0.05em] text-[#8e95a1] uppercase">TRANSPORT REQUEST</span>
          </div>
          <div className="flex flex-col gap-1 px-3">
            <Link to="/workspace/customer-portal/dashboard" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] bg-[#e3351d] rounded-md">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
              </svg>
              <span className="text-[13px] font-[500] text-[#ffffff]">Dashboard</span>
            </Link>
            <Link to="/workspace/customer-portal/request" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3V13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 8H13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[13px] font-[400] text-[#ffffff]">New Request</span>
            </Link>
          </div>
        </div>

        <div className="mt-auto pb-[24px]">
          {showLogout && (
            <div className="px-[24px] pb-[12px]">
              <button onClick={handleLogout} className="w-full py-[8px] rounded-[6px] border border-[#e3351d] hover:bg-[#e3351d]/10 transition-colors">
                <span className="text-[13px] font-[500] text-[#e3351d]">Log Out</span>
              </button>
            </div>
          )}
          <div className="px-[24px]">
            <div className="flex flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-[12px]">
                <div className="w-[32px] h-[32px] rounded bg-[#e5e7eb] flex items-center justify-center">
                  <span className="text-[13px] font-[600] text-[#141a1f]">{userInitials}</span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[13px] font-[600] text-[#ffffff]">{companyName}</span>
                  <span className="text-[11px] font-[400] text-[#8e95a1]">{userEmail}</span>
                </div>
              </div>
              <button onClick={() => setShowLogout(!showLogout)}>
                <MoreVertical className="w-[16px] h-[16px] text-[#8e95a1] cursor-pointer hover:text-white transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-auto relative bg-[#f1f2f4]">
        
        {/* Desktop Header */}
        <div className="hidden lg:flex flex-col px-[40px] pt-[32px] pb-[20px] border-b border-[#e2e5e9]">
          <h1 className="text-[24px] font-[500] text-[#141a1f] mb-[4px]">Partner Portal</h1>
          <p className="text-[10px] font-[600] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        <div className="px-[40px] py-[32px] flex flex-col h-full">
          {/* Stats Cards */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-[6px] p-[20px] shadow-sm border border-gray-100 flex flex-col justify-between min-h-[100px]">
              <span className="text-[13px] font-[600] text-[#5c6470]">Total Requests</span>
              <span className="text-[32px] font-[600] text-[#141a1f] leading-none">{totalRequests}</span>
            </div>
            <div className="bg-white rounded-[6px] p-[20px] shadow-sm border border-gray-100 flex flex-col justify-between min-h-[100px]">
              <span className="text-[13px] font-[600] text-[#5c6470]">In transit</span>
              <span className="text-[32px] font-[600] text-[#141a1f] leading-none">{inTransit}</span>
              <span className="text-[10px] font-[500] text-[#34c759] mt-2">Look out for your delivery</span>
            </div>
            <div className="bg-white rounded-[6px] p-[20px] shadow-sm border border-gray-100 flex flex-col justify-between min-h-[100px]">
              <span className="text-[13px] font-[600] text-[#5c6470]">Pending</span>
              <span className="text-[32px] font-[600] text-[#141a1f] leading-none">{pending}</span>
            </div>
            <div className="bg-white rounded-[6px] p-[20px] shadow-sm border border-gray-100 flex flex-col justify-between min-h-[100px]">
              <span className="text-[13px] font-[600] text-[#5c6470]">Declined</span>
              <span className="text-[32px] font-[600] text-[#141a1f] leading-none">{declined}</span>
            </div>
            <div className="bg-white rounded-[6px] p-[20px] shadow-sm border border-gray-100 flex flex-col justify-between min-h-[100px]">
              <span className="text-[13px] font-[600] text-[#5c6470]">Completed</span>
              <span className="text-[32px] font-[600] text-[#141a1f] leading-none">{completed}</span>
            </div>
          </div>

          {/* Table Header Section */}
          <div className="flex flex-col mb-[20px]">
            <div className="flex justify-between items-end mb-[20px]">
              <div className="flex flex-col gap-[4px]">
                <h2 className="text-[20px] font-[500] text-[#141a1f]">Recent Requests</h2>
                <p className="text-[10px] font-[600] tracking-[0.05em] text-[#8e95a1] uppercase">
                  TRACK YOUR TRANSPORT REQUESTS AND THEIR CURRENT STATUSES
                </p>
              </div>
              <Link to="/workspace/customer-portal/request">
                <button className="h-[36px] px-[16px] rounded-[4px] bg-[#e3351d] hover:bg-[#d62e19] transition-colors flex items-center justify-center">
                  <span className="text-[13px] font-[500] text-white">+ Add New Staff Account</span>
                </button>
              </Link>
            </div>

            <div className="flex gap-4 items-center">
              <div className="relative flex-1 max-w-[400px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 h-[40px] border border-gray-300 rounded-[4px] bg-transparent focus:outline-none focus:ring-1 focus:ring-[#e3351d] text-sm"
                />
              </div>
              <button 
                onClick={() => setSortModalOpen(true)}
                className="w-[40px] h-[40px] bg-[#e3351d] rounded-[4px] flex items-center justify-center hover:bg-[#d62e19] transition-colors"
              >
                <ListFilter className="w-4 h-4 text-white" />
              </button>
            </div>
            
            {/* Active Filters Row */}
            <div className="flex gap-2 mt-4">
              <div className="bg-[#e3351d] text-white px-2 py-1 rounded-[4px] flex items-center gap-2 text-[10px] font-semibold">
                ID No. <X className="w-3 h-3 cursor-pointer" />
              </div>
              <div className="bg-[#141a1f] text-white px-2 py-1 rounded-[4px] flex items-center gap-2 text-[10px] font-semibold">
                {sortOrder === "Ascending" ? "Accending" : "Descending"} <X className="w-3 h-3 cursor-pointer" />
              </div>
            </div>
          </div>

          {/* Desktop Table - Custom Implementation to match Figma exactly */}
          <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden shadow-sm">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">ID No.</th>
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">Date</th>
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">Cosignee</th>
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">Product</th>
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">Truck Type</th>
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">Destination</th>
                    <th className="px-6 py-4 text-[13px] font-[600] text-[#141a1f]">Status</th>
                    <th className="px-6 py-4 w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r, i) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-6 py-4 text-[13px] font-[600] text-[#5c6470]">{r.id}</td>
                      <td className="px-6 py-4 text-[13px] text-[#5c6470]">02 Sept 2026</td>
                      <td className="px-6 py-4 text-[13px] text-[#5c6470]">{r.customerConsignee || "Janeth Doe"}</td>
                      <td className="px-6 py-4 text-[13px] text-[#5c6470]">{r.cargo || "Steel"}</td>
                      <td className="px-6 py-4 text-[13px] text-[#5c6470]">{r.tailType || "Flat"}</td>
                      <td className="px-6 py-4 text-[13px] text-[#5c6470]">{r.dropoff || "ABC, Alake Estate"}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-6 py-4 relative">
                        <button onClick={() => setRowMenuOpen(rowMenuOpen === r.id ? null : r.id)} className="p-1 rounded hover:bg-gray-100">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>
                        {rowMenuOpen === r.id && (
                          <div className="absolute right-8 top-10 bg-white border border-gray-100 rounded-md shadow-lg py-2 w-[140px] z-10">
                            <button 
                              onClick={() => { setDetailsModalOpen(r); setRowMenuOpen(null); }}
                              className="w-full text-left px-4 py-2 text-[13px] text-[#5c6470] hover:bg-gray-50 font-medium"
                            >
                              Details
                            </button>
                            <button 
                              onClick={() => { setDeleteModalOpen(r.id); setRowMenuOpen(null); }}
                              className="w-full text-left px-4 py-2 text-[13px] text-[#e3351d] hover:bg-red-50 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* OVERLAYS */}
      {(sortModalOpen || deleteModalOpen || detailsModalOpen) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          
          {/* SORT MODAL */}
          {sortModalOpen && (
            <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] overflow-hidden">
              <div className="p-6">
                <h3 className="text-[#e3351d] text-[15px] font-[600] mb-4">Sort By</h3>
                <div className="flex flex-col gap-3 mb-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">ID No.</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">Date</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">Product</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">Truck Type</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">Status</span>
                  </label>
                </div>
                
                <div className="h-px bg-gray-100 w-full mb-6"></div>
                
                <h3 className="text-[#e3351d] text-[15px] font-[600] mb-4">Order By</h3>
                <div className="flex flex-col gap-3 mb-8">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">Ascending</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#e3351d] focus:ring-[#e3351d]" />
                    <span className="text-[13px] font-[500] text-[#5c6470]">Descending</span>
                  </label>
                </div>
                
                <div className="flex justify-end">
                  <button 
                    onClick={() => setSortModalOpen(false)}
                    className="h-[40px] px-[24px] bg-[#e3351d] hover:bg-[#d62e19] text-white rounded-[4px] text-[13px] font-[500]"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DELETE CONFIRMATION MODAL */}
          {deleteModalOpen && (
            <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] p-8 flex flex-col items-center text-center">
              <div className="w-[60px] h-[60px] mb-6 flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-[#e3351d]" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] text-[#5c6470] font-[500] mb-8 max-w-[200px]">
                Are you sure you want to delete this account?
              </p>
              <div className="flex gap-4 w-full justify-center">
                <button 
                  onClick={() => setDeleteModalOpen(null)}
                  className="h-[40px] px-8 bg-transparent text-[#e3351d] font-[500] text-[14px]"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setDeleteModalOpen(null)}
                  className="h-[40px] px-8 bg-[#e3351d] text-white rounded-[4px] font-[500] text-[14px] hover:bg-[#d62e19]"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* REQUEST DETAILS MODAL */}
          {detailsModalOpen && (
            <div className="bg-white rounded-lg shadow-xl w-full max-w-[600px] overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-[20px] font-[600] text-[#141a1f]">Request Details</h2>
                  <StatusBadge status={detailsModalOpen.status} />
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-[600] text-[#141a1f]">ID No.</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      {detailsModalOpen.id}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-[600] text-[#141a1f]">Date</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      02-09-2026
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 col-span-2">
                    <label className="text-[13px] font-[600] text-[#141a1f]">Cosignee</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      {detailsModalOpen.customerConsignee || "Janeth Doe"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-[600] text-[#141a1f]">Product</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      {detailsModalOpen.cargo || "Steel"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-[600] text-[#141a1f]">Truck Type</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      {detailsModalOpen.tailType || "Flat"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 col-span-2">
                    <label className="text-[13px] font-[600] text-[#141a1f]">Destination</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      {detailsModalOpen.dropoff || "ABC, Alake Estate"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 col-span-2 mb-4">
                    <label className="text-[13px] font-[600] text-[#141a1f]">Loading Site(s)</label>
                    <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470]">
                      {detailsModalOpen.pickup || "Babangida; Happy Home"}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                  <button 
                    onClick={() => setDetailsModalOpen(null)}
                    className="text-[#e3351d] text-[14px] font-[500] px-4 hover:underline"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => setDetailsModalOpen(null)}
                    className="h-[40px] px-6 bg-[#e3351d] hover:bg-[#d62e19] text-white rounded-[4px] text-[14px] font-[500]"
                  >
                    Delete Request
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
