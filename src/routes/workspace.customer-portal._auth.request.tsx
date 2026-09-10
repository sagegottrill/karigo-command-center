import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MoreVertical, ArrowLeft, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { orderService, authService, tenantService } from "@/lib/fleetopsx/services";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";
import type { PlatformTenant } from "@/lib/fleetopsx/types";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/customer-portal/_auth/request")({
  component: PartnerNewRequest,
});

const TRUCK_TYPE_OPTIONS = ["Full Sided", "Semi Sided", "Flat", "Side Guide", "Low Bed", "6 Meter Truck", "8 Meter Truck", "Pick Up"];
const LOADING_SITE_OPTIONS = [
  "Comfortoboh", "Happy Home", "Ijesha.1", "Babangida.1",
  "Babangida.2", "Ijesha.2", "Babangida.3", "Metalberg.K",
  "Saba Factory", "Others",
];

function PartnerNewRequest() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();

  const [customerConsignee, setCustomerConsignee] = useState("");
  const [product, setProduct] = useState("");
  const [truckType, setTruckType] = useState("");
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const [destination, setDestination] = useState("");
  const [routingType, setRoutingType] = useState<"Single" | "Multiple">("Single");
  const [loadingSites, setLoadingSites] = useState<{ id: string; type: string; customValue: string }[]>([
    { id: "initial", type: "", customValue: "" },
  ]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [showLogout, setShowLogout] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerConsignee || !truckType || !destination) {
      toast.error("Please fill all required fields");
      return;
    }

    const finalSites = loadingSites.map(s => s.type === "Others" ? s.customValue : s.type).filter(Boolean);

    if (finalSites.length === 0 || (routingType === "Multiple" && finalSites.length !== loadingSites.length)) {
      toast.error("Please specify all loading sites");
      return;
    }

    const payload = {
      customerConsignee,
      cargo: product,
      tailType: truckType,
      loadingRoutingType: routingType,
      loadingSite: finalSites,
      pickup: finalSites[0],
      dropoff: destination,
    };

    await orderService.submitCustomerOrder(payload);
    toast.success("Request submitted to Fleet Operations");
    navigate({ to: "/workspace/customer-portal/dashboard" });
  };

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/workspace/customer-portal/login" });
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tenant, setTenant] = useState<PlatformTenant | null>(null);
  
  useEffect(() => {
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug !== "localhost" && slug !== "fleetopsx") {
      tenantService.getBySlug(slug).then(setTenant);
    }
  }, []);

  const companyName = mounted && currentUser ? (
    currentUser.partnerCompanyName || 
    (currentUser.roles.includes("Customer Portals (External)") ? "Sabar Electrics" : "Sabar Electrics")
  ) : "Partner Workspace";
  const userEmail = mounted && currentUser?.email ? currentUser.email : "";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "PT";

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-[260px] bg-[#1B2432] h-full shrink-0">
        <Link to="/workspace/account-type" className="pt-[24px] pb-[32px] px-[24px] flex justify-center border-b border-[#ffffff]/5">
          {tenant?.logo ? (
            <img src={tenant.logo} alt={tenant.name} className="w-[140px] h-[48px] object-contain" />
          ) : (
            <img src="/petroline-transparent.png" alt="Platform Tenant" className="w-[140px] h-[48px] object-contain" />
          )}
        </Link>
        <div className="flex flex-col flex-1 py-[24px]">
          <div className="px-[24px] mb-[12px]">
            <span className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">TRANSPORT REQUEST</span>
          </div>
          <div className="flex flex-col">
            <Link to="/workspace/customer-portal/dashboard" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
              </svg>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Dashboard</span>
            </Link>
            <Link to="/workspace/customer-portal/request" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] bg-[#ed351d]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3V13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 8H13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[14px] font-[500] leading-[16.94px] text-[#ffffff]">New Request</span>
            </Link>
          </div>
        </div>

        {/* Logout + User */}
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
        {/* Mobile Header */}
        <div className="flex lg:hidden flex-row items-center justify-between px-[16px] py-[16px] bg-[#1B2432]">
          <div className="flex items-center gap-[12px]">
            <button onClick={() => navigate({ to: "/workspace/customer-portal/dashboard" })}>
              <ArrowLeft className="w-[20px] h-[20px] text-[#ffffff]" />
            </button>
            <span className="text-[16px] font-[500] text-[#ffffff]">Partner Portal</span>
          </div>
          <div className="w-[32px] h-[32px] rounded-full bg-[#ed351d] flex items-center justify-center">
            <span className="text-[12px] font-[600] text-[#ffffff]">{userInitials}</span>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">Partner Portal</h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        {/* Content */}
        <div className="flex flex-col px-[16px] lg:px-[40px] py-[24px] lg:py-[32px] flex-1">
          <div className="flex flex-col gap-[8px] mb-[24px] lg:mb-[32px]">
            <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f]">New Delivery Request</h2>
            <p className="text-[10px] lg:text-[12px] font-[500] leading-[12px] lg:leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
              SUBMIT DELIVERY REQUESTS
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[24px]">
            {/* Request Details Card */}
            <div className="flex flex-col w-full lg:max-w-[1000px] rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] pt-[24px] lg:pt-[32px] pb-[24px] lg:pb-[32px] px-[16px] lg:px-[32px] shadow-[0px_4px_24px_rgba(0,0,0,0.04)]">
              <h3 className="text-[20px] font-[600] leading-[28px] text-[#141a1f] mb-[24px]">Request Details</h3>
              <div className="w-full h-[1px] bg-[#e2e5e9] mb-[24px]"></div>

              <div className="flex flex-col gap-[20px]">
                {/* Customer Name */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Customer Name <span className="text-[#ed351d]">*</span></label>
                  <input
                    type="text"
                    value={customerConsignee}
                    onChange={(e) => setCustomerConsignee(e.target.value)}
                    placeholder="example: J.Doe"
                    className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f] placeholder-[#8e95a1]"
                  />
                </div>

                {/* Select Truck Type */}
                <div className="flex flex-col gap-[8px] relative">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Select Truck Type <span className="text-[#ed351d]">*</span></label>
                  <button
                    type="button"
                    onClick={() => { setShowTruckDropdown(!showTruckDropdown); setOpenDropdownIndex(null); }}
                    className="flex flex-row items-center justify-between py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] text-[14px] font-[400] text-left"
                  >
                    <span className={truckType ? "text-[#141a1f]" : "text-[#8e95a1]"}>{truckType || "Select"}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {showTruckDropdown && (
                    <div className="absolute top-[68px] left-0 right-0 z-40 rounded-[4px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] overflow-hidden">
                      {TRUCK_TYPE_OPTIONS.map(opt => (
                        <button key={opt} type="button" onClick={() => { setTruckType(opt); setShowTruckDropdown(false); }}
                          className={`w-full text-left px-[12px] py-[10px] text-[14px] font-[400] ${truckType === opt ? "bg-[#ed351d] text-[#ffffff]" : "text-[#141a1f] hover:bg-[#f6f7f9]"}`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Destination */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Final Destination <span className="text-[#ed351d]">*</span></label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="example: Kute, Abuja"
                    className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f] placeholder-[#8e95a1]"
                  />
                </div>

                {/* Product */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Product</label>
                  <input
                    type="text"
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    placeholder="example: Steel"
                    className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f] placeholder-[#8e95a1]"
                  />
                </div>
              </div>
            </div>

            {/* Loading Sites Card */}
            <div className="flex flex-col w-full lg:max-w-[1000px] rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] pt-[24px] lg:pt-[32px] pb-[24px] lg:pb-[32px] px-[16px] lg:px-[32px] shadow-[0px_4px_24px_rgba(0,0,0,0.04)]">
              <h3 className="text-[20px] font-[600] leading-[28px] text-[#141a1f] mb-[24px]">Loading Sites</h3>
              <div className="w-full h-[1px] bg-[#e2e5e9] mb-[24px]"></div>

              <div className="flex flex-col gap-[20px]">
                {/* Routing Type */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Routing Type</label>
                  <div className="flex flex-row items-center gap-[32px]">
                    <label className="flex items-center gap-[8px] cursor-pointer">
                      <div className={`w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center ${routingType === "Single" ? "border-[#ed351d]" : "border-[#8e95a1]"}`}>
                        {routingType === "Single" && <div className="w-[10px] h-[10px] rounded-full bg-[#ed351d]"></div>}
                      </div>
                        <input type="radio" className="hidden" checked={routingType === "Single"} onChange={() => { setRoutingType("Single"); setLoadingSites([loadingSites[0] || { id: Math.random().toString(), type: "", customValue: "" }]); }} />
                      <span className="text-[14px] font-[400] text-[#5c6470]">Single Site Loading</span>
                    </label>
                    <label className="flex items-center gap-[8px] cursor-pointer">
                      <div className={`w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center ${routingType === "Multiple" ? "border-[#ed351d]" : "border-[#8e95a1]"}`}>
                        {routingType === "Multiple" && <div className="w-[10px] h-[10px] rounded-full bg-[#ed351d]"></div>}
                      </div>
                      <input type="radio" className="hidden" checked={routingType === "Multiple"} onChange={() => setRoutingType("Multiple")} />
                      <span className="text-[14px] font-[400] text-[#5c6470]">Multiple Site Loading</span>
                    </label>
                  </div>
                </div>

                {/* Select Loading Site(s) */}
                <div className="flex flex-col gap-[12px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Select Loading Site</label>
                  {loadingSites.map((site, index) => (
                    <div key={site.id} className={`flex flex-col gap-[8px] relative ${openDropdownIndex === index ? 'z-50' : 'z-10'}`}>
                      <div className="flex flex-row items-center gap-[12px]">
                        <div className="flex-1 relative">
                          <button
                            type="button"
                            onClick={() => { setOpenDropdownIndex(openDropdownIndex === index ? null : index); setShowTruckDropdown(false); }}
                            className="w-full flex flex-row items-center justify-between py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] text-[14px] font-[400] text-left"
                          >
                            <span className={site.type ? "text-[#141a1f]" : "text-[#8e95a1]"}>{site.type || "Select"}</span>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          {openDropdownIndex === index && (
                            <div className="absolute top-[44px] left-0 right-0 z-40 rounded-[4px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] overflow-hidden max-h-[250px] overflow-y-auto">
                              {LOADING_SITE_OPTIONS.map(opt => (
                                <button key={opt} type="button" onClick={() => {
                                  const newSites = [...loadingSites];
                                  newSites[index] = { ...newSites[index], type: opt };
                                  if (opt !== "Others") newSites[index].customValue = "";
                                  setLoadingSites(newSites);
                                  setOpenDropdownIndex(null);
                                }}
                                  className={`w-full text-left px-[12px] py-[10px] text-[14px] font-[400] ${site.type === opt ? "bg-[#ed351d] text-[#ffffff]" : "text-[#141a1f] hover:bg-[#f6f7f9]"}`}>
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {routingType === "Multiple" && loadingSites.length > 1 && (
                          <button type="button" onClick={() => setLoadingSites(loadingSites.filter((_, i) => i !== index))} className="flex items-center justify-center p-[8px] hover:bg-black/5 rounded-[4px] shrink-0">
                            <Trash2 className="w-[20px] h-[20px] text-[#ed351d]" />
                          </button>
                        )}
                      </div>
                      
                      {site.type === "Others" && (
                        <input
                          type="text"
                          value={site.customValue}
                          onChange={(e) => {
                            const newSites = [...loadingSites];
                            newSites[index] = { ...newSites[index], customValue: e.target.value };
                            setLoadingSites(newSites);
                          }}
                          placeholder="Enter specific loading address"
                          className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f] placeholder-[#8e95a1]"
                        />
                      )}
                    </div>
                  ))}
                  
                  {routingType === "Multiple" && (
                    <button
                      type="button"
                      onClick={() => setLoadingSites([...loadingSites, { id: Math.random().toString(), type: "", customValue: "" }])}
                      className="mt-[4px] flex flex-row items-center justify-center py-[10px] px-[24px] rounded-[4px] bg-[#1B2432] hover:bg-[#2c3a50] transition-colors"
                    >
                      <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Add Another Site</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end lg:max-w-[1000px] mb-[24px]">
              <button type="submit" className="flex flex-row items-center justify-center py-[12px] lg:py-[10px] px-[24px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors w-full lg:w-auto">
                <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Submit Request</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Click-away for dropdowns */}
      {(showTruckDropdown || openDropdownIndex !== null || showLogout) && (
        <div className="fixed inset-0 z-30" onClick={() => { setShowTruckDropdown(false); setOpenDropdownIndex(null); setShowLogout(false); }} />
      )}
    </div>
  );
}
