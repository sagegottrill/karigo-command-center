import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip, TimelineStep } from "@/lib/fleetopsx/types";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { ArrowLeft, MapPin, Navigation, Pencil, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/$requestId")({
  component: RequestTrackingPage,
});

function RequestTrackingPage() {
  const { requestId } = Route.useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    tripService.get(requestId).then((t) => {
      setTrip(t);
      if (t) setTimeline(tripService.timeline(t));
    });
  }, [requestId]);

  if (!trip) return <div className="p-12 text-center text-[#5c6470]">Loading request details...</div>;

  const isPending = trip.status === "Requested" || trip.status === "Pending" || trip.status === "Scheduled";

  return (
    <div className="flex flex-col h-screen overflow-auto bg-[#f1f2f4] font-['Inter',sans-serif]">
      {/* Mobile Header */}
      <div className="flex lg:hidden flex-row items-center justify-between px-[16px] py-[16px] bg-[#1a232f] shrink-0">
        <span className="text-[18px] font-[600] text-[#ffffff]">Partner Dashboard</span>
        <button className="w-[36px] h-[36px] rounded-[6px] bg-[#e3351d] flex items-center justify-center relative">
          <span className="text-[13px] font-[600] text-[#ffffff]">SS</span>
        </button>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-white border-b border-[#e2e5e9] px-[40px] pt-[32px] pb-[20px] shrink-0">
        <h1 className="text-[24px] font-[500] text-[#141a1f] mb-[4px]">Partner Dashboard</h1>
      </div>

      <div className="px-[16px] lg:px-[40px] py-[24px] lg:py-[32px] max-w-[1200px] w-full mx-auto flex flex-col gap-4 lg:gap-6">
        
        {/* Breadcrumb & Actions */}
        <div>
          <Link to="/workspace/customer-portal/dashboard" className="inline-flex items-center gap-2 text-[14px] lg:text-[13px] font-[500] text-[#5c6470] hover:text-[#141a1f] transition-colors mb-4 lg:mb-6">
            <ArrowLeft className="w-5 h-5 lg:w-4 lg:h-4" /> Back to Dashboard
          </Link>

          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
            <h2 className="text-[24px] font-[600] text-[#141a1f]">Ticket {trip.id}</h2>
            <div className="flex items-center gap-2 lg:gap-4 flex-wrap">
              {trip.status !== 'In transit' && trip.status !== 'Completed' && (
                <button 
                  onClick={() => setIsModifyModalOpen(true)}
                  className="flex items-center gap-2 px-3 lg:px-4 h-[40px] text-[13px] font-[600] text-[#141a1f] bg-transparent hover:bg-gray-100 rounded-[4px] transition-colors lg:border lg:border-gray-200"
                >
                  <Pencil className="w-4 h-4" /> Modify
                </button>
              )}
              <button className="flex items-center gap-2 px-3 lg:px-4 h-[40px] bg-[#141a1f] text-white text-[13px] font-[500] rounded-[4px] hover:bg-black transition-colors shadow-sm">
                <Upload className="w-4 h-4" /> Export CVS
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-[40px] h-[40px] flex items-center justify-center text-[#e3351d] hover:bg-red-50 rounded-[4px] transition-colors lg:border lg:border-gray-200"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* 1. Request Details */}
          <div className="bg-white rounded-[10px] p-6 border border-[#e2e5e9] shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[18px] font-[600] text-[#141a1f]">Request Details</h3>
              {trip.status === 'Pending' ? (
                 <div className="bg-[#ffcc00] text-white text-[11px] font-[600] px-3 py-1 rounded-[4px]">Pending</div>
              ) : trip.status === 'In transit' ? (
                 <div className="bg-[#ba24d5] text-white text-[11px] font-[600] px-3 py-1 rounded-[4px]">In Transit</div>
              ) : (
                 <StatusBadge status={trip.status} />
              )}
            </div>
            
            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 lg:col-span-2">
                <label className="text-[12px] lg:text-[13px] font-[500] lg:font-[600] text-[#5c6470] lg:text-[#141a1f]">Customer Name</label>
                <div className="h-[40px] lg:h-[44px] bg-[#f1f2f4] rounded-[4px] px-3 lg:px-4 flex items-center text-[13px] text-[#141a1f] lg:text-[#5c6470] border border-transparent">
                  {trip.customerConsignee || "Janeth Doe"}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] lg:text-[13px] font-[500] lg:font-[600] text-[#5c6470] lg:text-[#141a1f]">Product</label>
                <div className="h-[40px] lg:h-[44px] bg-[#f1f2f4] rounded-[4px] px-3 lg:px-4 flex items-center text-[13px] text-[#141a1f] lg:text-[#5c6470] border border-transparent">
                  {trip.cargo || "Steel"}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] lg:text-[13px] font-[500] lg:font-[600] text-[#5c6470] lg:text-[#141a1f]">Truck Type</label>
                <div className="h-[40px] lg:h-[44px] bg-[#f1f2f4] rounded-[4px] px-3 lg:px-4 flex items-center text-[13px] text-[#141a1f] lg:text-[#5c6470] border border-transparent">
                  {trip.tailType || "Flat"}
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:col-span-2">
                <label className="text-[12px] lg:text-[13px] font-[500] lg:font-[600] text-[#5c6470] lg:text-[#141a1f]">Destination</label>
                <div className="h-[40px] lg:h-[44px] bg-[#f1f2f4] rounded-[4px] px-3 lg:px-4 flex items-center text-[13px] text-[#141a1f] lg:text-[#5c6470] border border-transparent">
                  {trip.dropoff || "ABC, Alake Estate"}
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:col-span-2">
                <label className="text-[12px] lg:text-[13px] font-[500] lg:font-[600] text-[#5c6470] lg:text-[#141a1f]">Loading Site(s)</label>
                <div className="flex flex-col gap-2">
                  <div className="h-[40px] lg:h-[44px] bg-[#f1f2f4] rounded-[4px] px-3 lg:px-4 flex items-center text-[13px] text-[#141a1f] lg:text-[#5c6470] border border-transparent">
                    Babangida
                  </div>
                  <div className="h-[40px] lg:h-[44px] bg-[#f1f2f4] rounded-[4px] px-3 lg:px-4 flex items-center text-[13px] text-[#141a1f] lg:text-[#5c6470] border border-transparent">
                    Happy Home
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Real-Time Tracking */}
          <div className="bg-white rounded-[10px] border border-[#e2e5e9] shadow-sm flex flex-col overflow-hidden h-[300px] lg:h-full lg:min-h-[500px]">
            <div className="p-4 lg:p-6 border-b border-[#e2e5e9] shrink-0 bg-white z-10">
              <h3 className="text-[16px] lg:text-[18px] font-[600] text-[#141a1f]">Real-time Tracking</h3>
            </div>
            
            <div className="flex-1 relative flex flex-col bg-white">
              {isPending ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-white">
                  <h4 className="text-[14px] font-[600] text-[#5c6470] mb-2">Awaiting Assignment</h4>
                  <p className="text-[12px] text-[#a0a6b1] max-w-[280px]">
                    Live tracking will begin once a truck has been assigned and the request is approved.
                  </p>
                </div>
              ) : (
                <div className="absolute inset-0 w-full h-full bg-[#f8f9fa] overflow-hidden">
                  {/* Subtle map pattern instead of full map to look clean */}
                  <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <div className="relative h-[300px] w-full max-w-[400px]">
                        <svg className="absolute inset-0 h-full w-full" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
                          <path d="M 50,250 C 100,200 200,250 250,150 C 300,50 350,100 380,50" fill="none" stroke="#e3351d" strokeWidth="4" strokeDasharray="8 4" className="animate-[dash_20s_linear_infinite]" />
                        </svg>
                        <div className="absolute bottom-10 left-10 flex -translate-x-1/2 translate-y-1/2 flex-col items-center gap-1">
                          <div className="rounded border border-black/10 bg-white px-2 py-1 text-[10px] font-bold shadow-sm">{trip.pickup.split(',')[0]}</div>
                          <div className="h-3 w-3 rounded-full border-2 border-white bg-black shadow-sm" />
                        </div>
                        <div className="absolute right-5 top-12 flex -translate-x-1/2 translate-y-1/2 flex-col items-center gap-1">
                          <div className="rounded bg-[#141a1f] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm mb-1">{trip.dropoff.split(',')[0]}</div>
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-[#2081e2] shadow-sm ring-4 ring-[#e5f0fa]">
                            <MapPin className="h-4 w-4 text-white fill-white" />
                          </div>
                        </div>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Assignment Details */}
          <div className="bg-white rounded-[10px] p-6 border border-[#e2e5e9] shadow-sm flex flex-col">
            <h3 className="text-[18px] font-[600] text-[#141a1f] mb-6">Assignment Details</h3>
            
            {isPending ? (
              <div className="flex-1 flex items-center justify-center min-h-[250px] border-t border-gray-100">
                <p className="text-[13px] text-[#8e95a1] italic text-center max-w-[200px]">
                  Awaiting Transport Manager approval and assignment.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 border-b border-gray-100 pb-4">
                  <label className="text-[13px] font-[600] text-[#141a1f]">Driver Name</label>
                  <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470] border border-transparent">
                    {trip.driverName || "Janeth Doe"}
                  </div>
                </div>
                <div className="flex flex-col gap-2 pb-4">
                  <label className="text-[13px] font-[600] text-[#141a1f]">Driver Phone Number</label>
                  <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470] border border-transparent">
                    Steel
                  </div>
                </div>
                <div className="flex flex-col gap-2 pb-4">
                  <label className="text-[13px] font-[600] text-[#141a1f]">Truck Head</label>
                  <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470] border border-transparent">
                    Flat
                  </div>
                </div>
                <div className="flex flex-col gap-2 pb-4">
                  <label className="text-[13px] font-[600] text-[#141a1f]">Truck Tail (Type)</label>
                  <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470] border border-transparent">
                    ABC, Alake Estate
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-[600] text-[#141a1f]">Serial Number</label>
                  <div className="h-[44px] bg-[#f1f2f4] rounded-[4px] px-4 flex items-center text-[13px] text-[#5c6470] border border-transparent">
                    ABC, Alake Estate
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Request Timeline */}
          <div className="bg-white rounded-[10px] p-6 border border-[#e2e5e9] shadow-sm">
            <h3 className="text-[18px] font-[600] text-[#141a1f] mb-6">Request Timeline</h3>
            
            <div className="ml-4 pl-6 border-l border-[#e2e5e9] space-y-8 py-2 relative">
              {timeline.map((step, i) => {
                // Determine if this step is active/completed
                const isActive = step.state === "current" || step.state === "done";
                
                return (
                  <div key={i} className="relative flex flex-col justify-center min-h-[30px]">
                    {/* Circle Indicator */}
                    <div className="absolute -left-[32px] bg-white pt-1">
                      {isActive ? (
                        <div className="w-[13px] h-[13px] rounded-full bg-white border-[2px] border-[#e3351d] shadow-[0_0_0_3px_white] relative">
                          {step.state === "current" && (
                            <div className="w-[5px] h-[5px] rounded-full bg-[#e3351d] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                          )}
                        </div>
                      ) : (
                        <div className="w-[13px] h-[13px] rounded-full bg-white border-[2px] border-[#e2e5e9] shadow-[0_0_0_3px_white]" />
                      )}
                    </div>
                    
                    {/* Step Label */}
                    <span className={cn(
                      "text-[14px] font-[600] leading-none",
                      isActive ? "text-[#e3351d]" : "text-[#d1d5db]"
                    )}>
                      {step.label}
                    </span>
                    
                    {/* Optional Timestamp */}
                    {step.at && isActive && (
                      <span className="text-[11px] font-[500] text-[#a0a6b1] mt-1">
                        {step.at}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* MODIFY MODAL */}
      {isModifyModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end lg:items-center justify-center lg:p-4">
          <div className="bg-white rounded-t-[16px] lg:rounded-[10px] shadow-xl w-full max-w-[500px] overflow-hidden flex flex-col">
            <div className="p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[18px] font-[600] text-[#141a1f]">Request Details</h3>
                <div className="bg-[#ffcc00] text-white text-[11px] font-[600] px-3 py-1 rounded-[4px]">Pending</div>
              </div>

              <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 lg:col-span-2">
                  <label className="text-[12px] font-[500] text-[#5c6470]">Customer Name</label>
                  <input type="text" defaultValue={trip.customerConsignee || "Janeth Doe"} className="h-[44px] bg-[#f8f9fa] border border-[#e2e5e9] rounded-[4px] px-4 text-[13px] text-[#141a1f] focus:outline-none focus:border-[#e3351d]" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-[500] text-[#5c6470]">Product</label>
                  <input type="text" defaultValue={trip.cargo || "Steel"} className="h-[44px] bg-[#f8f9fa] border border-[#e2e5e9] rounded-[4px] px-4 text-[13px] text-[#141a1f] focus:outline-none focus:border-[#e3351d]" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-[500] text-[#5c6470]">Truck Type</label>
                  <input type="text" defaultValue={trip.tailType || "Flat"} className="h-[44px] bg-[#f8f9fa] border border-[#e2e5e9] rounded-[4px] px-4 text-[13px] text-[#141a1f] focus:outline-none focus:border-[#e3351d]" />
                </div>
                <div className="flex flex-col gap-2 lg:col-span-2">
                  <label className="text-[12px] font-[500] text-[#5c6470]">Destination</label>
                  <input type="text" defaultValue={trip.dropoff || "ABC, Alake Estate"} className="h-[44px] bg-[#f8f9fa] border border-[#e2e5e9] rounded-[4px] px-4 text-[13px] text-[#141a1f] focus:outline-none focus:border-[#e3351d]" />
                </div>
                <div className="flex flex-col gap-2 lg:col-span-2">
                  <label className="text-[12px] font-[500] text-[#5c6470]">Loading Site(s)</label>
                  <input type="text" defaultValue="Babangida, Happy Home" className="h-[44px] bg-[#f8f9fa] border border-[#e2e5e9] rounded-[4px] px-4 text-[13px] text-[#141a1f] focus:outline-none focus:border-[#e3351d]" />
                </div>
              </div>

              <div className="flex justify-between items-center mt-8 pt-4">
                <button 
                  onClick={() => setIsModifyModalOpen(false)}
                  className="text-[#141a1f] lg:text-[#e3351d] text-[14px] font-[600] px-4 lg:hover:underline"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setIsModifyModalOpen(false)}
                  className="h-[44px] lg:h-[40px] px-6 bg-[#e3351d] hover:bg-[#d62e19] text-white rounded-[4px] text-[14px] font-[500]"
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[320px] p-8 flex flex-col items-center text-center">
            <div className="w-[60px] h-[60px] mb-4 flex items-center justify-center border-2 border-[#e3351d] rounded-lg">
              <span className="text-[#e3351d] text-[24px] font-[600]">!</span>
            </div>
            <p className="text-[14px] text-[#5c6470] font-[500] mb-8 max-w-[200px]">
              Are you sure you want to delete this request?
            </p>
            <div className="flex gap-4 w-full justify-center">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 h-[40px] bg-transparent text-[#e3351d] font-[500] text-[14px]"
              >
                Cancel
              </button>
              <button 
                onClick={() => { setIsDeleteModalOpen(false); /* Add navigation back logic here */ }}
                className="flex-1 h-[40px] bg-[#e3351d] text-white rounded-[4px] font-[500] text-[14px] hover:bg-[#d62e19]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
