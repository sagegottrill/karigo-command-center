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
           <p className="text-[11.41px] font-[400] leading-[13.81px] text-[#8e95a1] uppercase tracking-[0.05em]">
             {tenantName || "PETROLINE"} FLEET OPERATION PORTAL | POWERED BY FLEETOPSX
           </p>
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center items-center bg-[#ffffff] w-full h-screen">
        {/* Card */}
        <div 
          className="w-[500px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[32px] pb-[32px] px-[32px] gap-[24px]"
          style={{ boxShadow: "0px 10px 40px rgba(0, 0, 0, 0.08)" }}
        >
          
          <Link to="/workspace/login" className="flex flex-row items-center gap-[10px] text-[#5c6470] hover:text-[#141a1f] transition-colors w-fit">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[14px] font-[400] leading-[20px]">Back to Sign In</span>
          </Link>

          <div className="flex flex-col gap-[14px] w-full mt-[8px]">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Set New Password</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">
              First-time login requires a password update to secure your account.
            </p>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-[24px]" onSubmit={handleReset}>
            
            {/* New Password Input */}
            <div className="flex flex-col gap-[8px] w-[436px]">
              <label className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">
                New Password
              </label>
              <div className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#141a1f] bg-[#ffffff] h-[36px]">
                <KeyRound className="w-[16px] h-[16px] text-[#141a1f]" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="Enter new password"
                  className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] leading-[20px] text-[#141a1f] placeholder-[#8e95a1]" 
                />
              </div>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={!password}
              className={`flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] w-[436px] transition-colors mt-[8px] ${
                password ? "bg-[#ed351d] hover:bg-[#d62e19] cursor-pointer" : "bg-[#f5a89e] cursor-not-allowed"
              }`}
            >
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Update and Continue</span>
            </button>
          </form>

          <div className="w-full h-[1px] bg-[#e2e5e9] my-[8px]"></div>
          
          <p className="text-[11px] font-[400] leading-[14px] text-[#8e95a1] tracking-[0.05em] text-center w-full uppercase">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}

