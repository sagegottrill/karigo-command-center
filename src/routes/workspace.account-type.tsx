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
    <div className="grid min-h-screen bg-[#ffffff] lg:grid-cols-2">
      {/* Left Sidebar (Dark) - 720x1024 */}
      <div className="relative hidden lg:flex flex-col bg-[#1B2432] w-full pt-[68px] pb-[68px] pl-[67px] pr-[67px] text-[#ffffff] h-full justify-between">
        <div className="w-[586px] flex flex-col gap-[75px]">
          <div>
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="w-[178px] h-[100px] object-contain" />
            ) : (
              <div className="text-[32px] font-bold tracking-tight text-[#ffffff]">
                {tenantName}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff] mb-[14px]">
              Welcome to {tenantName} Portal
            </h2>
            <h1 className="text-[64px] font-[700] leading-[72px] text-[#ffffff] w-[467px]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="text-[20px] font-[400] leading-[28px] text-[#fafafa] w-[586px]">
              Centralized portal for {tenantName} Personnel and Authorized Partners. Access is restricted to registered users.
            </p>
          </div>
        </div>
        
        <div className="mt-auto pt-[68px]">
           <p className="text-[11.41px] font-[400] leading-[13.81px] text-[#ffffff] tracking-wide uppercase">
             {tenantName} FLEET OPERATION PORTAL | POWERED BY FLEETOPSX
           </p>
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center items-center bg-[#ffffff] pt-[222px] pb-[222px] px-[110px] w-full h-full">
        {/* Background+Border */}
        <div className="w-[500px] h-[356.25px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[23.53px] pb-[24.06px] px-[24px] gap-[24px] shadow-sm">
          
          <div className="flex flex-col gap-[14px] w-full">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] h-[32px]">Choose Account Type</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470] h-[20px]">Select your account type.</p>
          </div>

          {/* Account Switch */}
          <div className="flex flex-row gap-[20px] w-[440px] h-[94.125px]">
            {/* Active/Inactive Option 1 */}
            <div 
              onClick={() => setAccountType("internal")}
              className={`flex flex-row pt-[12px] pb-[12px] pl-[12px] pr-[12px] gap-[12px] rounded-[6px] border-[1px] w-[210px] h-[94.125px] cursor-pointer transition-colors ${
                accountType === "internal" ? "border-[#e2e5e9] bg-[#e2e5e9]/20" : "border-[#e2e5e9] bg-[#ffffff]"
              }`}
            >
              <div className="flex pt-[3px] pb-[3px] px-[0.07px] items-center justify-center rounded-full border-[1px] border-[#e2e5e9] bg-[#ffffff] w-[16px] h-[16px] mt-0.5">
                {accountType === "internal" && (
                   <div className="w-[6.67px] h-[6.67px] rounded-full bg-[#ed351d] border-[0.67px] border-[#ed351d]"></div>
                )}
              </div>
              <div className="flex flex-col gap-[20px] w-[156px]">
                <h3 className="text-[14px] font-[500] leading-[14px] text-[#141a1f] pr-[30.61px]">
                  {tenantName} Staff
                </h3>
                <p className="text-[12px] font-[400] leading-[16.5px] text-[#5c6470] w-[150px]">
                  Account portal for all {tenantName.toLowerCase()} staff.
                </p>
              </div>
            </div>

            {/* Active/Inactive Option 2 */}
            <div 
              onClick={() => setAccountType("partner")}
              className={`flex flex-row pt-[12px] pb-[12px] pl-[12px] pr-[12px] gap-[12px] rounded-[6px] border-[1px] w-[210px] h-[94.125px] cursor-pointer transition-colors ${
                accountType === "partner" ? "border-[#e2e5e9] bg-[#e2e5e9]/20" : "border-[#e2e5e9] bg-[#ffffff]"
              }`}
            >
              <div className="flex pt-[3px] pb-[3px] px-[0.07px] items-center justify-center rounded-full border-[1px] border-[#e2e5e9] bg-[#ffffff] w-[16px] h-[16px] mt-0.5">
                {accountType === "partner" && (
                   <div className="w-[6.67px] h-[6.67px] rounded-full bg-[#ed351d] border-[0.67px] border-[#ed351d]"></div>
                )}
              </div>
              <div className="flex flex-col gap-[20px] w-[157.5px]">
                <h3 className="text-[14px] font-[500] leading-[14px] text-[#141a1f] pr-[20.79px]">
                  Partner Company
                </h3>
                <p className="text-[12px] font-[400] leading-[16.5px] text-[#5c6470] w-[150px]">
                  Account portal for external company.
                </p>
              </div>
            </div>
          </div>

          <button 
            onClick={handleProceed}
            className="flex flex-row items-center justify-center pt-[5.61px] pb-[6.39px] px-[12px] rounded-[4px] bg-[#ed351d] w-[450px] h-[36px] hover:bg-[#d62e19] transition-colors"
          >
            <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Proceed</span>
          </button>

          <div className="w-[450px] h-[0px] border-t-[1px] border-[#e2e5e9]"></div>
          
          <p className="text-[11.41px] font-[400] leading-[13.81px] text-[#5c6470] tracking-wide">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}
