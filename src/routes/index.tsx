import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MapPin,
  Radar,
  FileCheck2,
} from "lucide-react";

export const Route = createFileRoute("/")({
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
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col items-center overflow-x-hidden">
      
      {/* Header - Desktop: 1440x100, Mobile: 390x61 */}
      <header className="w-full max-w-[1440px] md:h-[100px] h-[61px] bg-[#1b2432] border-b-[1px] border-[#e2e5e9] flex flex-row items-center md:pt-[12px] md:pb-[12px] md:px-[32px] pt-[5px] pb-[5px] px-[19px] gap-[10px]">
        <div className="flex flex-row items-center gap-[16px] md:w-[178px] md:h-[75px] w-[89px] h-[50px]">
           <div className="md:w-[178px] md:h-[100px] w-[89px] h-[50px] bg-[#ffffff] flex items-center justify-center font-bold text-[#1b2432]">
             <span className="md:text-[24px] text-[12px]">FLEETOPSX</span>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-[1440px] flex flex-col md:gap-[32px] gap-[18px] md:mt-[10px] mt-[18px] items-center md:pb-[100px] pb-[40px]">
        
        {/* Hero Section - Desktop: 1380x800, Mobile: 360x560 */}
        <section className="bg-[#000000] rounded-[10px] md:w-[1380px] md:h-[800px] w-[360px] h-[560px] flex flex-col md:pt-[102px] md:pb-[102px] md:px-[209px] p-[20px] md:gap-[30px] gap-[20px] items-center justify-center text-center mx-auto overflow-hidden relative">
          
          <h1 className="md:text-[90px] text-[36px] md:font-[500] font-[700] md:leading-[90px] leading-[40px] text-[#ffffff] md:w-[1160px] w-[329px] md:h-[180px] h-[120px] flex items-center justify-center">
            Manage your fleet operation with confidence
          </h1>
          
          <p className="md:text-[24px] text-[14px] md:font-[600] font-[500] md:leading-[32px] leading-[17.5px] text-[#ffffff] md:w-[668px] w-[293px] md:h-[96px] h-[70px] mx-auto">
            Streamline your logistics. Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
          </p>
          
          <Link to="/workspace/account-type" className="mt-auto md:mt-0">
            <button className="bg-[#ed351d] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] md:w-[149px] md:h-[40px] w-[134px] h-[36px] flex items-center justify-center hover:bg-[#d62e19] transition-colors">
              <span className="md:text-[16px] text-[14px] font-[500] md:leading-[24px] leading-[20px] text-[#ffffff]">Access Portal</span>
            </button>
          </Link>
          
        </section>

        {/* Portal Capabilities - Desktop: 1440x628, Mobile: 390x546 */}
        <section className="border-t-[1px] border-[#344256] w-full max-w-[1440px] md:h-[628px] h-[546px] flex flex-col md:pt-[100px] md:pb-[100px] md:px-[85px] pt-[75px] pb-[75px] px-[20px] gap-[30px] overflow-hidden">
          
          <div className="bg-[#1b2432] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] md:w-[186px] w-[159px] h-[40px] flex items-center justify-center">
            <span className="md:text-[14px] text-[12px] md:font-[700] font-[400] md:leading-[20px] leading-[16.5px] text-[#ffffff]">PORTAL CAPABILITIES</span>
          </div>
          
          <h2 className="md:text-[36px] text-[24px] md:font-[500] font-[400] md:leading-[40px] leading-[32px] text-[#5c6470] md:w-[1270px] w-[348px] md:h-[40px] h-[64px]">
            Everything you need to manage fleet operations.
          </h2>

          {/* Cards Container - horizontally scrolling on mobile */}
          <div className="flex flex-row gap-[40px] md:w-[1270px] w-full md:h-[286px] h-[230px] mt-[10px] overflow-x-auto pb-4 snap-x hide-scrollbar">
            
            {/* Feature 1 */}
            <div className="flex flex-col md:min-w-[396px] min-w-[300px] md:h-[286px] h-[230px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-between snap-start">
              <div className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] flex items-center justify-center absolute top-[-10px] right-[-10px] opacity-20">
                <MapPin className="md:w-[141px] w-[106px] md:h-[141px] h-[106px]" />
              </div>
              <div className="flex flex-col gap-[9px] md:w-[345px] w-[253px] z-10 mt-auto">
                <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Submit a Request</h3>
                <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                  Create new load bookings, specify cargo details, and receive instant dispatch confirmations.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col md:min-w-[396px] min-w-[300px] md:h-[286px] h-[230px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-between snap-start">
              <div className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] flex items-center justify-center absolute top-[-10px] right-[-10px] opacity-20">
                <Radar className="md:w-[141px] w-[106px] md:h-[141px] h-[106px]" />
              </div>
              <div className="flex flex-col gap-[9px] md:w-[345px] w-[253px] z-10 mt-auto">
                <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Track Active Loads</h3>
                <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                  View live freight movements, track vehicle status, and check accurate arrival times.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col md:min-w-[396px] min-w-[300px] md:h-[286px] h-[230px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-between snap-start">
              <div className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] flex items-center justify-center absolute top-[-10px] right-[-10px] opacity-20">
                <FileCheck2 className="md:w-[141px] w-[106px] md:h-[141px] h-[106px]" />
              </div>
              <div className="flex flex-col gap-[9px] md:w-[345px] w-[253px] z-10 mt-auto">
                <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Access Records</h3>
                <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                  Review past delivery logs, download compliance documents, and audit completed freight operations.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Secure/Trust Section - Desktop: 1440x500, Mobile: 390x400 */}
        <section className="bg-[#ffffff] flex flex-row md:pt-[100px] md:pb-[100px] md:px-[100px] pt-[40px] pb-[40px] px-[20px] gap-[20px] w-full max-w-[1440px] md:h-[500px] h-[400px] items-center relative overflow-hidden">
          <h2 className="md:text-[62px] text-[30px] font-[700] md:leading-[72px] leading-[34px] text-[#1b2432] md:w-[597px] w-[216px] md:h-[216px] h-[136px] z-10">
            Secure and efficient fleet operation services
          </h2>
          
          <div className="absolute md:right-[100px] right-[-50px] md:w-[576px] w-[300px] md:h-[457px] h-[238px] bg-[#f1f2f4] rounded-[24px] shadow-2xl flex items-center justify-center z-10 border-[4px] border-[#e2e5e9]">
             <div className="md:text-[24px] text-[14px] font-[600] text-[#5c6470]">Platform Preview</div>
          </div>

          {/* Decorative Ellipses */}
          <div className="absolute md:right-[-100px] right-[-50px] md:w-[960px] w-[408px] md:h-[545px] h-[231px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20" />
          <div className="absolute md:right-[-80px] right-[-40px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-40" />
          <div className="absolute md:right-[-60px] right-[-30px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-60" />
          <div className="absolute md:right-[-40px] right-[-20px] md:w-[960px] w-[360px] md:h-[545px] h-[193px] rounded-[100%] bg-[#ed351d] opacity-10" />
        </section>

      </main>

      {/* Footer - Desktop: 1440x100, Mobile: 390x70 */}
      <footer className="w-full max-w-[1440px] md:h-[100px] h-[70px] bg-[#1b2432] flex items-center justify-center">
        <p className="md:text-[12px] text-[11.41px] font-[400] md:leading-[16px] leading-[13.81px] text-[#ffffff] text-center w-[250px] md:w-auto">
          POWERED BY FLEETOPSX | COPYRIGHT {new Date().getFullYear()}
        </p>
      </footer>

    </div>
  );
}
