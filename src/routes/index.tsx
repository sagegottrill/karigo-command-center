import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  MapPin,
  Radar,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // If a tenant subdomain is detected, skip the marketing page and go straight to login
    if (context.tenantSlug) {
      throw redirect({ to: "/workspace/account-type" });
    }
  },
  head: () => ({
    meta: [
      { title: "FleetOpsX - The Operating System for Logistics" },
      {
        name: "description",
        content:
          "Enterprise Transport Management System for fleet, dispatch, fuel, engineering, accounts and gate security.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col items-center">
      
      {/* Header - 1440x100 */}
      <header className="w-full max-w-[1440px] h-[100px] bg-[#1b2432] border-b-[1px] border-[#e2e5e9] flex flex-row items-center pt-[12px] pb-[12px] px-[32px] gap-[10px]">
        <div className="flex flex-row items-center gap-[16px] w-[178px] h-[75px]">
           <div className="w-[178px] h-[100px] bg-[#ffffff] flex items-center justify-center font-bold text-[#1b2432]">
             {/* Logo Placeholder */}
             <span className="text-[24px]">FLEETOPSX</span>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-[1440px] flex flex-col gap-[32px] mt-[10px] items-center pb-[100px]">
        
        {/* Hero Section - 1380x800 */}
        <section className="bg-[#000000] rounded-[10px] w-[1380px] h-[800px] flex flex-col pt-[102px] pb-[102px] px-[209px] gap-[30px] items-center text-center mx-auto overflow-hidden relative">
          
          <h1 className="text-[90px] font-[500] leading-[90px] text-[#ffffff] w-[1160px] h-[180px]">
            Manage your fleet operation with confidence
          </h1>
          
          <p className="text-[24px] font-[600] leading-[32px] text-[#ffffff] w-[668px] h-[96px]">
            Streamline your logistics. Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
          </p>
          
          <Link to="/workspace/account-type">
            <button className="bg-[#ed351d] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] w-[149px] h-[40px] flex items-center justify-center hover:bg-[#d62e19] transition-colors">
              <span className="text-[16px] font-[500] leading-[24px] text-[#ffffff]">Access Portal</span>
            </button>
          </Link>
          
        </section>

        {/* Portal Capabilities - 1440x628 */}
        <section className="border-t-[1px] border-[#344256] w-[1440px] h-[628px] flex flex-col pt-[100px] pb-[100px] px-[85px] gap-[30px]">
          
          <div className="bg-[#1b2432] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] w-[186px] h-[40px] flex items-center justify-center">
            <span className="text-[14px] font-[700] leading-[20px] text-[#ffffff]">PORTAL CAPABILITIES</span>
          </div>
          
          <h2 className="text-[36px] font-[500] leading-[40px] text-[#5c6470] w-[1270px] h-[40px]">
            Everything you need to manage fleet operations.
          </h2>

          <div className="flex flex-row gap-[40px] w-[1270px] h-[286px] mt-[10px]">
            
            {/* Feature 1 */}
            <div className="flex flex-col w-[396px] h-[286px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white p-[40px] justify-between">
              <div className="w-[100px] h-[100px] flex items-center justify-center absolute top-[-20px] right-[-20px] opacity-20">
                <MapPin className="w-[141px] h-[141px]" />
              </div>
              <div className="flex flex-col gap-[9px] w-[345px] z-10 mt-auto">
                <h3 className="text-[30px] font-[600] leading-[36px] text-[#ffffff]">Submit a Request</h3>
                <p className="text-[20px] font-[300] leading-[32px] text-[#ffffff]">
                  Create new load bookings, specify cargo details, and receive instant dispatch confirmations.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col w-[396px] h-[286px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white p-[40px] justify-between">
              <div className="w-[100px] h-[100px] flex items-center justify-center absolute top-[-20px] right-[-20px] opacity-20">
                <Radar className="w-[141px] h-[141px]" />
              </div>
              <div className="flex flex-col gap-[9px] w-[345px] z-10 mt-auto">
                <h3 className="text-[30px] font-[600] leading-[36px] text-[#ffffff]">Track Active Loads</h3>
                <p className="text-[20px] font-[300] leading-[32px] text-[#ffffff]">
                  View live freight movements, track vehicle status, and check accurate arrival times.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col w-[396px] h-[286px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white p-[40px] justify-between">
              <div className="w-[100px] h-[100px] flex items-center justify-center absolute top-[-20px] right-[-20px] opacity-20">
                <FileCheck2 className="w-[141px] h-[141px]" />
              </div>
              <div className="flex flex-col gap-[9px] w-[345px] z-10 mt-auto">
                <h3 className="text-[30px] font-[600] leading-[36px] text-[#ffffff]">Access Records</h3>
                <p className="text-[20px] font-[300] leading-[32px] text-[#ffffff]">
                  Review past delivery logs, download compliance documents, and audit completed freight operations.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Secure/Trust Section - 1440x500 */}
        <section className="bg-[#ffffff] flex flex-row pt-[100px] pb-[100px] px-[100px] gap-[20px] w-[1440px] h-[500px] items-center relative overflow-hidden">
          <h2 className="text-[62px] font-[700] leading-[72px] text-[#1b2432] w-[597px] h-[216px] z-10">
            Secure and efficient fleet operation services
          </h2>
          
          <div className="absolute right-[100px] w-[576px] h-[457px] bg-[#f1f2f4] rounded-[24px] shadow-2xl flex items-center justify-center z-10 border-[4px] border-[#e2e5e9]">
             {/* Tablet mockup placeholder */}
             <div className="text-[24px] font-[600] text-[#5c6470]">Platform Preview</div>
          </div>

          {/* Decorative Ellipses */}
          <div className="absolute right-[-100px] w-[960px] h-[545px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20" />
          <div className="absolute right-[-80px] w-[960px] h-[545px] rounded-[100%] border-[1px] border-[#ed351d] opacity-40" />
          <div className="absolute right-[-60px] w-[960px] h-[545px] rounded-[100%] border-[1px] border-[#ed351d] opacity-60" />
          <div className="absolute right-[-40px] w-[960px] h-[545px] rounded-[100%] bg-[#ed351d] opacity-10" />
        </section>

      </main>

      {/* Footer - 1440x100 */}
      <footer className="w-full max-w-[1440px] h-[100px] bg-[#1b2432] flex items-center justify-center">
        <p className="text-[12px] font-[400] leading-[16px] text-[#ffffff]">
          POWERED BY FLEETOPSX | COPYRIGHT {new Date().getFullYear()}
        </p>
      </footer>

    </div>
  );
}
