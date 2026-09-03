import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/workspace/forgot-password")({
  head: ({ routeContext }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Workspace";
    
    return {
      meta: [
        { title: `Set New Password | ${tenantName}` },
        { name: "description", content: `Set new password for ${tenantName}.` },
      ],
    };
  },
  component: ForgotPasswordPage,
});

import { Route as RootRoute } from "./__root";

function ForgotPasswordPage() {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    toast.success("Password updated", {
      description: "Your new password has been set.",
    });
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
      <div className="flex flex-col justify-center items-center bg-[#ffffff] w-full h-full">
        {/* Background+Border */}
        <div className="w-[500px] h-[376.13px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[23.53px] pb-[24.06px] px-[24px] gap-[32px]">
          
          <div className="flex flex-col gap-[14px] w-full">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] h-[32px]">Set New Password</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470] h-[40px] w-[307px]">
              First-time login requires a password update to secure your account.
            </p>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-[24px]" onSubmit={handleReset}>
            
            {/* New Password Input */}
            <div className="flex flex-col gap-[12px] w-[449.87px] h-[62px]">
              <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] h-[14px]">
                New Password
              </label>
              <div className="flex flex-row items-center pt-[8.46px] pb-[8.47px] pl-[12.07px] pr-[12.07px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] w-[449.87px] h-[36px]">
                <KeyRound className="w-[16px] h-[16px] text-[#5c6470]" />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="*********"
                  className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] leading-[16.94px] text-[#5c6470] placeholder-[#5c6470]" 
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className="flex flex-row items-center justify-center pt-[5.61px] pb-[6.39px] px-[12px] rounded-[4px] bg-[#ed351d] w-[450px] h-[36px] hover:bg-[#d62e19] transition-colors mt-[8px]">
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Set New Password</span>
            </button>
            
            <div className="flex justify-center w-full">
              <Link to="/workspace/login" className="text-[14px] font-[400] leading-[16.94px] text-[#5c6470] hover:underline">
                Back to sign in
              </Link>
            </div>
          </form>

          <div className="w-[450px] h-[0px] border-t-[1px] border-[#e2e5e9]"></div>
          
          <p className="text-[11.41px] font-[400] leading-[13.81px] text-[#5c6470] tracking-wide">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}

