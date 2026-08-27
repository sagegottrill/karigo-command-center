import { useState } from "react";
import { CustomerBottomNav, type CustomerTab } from "./customer-bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiveOperationsMap } from "./live-map";

export function CustomerPortal({ tenantId }: { tenantId?: string }) {
  const [activeTab, setActiveTab] = useState<CustomerTab>("order");

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7] pb-20 sm:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-black/[0.05] bg-white px-4">
        <img
          src={`${import.meta.env.BASE_URL}fleetopsx.svg`}
          alt="FleetOpsX"
          className="h-6 w-auto"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">{tenantId || "FleetOpsX"}</span>
          {/* Status or user menu placeholder */}
          <div className="h-8 w-8 rounded-full bg-black/[0.05]" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {activeTab === "order" && <OrderFormView />}
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

function OrderFormView() {
  return (
    <div className="mx-auto max-w-md p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Place a transport request. We will assign a vehicle shortly.
        </p>
      </div>

      <div className="rounded-[16px] border border-black/[0.05] bg-white p-5 shadow-sm space-y-5">
        <div className="space-y-2">
          <Label htmlFor="pickup">Pickup Location</Label>
          <Input id="pickup" placeholder="e.g. Maiduguri Depot" />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="destination">Destination</Label>
          <Input id="destination" placeholder="e.g. Abuja Central" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cargo">Cargo Type & Volume</Label>
          <Input id="cargo" placeholder="e.g. 33,000L PMS" />
        </div>

        {/* This is a scaffold. We'll add the exact fields when provided. */}

        <Button className="w-full h-12 rounded-full font-medium" size="lg">
          Submit Order
        </Button>
      </div>
    </div>
  );
}

function CustomerMapView() {
  return (
    <div className="relative h-[calc(100vh-3.5rem-4rem)] w-full sm:h-[calc(100vh-3.5rem)]">
      {/* Re-use the existing LiveMap but ideally we filter down to just their assigned truck */}
      <LiveOperationsMap trips={[]} />
      
      {/* Overlay panel for trip status */}
      <div className="absolute bottom-4 left-4 right-4 z-[400] mx-auto max-w-md rounded-[16px] border border-black/[0.05] bg-white/95 p-4 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">No active trip</p>
            <p className="text-xs text-muted-foreground">Submit an order to start tracking</p>
          </div>
          <div className="h-2 w-2 rounded-full bg-zinc-300" />
        </div>
      </div>
    </div>
  );
}

function HelpView() {
  return (
    <div className="mx-auto max-w-md p-4 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Support</h1>
      <div className="rounded-[16px] border border-black/[0.05] bg-white p-5 shadow-sm space-y-4">
        <p className="text-sm text-muted-foreground">
          Need help with an order? Contact dispatch.
        </p>
        <Button variant="outline" className="w-full rounded-full">
          Call Dispatch
        </Button>
      </div>
    </div>
  );
}
