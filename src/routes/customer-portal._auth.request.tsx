import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { orderService } from "@/lib/fleetopsx/services";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/customer-portal/_auth/request")({
  component: SisterCompanyRequest,
});

function SisterCompanyRequest() {
  const navigate = useNavigate();
  const [customerConsignee, setCustomerConsignee] = useState("");
  const [cargo, setCargo] = useState("");
  const [tailType, setTailType] = useState("");
  const [loadingRoutingType, setLoadingRoutingType] = useState<"Single" | "Multiple">("Single");
  const [loadingSites, setLoadingSites] = useState<{ predefined: string, custom: string }[]>([{ predefined: "", custom: "" }]);
  const [dropoff, setDropoff] = useState("");
  
  const PREDEFINED_SITES = [
    "Comfortoboh", "Happy Home", "Ijesha.1", "Babangida.1", 
    "Babangida.2", "Ijesha.2", "Babangida.3", "Metalberg.K", 
    "Saba Factory", "Others"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerConsignee || !cargo || !tailType || loadingSites.some(s => !s.predefined || (s.predefined === "Others" && !s.custom)) || !dropoff) {
      toast.error("Please fill all required fields");
      return;
    }

    const resolvedSites = loadingSites.map(s => s.predefined === "Others" ? s.custom : s.predefined);

    if (new Set(resolvedSites).size !== resolvedSites.length) {
      toast.error("Duplicate loading sites are not allowed");
      return;
    }

    const payload = {
      customerConsignee,
      cargo,
      tailType,
      loadingRoutingType,
      loadingSite: resolvedSites,
      pickup: resolvedSites[0] || "",
      dropoff,
    };

    await orderService.submitCustomerOrder(payload);
    toast.success("Request submitted to Fleet Operations");
    navigate({ to: "/customer-portal/dashboard" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Transport Request"
        description="Submit a new request to Fleet Operations for dispatch."
      />
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
        <SectionPanel title="Request Details" bodyClassName="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Customer Name (Consignee)</Label>
            <Input className="h-9 text-xs" value={customerConsignee} onChange={(e) => setCustomerConsignee(e.target.value)} placeholder="Enter consignee name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Product (Cargo)</Label>
            <Select value={cargo} onValueChange={setCargo}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {["AGO", "PMS", "DPK", "Jet A1", "LPG", "Bitumen"].map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Truck Type</Label>
            <Select value={tailType} onValueChange={setTailType}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select truck type" /></SelectTrigger>
              <SelectContent>
                {["Full", "Semi", "Flat", "Side Guide", "Low Bed"].map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Final Destination (Dropoff)</Label>
            <Input className="h-9 text-xs" value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="e.g. Abuja Depot" />
          </div>
        </SectionPanel>

        <SectionPanel title="Loading Sites" bodyClassName="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Loading Scheme</Label>
            <Select value={loadingRoutingType} onValueChange={(v: "Single" | "Multiple") => {
              setLoadingRoutingType(v);
              if (v === "Single") setLoadingSites([loadingSites[0] || { predefined: "", custom: "" }]);
            }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Single" className="text-xs">Single Loading Site</SelectItem>
                <SelectItem value="Multiple" className="text-xs">Multiple Loading Sites</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-xs">Loading Sites</Label>
            {loadingSites.map((site, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-lg border border-black/[0.05] p-3">
                <div className="flex items-center gap-2">
                  <Select value={site.predefined} onValueChange={(v) => {
                    const newSites = [...loadingSites];
                    newSites[index] = { predefined: v, custom: v === "Others" ? newSites[index]!.custom : "" };
                    setLoadingSites(newSites);
                  }}>
                    <SelectTrigger className="h-9 text-xs flex-1"><SelectValue placeholder={`Select Loading Site ${index + 1}`} /></SelectTrigger>
                    <SelectContent>
                      {PREDEFINED_SITES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {loadingRoutingType === "Multiple" && loadingSites.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setLoadingSites(loadingSites.filter((_, i) => i !== index))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {site.predefined === "Others" && (
                  <Input 
                    className="h-9 text-xs mt-1" 
                    value={site.custom} 
                    onChange={(e) => {
                      const newSites = [...loadingSites];
                      newSites[index] = { predefined: "Others", custom: e.target.value };
                      setLoadingSites(newSites);
                    }} 
                    placeholder="Enter custom loading site name..." 
                  />
                )}
              </div>
            ))}
            {loadingRoutingType === "Multiple" && (
              <Button type="button" variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => setLoadingSites([...loadingSites, { predefined: "", custom: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add Loading Site
              </Button>
            )}
          </div>
        </SectionPanel>

        <div className="lg:col-span-2 flex justify-end">
          <Button type="submit">Submit Request</Button>
        </div>
      </form>
    </div>
  );
}
