import { useState, useEffect } from "react";
import { CustomerBottomNav, type CustomerTab } from "./customer-bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiveOperationsMap } from "./live-map";
import { ArrowRight, Box, Calendar, CheckCircle2, ChevronRight, MapPin, Package, PhoneCall, Truck, User, Activity } from "lucide-react";
import { Link, useParams } from "@tanstack/react-router";
import { orderService, tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";

export function CustomerPortal({ tenantId }: { tenantId?: string }) {
  const [activeTab, setActiveTab] = useState<CustomerTab>("order");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 pb-28 sm:pb-0 font-sans selection:bg-slate-200">
      {/* Background glow for the portal */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-blue-100/60 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/80 backdrop-blur-xl px-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-slate-900 text-[14px] font-bold text-white shadow-sm">
            {tenantId ? tenantId.charAt(0).toUpperCase() : "F"}
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900 capitalize">
            {tenantId || "FleetOpsX"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-600">
             <span className="text-[11px] font-bold">JD</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {activeTab === "order" && <OrderFormView onTabChange={setActiveTab} tenantId={tenantId} />}
        {activeTab === "map" && <CustomerMapView />}
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <div className="sm:hidden">
        <CustomerBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

function OrderFormView({ onTabChange, tenantId }: { onTabChange: (tab: CustomerTab) => void, tenantId?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    
    // Send to backend store
    await orderService.submitCustomerOrder({
      customer: `PWA User (${tenantId})`,
      pickup: formData.get("pickup") as string,
      dropoff: formData.get("destination") as string,
      cargo: `${formData.get("volume")} of ${formData.get("cargoType")}`,
      date: formData.get("date") as string,
    });

    setIsSubmitting(false);
    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <div className="mx-auto max-w-md p-5 pt-12 animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-[24px] border border-slate-200/60 bg-white p-8 shadow-xl text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50/80 mb-6">
            <CheckCircle2 className="h-10 w-10 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">Order Confirmed</h2>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-8">
            Your transport request has been sent directly to the dispatch center. We'll assign a vehicle shortly.
          </p>
          <div className="space-y-3">
            <Button 
              className="w-full h-14 rounded-xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all shadow-md"
              onClick={() => onTabChange("map")}
            >
              Track Active Orders
            </Button>
            <Button 
              variant="outline"
              className="w-full h-14 rounded-xl border-slate-200 text-slate-700 font-bold text-[15px] hover:bg-slate-50 transition-all"
              onClick={() => {
                setShowSuccess(false);
                (document.getElementById("orderForm") as HTMLFormElement)?.reset();
              }}
            >
              Place Another Order
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-5 space-y-6 pt-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Request Transport</h1>
        <p className="text-[14px] text-slate-500">
          Enter your logistics requirements below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[24px] border border-slate-200/60 bg-white p-6 shadow-xl space-y-6">
        
        {/* Logistics Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Route Details</h3>
          </div>
          
          <div className="space-y-2.5">
            <Label htmlFor="pickup" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pickup Location</Label>
            <div className="relative">
               <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
               <Input 
                 id="pickup" 
                 name="pickup"
                 required
                 placeholder="e.g. Apapa Depot, Lagos" 
                 className="h-12 bg-slate-50 border-slate-200 pl-10 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all shadow-sm" 
               />
            </div>
          </div>
          
          <div className="space-y-2.5">
            <Label htmlFor="destination" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Destination</Label>
            <div className="relative">
               <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
               <Input 
                 id="destination"
                 name="destination" 
                 required
                 placeholder="e.g. Wuse Zone 5, Abuja" 
                 className="h-12 bg-slate-50 border-slate-200 pl-10 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all shadow-sm" 
               />
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Cargo Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Cargo Information</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label htmlFor="cargoType" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cargo Type</Label>
              <select 
                id="cargoType"
                name="cargoType" 
                required
                className="w-full h-12 bg-slate-50 border border-slate-200 px-3 text-[14px] text-slate-900 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all appearance-none shadow-sm"
              >
                <option value="pms">PMS (Petrol)</option>
                <option value="ago">AGO (Diesel)</option>
                <option value="dpk">DPK (Kerosene)</option>
                <option value="general">General Freight</option>
              </select>
            </div>
            
            <div className="space-y-2.5">
              <Label htmlFor="volume" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Volume / Weight</Label>
              <Input 
                id="volume" 
                name="volume"
                required
                placeholder="33,000 Liters" 
                className="h-12 bg-slate-50 border-slate-200 px-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all shadow-sm" 
              />
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Scheduling Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Scheduling</h3>
          </div>
          <div className="space-y-2.5">
             <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requested Pickup Date</Label>
             <Input 
                id="date"
                name="date" 
                type="date"
                required
                className="h-12 bg-slate-50 border-slate-200 px-4 text-[15px] text-slate-900 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all block w-full shadow-sm" 
              />
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Contact Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Receiver Details</h3>
          </div>
          
          <div className="space-y-2.5">
            <Label htmlFor="contactName" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact Name</Label>
            <Input 
              id="contactName" 
              required
              placeholder="Full Name" 
              className="h-12 bg-slate-50 border-slate-200 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all shadow-sm" 
            />
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="contactPhone" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phone Number</Label>
            <Input 
              id="contactPhone" 
              type="tel"
              required
              placeholder="e.g. +234 800 000 0000" 
              className="h-12 bg-slate-50 border-slate-200 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 rounded-xl transition-all shadow-sm" 
            />
          </div>
        </div>

        <div className="pt-4">
          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full h-14 rounded-xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {isSubmitting ? "Processing..." : "Confirm & Submit Order"} {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CustomerMapView() {
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);

  useEffect(() => {
    tripService.list().then(trips => {
      // Find trips that are active (dispatched, not requested, not completed)
      // For this demo, we'll just show any active trip in the system
      const active = trips.filter(t => t.status !== "Requested" && t.status !== "Completed" && t.status !== "Scheduled");
      setActiveTrips(active);
    });
  }, []);

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full sm:h-[calc(100vh-4rem)] bg-slate-100 animate-in fade-in duration-500">
      <div className="absolute inset-0">
         <LiveOperationsMap trips={activeTrips} />
      </div>
      
      {/* Light gradient overlay so map isn't too overpowering at the bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent pointer-events-none" />

      <div className="absolute bottom-6 left-4 right-4 z-[400] mx-auto max-w-sm">
        <div className="rounded-[24px] border border-slate-200/60 bg-white p-5 shadow-2xl backdrop-blur-xl">
          {activeTrips.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">Status</p>
                </div>
                <p className="text-xs font-medium text-emerald-600">Active Delivery</p>
              </div>
              
              <h2 className="text-xl font-bold tracking-tight text-slate-900 truncate">
                {activeTrips[0]?.cargo}
              </h2>
              <div className="flex items-center gap-1.5 mt-2 text-slate-500 text-sm">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{activeTrips[0]?.dropoff}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Truck</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{activeTrips[0]?.truckReg?.split('/')[0]?.trim() || "Unknown"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Driver</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{activeTrips[0]?.driverName}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300 animate-pulse" />
                  <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">Status</p>
                </div>
                <p className="text-xs font-medium text-slate-400">No active trips</p>
              </div>
              
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Awaiting Order</h2>
              <p className="text-[14px] text-slate-500 mt-1">Submit a transport request to begin live tracking.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HelpView() {
  return (
    <div className="mx-auto max-w-md p-5 space-y-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Support</h1>
      <div className="rounded-[24px] border border-slate-200/60 bg-white p-6 shadow-xl space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <PhoneCall className="h-7 w-7 text-slate-700" />
        </div>
        <div>
           <h3 className="text-lg font-bold text-slate-900">Need assistance?</h3>
           <p className="text-[14px] text-slate-500 mt-1 px-4">
             Our dispatch team is available 24/7 to help you with your active orders.
           </p>
        </div>
        <Button className="w-full h-12 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2">
          Call Dispatch
        </Button>
      </div>
    </div>
  );
}
