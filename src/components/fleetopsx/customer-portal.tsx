import { useState } from "react";
import { CustomerBottomNav, type CustomerTab } from "./customer-bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiveOperationsMap } from "./live-map";
import { MapPin, ArrowRight, PhoneCall, CheckCircle2, User, Package, Calendar, Truck } from "lucide-react";

export function CustomerPortal({ tenantId }: { tenantId?: string }) {
  const [activeTab, setActiveTab] = useState<CustomerTab>("order");

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-zinc-50 pb-28 sm:pb-0 font-sans selection:bg-white/20">
      {/* Background glow for the portal */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-white/5 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/5 bg-black/50 backdrop-blur-xl px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-white text-[14px] font-bold text-black">
            {tenantId ? tenantId.charAt(0).toUpperCase() : "F"}
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white capitalize">
            {tenantId || "FleetOpsX"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
             <span className="text-[11px] font-bold">JD</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {activeTab === "order" && <OrderFormView onComplete={() => setActiveTab("map")} />}
        {activeTab === "map" && <CustomerMapView />}
        {activeTab === "help" && <HelpView />}
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <div className="sm:hidden">
        <CustomerBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

function OrderFormView({ onComplete }: { onComplete: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      
      // Auto transition to map after a few seconds
      setTimeout(() => {
         onComplete();
      }, 3000);
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-md p-5 flex flex-col items-center justify-center h-[70vh] text-center animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
           <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight mb-3">Order Confirmed</h2>
        <p className="text-zinc-400 text-[15px] max-w-[260px] leading-relaxed">
          Your transport request has been received. Our dispatch team is assigning a vehicle.
        </p>
        <div className="mt-8">
           <div className="h-1 w-32 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white animate-[progress_3s_ease-in-out_forwards]" />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-5 space-y-6 pt-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Request Transport</h1>
        <p className="text-[14px] text-zinc-400">
          Enter your logistics requirements below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[24px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md space-y-6">
        
        {/* Logistics Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-white">Route Details</h3>
          </div>
          
          <div className="space-y-2.5">
            <Label htmlFor="pickup" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Pickup Location</Label>
            <div className="relative">
               <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
               <Input 
                 id="pickup" 
                 required
                 placeholder="e.g. Apapa Depot, Lagos" 
                 className="h-12 bg-black/50 border-white/10 pl-10 text-[15px] text-white placeholder:text-zinc-600 focus:border-white/30 focus:ring-0 rounded-xl transition-all" 
               />
            </div>
          </div>
          
          <div className="space-y-2.5">
            <Label htmlFor="destination" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Destination</Label>
            <div className="relative">
               <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
               <Input 
                 id="destination" 
                 required
                 placeholder="e.g. Wuse Zone 5, Abuja" 
                 className="h-12 bg-black/50 border-white/10 pl-10 text-[15px] text-white placeholder:text-zinc-600 focus:border-white/30 focus:ring-0 rounded-xl transition-all" 
               />
            </div>
          </div>
        </div>

        <hr className="border-white/5" />

        {/* Cargo Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-white">Cargo Information</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label htmlFor="cargoType" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Cargo Type</Label>
              <select 
                id="cargoType" 
                required
                className="w-full h-12 bg-black/50 border border-white/10 px-3 text-[14px] text-white focus:border-white/30 rounded-xl transition-all appearance-none"
              >
                <option value="pms">PMS (Petrol)</option>
                <option value="ago">AGO (Diesel)</option>
                <option value="dpk">DPK (Kerosene)</option>
                <option value="general">General Freight</option>
              </select>
            </div>
            
            <div className="space-y-2.5">
              <Label htmlFor="volume" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Volume / Weight</Label>
              <Input 
                id="volume" 
                required
                placeholder="33,000 Liters" 
                className="h-12 bg-black/50 border-white/10 px-4 text-[14px] text-white placeholder:text-zinc-600 focus:border-white/30 rounded-xl transition-all" 
              />
            </div>
          </div>
        </div>

        <hr className="border-white/5" />

        {/* Scheduling Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-white">Scheduling</h3>
          </div>
          <div className="space-y-2.5">
             <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Requested Pickup Date</Label>
             <Input 
                id="date" 
                type="date"
                required
                className="h-12 bg-black/50 border-white/10 px-4 text-[15px] text-white focus:border-white/30 rounded-xl transition-all block w-full" 
              />
          </div>
        </div>

        <hr className="border-white/5" />

        {/* Contact Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-white">Receiver Details</h3>
          </div>
          
          <div className="space-y-2.5">
            <Label htmlFor="contactName" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Contact Name</Label>
            <Input 
              id="contactName" 
              required
              placeholder="Full Name" 
              className="h-12 bg-black/50 border-white/10 px-4 text-[15px] text-white placeholder:text-zinc-600 focus:border-white/30 rounded-xl transition-all" 
            />
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="contactPhone" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Phone Number</Label>
            <Input 
              id="contactPhone" 
              type="tel"
              required
              placeholder="e.g. +234 800 000 0000" 
              className="h-12 bg-black/50 border-white/10 px-4 text-[15px] text-white placeholder:text-zinc-600 focus:border-white/30 rounded-xl transition-all" 
            />
          </div>
        </div>

        <div className="pt-4">
          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full h-14 rounded-xl bg-white text-black font-bold text-[15px] hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] flex items-center justify-center gap-2"
          >
            {isSubmitting ? "Processing..." : "Confirm & Submit Order"} {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CustomerMapView() {
  return (
    <div className="relative h-[calc(100vh-4rem)] w-full sm:h-[calc(100vh-4rem)] bg-zinc-900 animate-in fade-in duration-500">
      <div className="absolute inset-0 saturate-50 contrast-125 filter">
         <LiveOperationsMap trips={[]} />
      </div>
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      <div className="absolute bottom-6 left-4 right-4 z-[400] mx-auto max-w-sm">
        <div className="rounded-[24px] border border-white/10 bg-black/60 p-5 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-500 animate-pulse" />
              <p className="text-[13px] font-bold text-zinc-300 uppercase tracking-wider">Status</p>
            </div>
            <p className="text-xs font-medium text-zinc-500">No active trips</p>
          </div>
          
          <h2 className="text-2xl font-bold tracking-tight text-white">Awaiting Order</h2>
          <p className="text-[14px] text-zinc-400 mt-1">Submit a transport request to begin live tracking.</p>
        </div>
      </div>
    </div>
  );
}

function HelpView() {
  return (
    <div className="mx-auto max-w-md p-5 space-y-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-extrabold tracking-tight">Support</h1>
      <div className="rounded-[24px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <PhoneCall className="h-7 w-7 text-white" />
        </div>
        <div>
           <h3 className="text-lg font-bold">Need assistance?</h3>
           <p className="text-[14px] text-zinc-400 mt-1 px-4">
             Our dispatch team is available 24/7 to help you with your active orders.
           </p>
        </div>
        <Button className="w-full h-12 rounded-xl border border-white/20 bg-transparent text-white font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2">
          Call Dispatch
        </Button>
      </div>
    </div>
  );
}
