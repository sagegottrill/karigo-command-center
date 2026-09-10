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
    <div className="flex min-h-screen bg-[#1B2432] lg:bg-[#ffffff] w-full font-['Inter',sans-serif]">
      {/* Left Sidebar (Dark) */}
      <div className="relative hidden lg:flex flex-col bg-[#1B2432] w-[720px] pt-[68px] pb-[68px] px-[67px] text-[#ffffff] h-screen justify-between shrink-0">
        <div className="flex flex-col w-[586px] gap-[75px]">
          <div>
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="w-[178px] h-[100px] object-contain object-left" />
            ) : (
              <img src="/figma/petroline-logo.png" alt="Petroline Transport Ltd" className="w-[178px] h-[100px] object-contain object-left" />
            )}
          </div>

          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff]">
              Welcome to {tenantName || "Petroline"} Portal
            </h2>
            <h1 className="text-[50px] font-[700] leading-[58px] text-[#ffffff] max-w-[359px] font-['Space_Grotesk',sans-serif] tracking-[-0.9px]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="text-[20px] font-[400] leading-[28px] text-[#fafafa] w-[586px]">
              Centralized portal for {tenantName || "Petroline"} Personnel and Authorized Partners. Access is restricted to registered users.
            </p>
          </div>
        </div>
        
        <div className="mt-auto">
          <p className="text-[11.41px] font-[400] leading-normal text-white/70 uppercase tracking-[0.4px]">
            {(tenantName || "PETROLINE").toUpperCase()} FLEET OPERATION PORTAL | POWERED BY FLEETOPSX
          </p>
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center items-center bg-[#1B2432] lg:bg-[#ffffff] w-full h-screen px-[24px] lg:px-0">
        
        {/* Mobile Logo */}
        <div className="lg:hidden flex justify-center mb-[40px]">
          {tenantLogo ? (
            <img src={tenantLogo} alt={tenantName} className="w-[178px] h-[60px] object-contain" />
          ) : (
            <img src="/figma/petroline-logo.png" alt="Petroline Transport Ltd" className="w-[178px] h-[60px] object-contain" />
          )}
        </div>

        {/* Card — Figma 76:632 */}
        <div 
          className="w-full max-w-[500px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[24px] pb-[24px] px-[24px] gap-[24px]"
          style={{ boxShadow: "0px 4px 16px rgba(12,12,13,0.1), 0px 4px 4px rgba(12,12,13,0.05)" }}
        >
          
          <div className="flex flex-col gap-[14px] w-full text-left">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] tracking-[0.4px]">Choose Account Type</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">Select your account type.</p>
          </div>

          {/* Account Switch */}
          <div className="flex flex-col md:flex-row gap-[20px] w-full justify-end">
            {/* Option 1 - Internal */}
            <button
              type="button"
              onClick={() => setAccountType("internal")}
              className={`flex flex-col p-[12px] gap-[12px] rounded-[6px] border w-full md:w-[210px] text-left transition-all ${
                accountType === "internal" ? "border-[#ed351d] bg-white" : "border-[#e2e5e9] bg-white hover:bg-[#f9fafb]"
              }`}
            >
              <div className="flex items-start gap-[12px]">
                <div className="mt-[1px] flex items-center justify-center rounded-full border border-[#e2e5e9] w-[16px] h-[16px] shrink-0 relative shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
                  {accountType === "internal" && (
                    <div className="absolute inset-0 m-auto w-[8px] h-[8px] rounded-full bg-[#ed351d]" />
                  )}
                </div>
                <div className="flex flex-col gap-[20px]">
                  <h3 className="text-[14px] font-[500] leading-[14px] text-[#141a1f] tracking-[0.4px]">
                    {tenantName || "Petroline"} Staff
                  </h3>
                  <p className="text-[12px] font-[400] leading-[16.5px] text-[#5c6470] tracking-[0.4px] max-w-[150px]">
                    Account portal for all {(tenantName || "petroline").toLowerCase()} staff.
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2 - Partner */}
            <button
              type="button"
              onClick={() => setAccountType("partner")}
              className={`flex flex-col p-[12px] gap-[12px] rounded-[6px] border w-full md:w-[210px] text-left transition-all ${
                accountType === "partner" ? "border-[#ed351d] bg-white" : "border-[#e2e5e9] bg-white hover:bg-[#f9fafb]"
              }`}
            >
              <div className="flex items-start gap-[12px]">
                <div className="mt-[1px] flex items-center justify-center rounded-full border border-[#e2e5e9] w-[16px] h-[16px] shrink-0 relative shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
                  {accountType === "partner" && (
                    <div className="absolute inset-0 m-auto w-[8px] h-[8px] rounded-full bg-[#ed351d]" />
                  )}
                </div>
                <div className="flex flex-col gap-[20px]">
                  <h3 className="text-[14px] font-[500] leading-[14px] text-[#141a1f] tracking-[0.4px]">
                    Partner Company
                  </h3>
                  <p className="text-[12px] font-[400] leading-[16.5px] text-[#5c6470] tracking-[0.4px] max-w-[150px]">
                    Account portal for external company.
                  </p>
                </div>
              </div>
            </button>
          </div>

          <button 
            onClick={handleProceed}
            className="flex h-[36px] items-center justify-center rounded-[4px] bg-[#ed351d] w-full hover:bg-[#d62e19] transition-colors"
          >
            <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff] tracking-[0.4px]">Proceed</span>
          </button>

          <div className="w-full h-[1px] bg-[#e2e5e9]" />
          
          <p className="text-[11.41px] font-[400] leading-normal text-[#5c6470] tracking-[0.4px] text-center w-full uppercase">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}
