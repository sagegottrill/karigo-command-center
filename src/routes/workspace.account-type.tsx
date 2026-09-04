import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Route as RootRoute } from "./__root";

export const Route = createFileRoute("/workspace/account-type")({
  component: AccountTypePage,
});

function AccountTypePage() {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<"internal" | "partner">("internal");

  const handleProceed = () => {
    if (accountType === "internal") {
      navigate({ to: "/workspace/login" });
    } else {
      navigate({ to: "/workspace/customer-portal/login" });
    }
  };

  return (
    <div className="flex min-h-screen bg-[#ffffff] w-full font-['Inter',sans-serif]">
      {/* Left Sidebar (Dark) */}
      <div className="relative hidden lg:flex flex-col bg-[#1B2432] w-[720px] pt-[68px] pb-[68px] px-[67px] text-[#ffffff] h-screen justify-between shrink-0">
        <div className="flex flex-col w-[586px] gap-[75px]">
          <div>
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="w-[178px] h-[60px] object-contain" />
            ) : (
              <img src="/petroline-transparent.png" alt="Petroline Transport Ltd" className="w-[178px] h-[60px] object-contain" />
            )}
          </div>

          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff] mb-[14px]">
              Welcome to {tenantName || "Petroline"} Portal
            </h2>
            <h1 className="text-[64px] font-[700] leading-[72px] text-[#ffffff] w-[467px] font-['Space_Grotesk',sans-serif]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="text-[20px] font-[400] leading-[28px] text-[#fafafa] w-[586px]">
              Centralized portal for {tenantName || "Petroline"} Personnel and Authorized Partners. Access is restricted to registered users.
            </p>
          </div>
        </div>
        
        <div className="mt-auto">
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center items-center bg-[#ffffff] w-full h-screen">
        {/* Card */}
        <div 
          className="w-[500px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[32px] pb-[32px] px-[32px] gap-[24px]"
          style={{ boxShadow: "0px 10px 40px rgba(0, 0, 0, 0.08)" }}
        >
          
          <div className="flex flex-col gap-[14px] w-full text-center">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Choose Account Type</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">Select your account type.</p>
          </div>

          {/* Account Switch */}
          <div className="flex flex-row gap-[16px] w-[436px]">
            {/* Option 1 - Internal */}
            <div 
              onClick={() => setAccountType("internal")}
              className={`flex flex-col pt-[16px] pb-[16px] px-[16px] gap-[12px] rounded-[6px] border-[1px] w-[210px] cursor-pointer transition-all ${
                accountType === "internal" ? "border-[#ed351d]/50 bg-white shadow-sm ring-1 ring-[#ed351d]/20" : "border-[#e2e5e9] bg-white hover:border-[#ed351d]/30"
              }`}
            >
              <div className="flex items-center gap-[12px]">
                <div className="flex items-center justify-center rounded-full border-[1.5px] border-[#e2e5e9] w-[18px] h-[18px] shrink-0 relative">
                  {accountType === "internal" && (
                    <div className="absolute inset-0 m-auto w-[10px] h-[10px] rounded-full bg-[#ed351d]"></div>
                  )}
                </div>
                <h3 className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">
                  {tenantName || "Petroline"} Staff
                </h3>
              </div>
              <p className="text-[12px] font-[400] leading-[18px] text-[#5c6470] ml-[30px]">
                Account portal for all {(tenantName || "petroline").toLowerCase()} staff.
              </p>
            </div>

            {/* Option 2 - Partner */}
            <div 
              onClick={() => setAccountType("partner")}
              className={`flex flex-col pt-[16px] pb-[16px] px-[16px] gap-[12px] rounded-[6px] border-[1px] w-[210px] cursor-pointer transition-all ${
                accountType === "partner" ? "border-[#ed351d]/50 bg-white shadow-sm ring-1 ring-[#ed351d]/20" : "border-[#e2e5e9] bg-white hover:border-[#ed351d]/30"
              }`}
            >
              <div className="flex items-center gap-[12px]">
                <div className="flex items-center justify-center rounded-full border-[1.5px] border-[#e2e5e9] w-[18px] h-[18px] shrink-0 relative">
                  {accountType === "partner" && (
                    <div className="absolute inset-0 m-auto w-[10px] h-[10px] rounded-full bg-[#ed351d]"></div>
                  )}
                </div>
                <h3 className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">
                  Partner Company
                </h3>
              </div>
              <p className="text-[12px] font-[400] leading-[18px] text-[#5c6470] ml-[30px]">
                Account portal for external company.
              </p>
            </div>
          </div>

          <button 
            onClick={handleProceed}
            className="flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#f5a89e] w-full hover:bg-[#f3988c] transition-colors mt-[8px]"
          >
            <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Proceed</span>
          </button>

          <div className="w-full h-[1px] bg-[#e2e5e9] my-[8px]"></div>
          
          <p className="text-[11px] font-[400] leading-[14px] text-[#8e95a1] tracking-[0.05em] text-center w-full uppercase">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}
