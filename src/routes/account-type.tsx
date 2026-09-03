import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Route as RootRoute } from "./__root";

export const Route = createFileRoute("/account-type")({
  component: AccountTypePage,
});

function AccountTypePage() {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* Left Sidebar (Dark) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1B2432] p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.05),transparent_60%)]" />
        
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            {tenantLogo ? (
              <div className="mb-12 inline-flex items-center w-max rounded-2xl bg-white/5 p-4 border border-white/10 backdrop-blur-sm">
                <img src={tenantLogo} alt={tenantName} className="h-12 w-auto object-contain max-w-[200px]" />
              </div>
            ) : (
              <div className="mb-12 inline-flex items-center gap-3 rounded-[14px] px-3 py-2 w-max">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-[#1B2432] shadow-lg">
                  {tenantName.charAt(0)}
                </div>
                <span className="text-xl font-bold tracking-tight text-white">
                  {tenantName}
                </span>
              </div>
            )}

            <p className="text-[13px] font-medium text-slate-400 mb-2">Welcome to {tenantName} Portal</p>
            <h1 className="max-w-md font-space-grotesk text-[36px] font-bold leading-[1.1] tracking-[-0.03em] text-white">
              Manage your fleet operation with confidence
            </h1>
            <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-slate-300 font-medium">
              Streamline your logistics. Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="h-1 w-12 bg-orange-500 rounded-full"></div>
             <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">POWERED BY FLEETOPSX | COPYRIGHT 2026</p>
          </div>
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center p-8 lg:p-24 bg-white relative">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-10">
            <h2 className="text-[32px] font-bold tracking-tight text-[#141a1f] mb-2">Choose Account Type</h2>
            <p className="text-[15px] text-slate-500">Select your workspace to continue to the portal.</p>
          </div>

          <div className="flex flex-col gap-4">
            <Link 
              to="/login"
              className="group relative flex items-center justify-between rounded-xl border-2 border-slate-100 bg-white p-6 transition-all hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10"
            >
              <div>
                <h3 className="text-lg font-bold text-[#141a1f] group-hover:text-orange-500 transition-colors">Internal Staff</h3>
                <p className="text-[13px] text-slate-500 mt-1">For direct employees and operational teams</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors">
                <ArrowRight className="h-5 w-5" />
              </div>
            </Link>

            <Link 
              to="/customer-portal/login"
              className="group relative flex items-center justify-between rounded-xl border-2 border-slate-100 bg-white p-6 transition-all hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10"
            >
              <div>
                <h3 className="text-lg font-bold text-[#141a1f] group-hover:text-orange-500 transition-colors">Sister Company</h3>
                <p className="text-[13px] text-slate-500 mt-1">For authorized partners and external vendors</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors">
                <ArrowRight className="h-5 w-5" />
              </div>
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
