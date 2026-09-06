import { Link, useLocation } from "@tanstack/react-router";
import { Plus, LayoutGrid, HelpCircle, MoreVertical, ArrowLeft, UserPlus, UserRoundCog, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div className="flex min-h-screen w-full bg-[#f1f2f4] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <div className="hidden lg:flex w-[260px] flex-shrink-0 bg-[#1B2432] h-screen flex-col overflow-y-auto">
        <div className="pt-[32px] pb-[40px] px-[24px]">
          {/* Logo Placeholder */}
          <div className="flex items-center gap-2 text-white">
            <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 20C10 14.4772 14.4772 10 20 10H100C105.523 10 110 14.4772 110 20C110 25.5228 105.523 30 100 30H20C14.4772 30 10 25.5228 10 20Z" fill="#E3351D"/>
              <text x="20" y="25" fill="white" fontSize="14" fontWeight="bold">PETROLINE</text>
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-[32px] flex-1">
          {/* Partner Account Section */}
          <div className="flex flex-col">
            <div className="px-[24px] mb-[12px]">
              <span className="text-[11px] font-[500] leading-[14px] text-[#8e95a1] uppercase tracking-[0.05em]">
                PARTNER ACCOUNT
              </span>
            </div>
            <div className="flex flex-col gap-[4px] px-[12px]">
              <Link
                to="/workspace/app/add-partner"
                className={cn(
                  "flex items-center gap-[12px] px-[12px] py-[10px] rounded-[6px] transition-colors",
                  path === "/workspace/app/add-partner"
                    ? "bg-[#e3351d] text-white"
                    : "text-[#8e95a1] hover:text-white hover:bg-white/5"
                )}
              >
                <Plus className="w-[18px] h-[18px]" />
                <span className="text-[14px] font-[400] leading-[20px]">New Account</span>
              </Link>
              <Link
                to="/workspace/app/manage-partner"
                className={cn(
                  "flex items-center gap-[12px] px-[12px] py-[10px] rounded-[6px] transition-colors",
                  path === "/workspace/app/manage-partner"
                    ? "bg-[#e3351d] text-white"
                    : "text-[#8e95a1] hover:text-white hover:bg-white/5"
                )}
              >
                <LayoutGrid className="w-[18px] h-[18px]" />
                <span className="text-[14px] font-[400] leading-[20px]">Account Management</span>
              </Link>
            </div>
          </div>

          {/* Internal Account Section */}
          <div className="flex flex-col">
            <div className="px-[24px] mb-[12px]">
              <span className="text-[11px] font-[500] leading-[14px] text-[#8e95a1] uppercase tracking-[0.05em]">
                INTERNAL ACCOUNT
              </span>
            </div>
            <div className="flex flex-col gap-[4px] px-[12px]">
              <Link
                to="/workspace/app/add-account"
                className={cn(
                  "flex items-center gap-[12px] px-[12px] py-[10px] rounded-[6px] transition-colors",
                  path === "/workspace/app/add-account"
                    ? "bg-[#e3351d] text-white"
                    : "text-[#8e95a1] hover:text-white hover:bg-white/5"
                )}
              >
                <Plus className="w-[18px] h-[18px]" />
                <span className="text-[14px] font-[400] leading-[20px]">New Account</span>
              </Link>
              <Link
                to="/workspace/app/manage-account"
                className={cn(
                  "flex items-center gap-[12px] px-[12px] py-[10px] rounded-[6px] transition-colors",
                  path === "/workspace/app/manage-account"
                    ? "bg-[#e3351d] text-white"
                    : "text-[#8e95a1] hover:text-white hover:bg-white/5"
                )}
              >
                <LayoutGrid className="w-[18px] h-[18px]" />
                <span className="text-[14px] font-[400] leading-[20px]">Account Management</span>
              </Link>
              <Link
                to="/workspace/app/password-request"
                className={cn(
                  "flex items-center gap-[12px] px-[12px] py-[10px] rounded-[6px] transition-colors",
                  path === "/workspace/app/password-request"
                    ? "bg-[#e3351d] text-white"
                    : "text-[#8e95a1] hover:text-white hover:bg-white/5"
                )}
              >
                <HelpCircle className="w-[18px] h-[18px]" />
                <span className="text-[14px] font-[400] leading-[20px]">Password Request</span>
              </Link>
            </div>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="p-[24px] mt-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[12px]">
              <div className="w-[32px] h-[32px] rounded-[6px] bg-white flex items-center justify-center text-[#1B2432] font-[600] text-[12px]">
                JD
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-[500] text-white">J.Doe</span>
                <span className="text-[12px] font-[400] text-[#8e95a1]">j.doe@gmail.com</span>
              </div>
            </div>
            <button className="text-[#8e95a1] hover:text-white">
              <MoreVertical className="w-[20px] h-[20px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-screen overflow-hidden bg-[#f6f7f9] lg:bg-transparent">
        {/* Mobile Header */}
        <div className="flex lg:hidden flex-row items-center justify-between px-[16px] py-[16px] bg-[#1B2432] shrink-0">
          <div className="flex items-center gap-[12px]">
            <Link to="/workspace/app" className="text-[#ffffff]">
              <ArrowLeft className="w-[20px] h-[20px]" />
            </Link>
            <span className="text-[16px] font-[500] text-[#ffffff]">Transport Manager Portal</span>
          </div>
          <div className="w-[32px] h-[32px] rounded-[6px] bg-[#ed351d] flex items-center justify-center">
            <span className="text-[12px] font-[600] text-[#ffffff]">JD</span>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex h-[80px] bg-[#f1f2f4] flex-col justify-center px-[40px] border-b border-[#e2e5e9] shrink-0">
          <h1 className="text-[24px] font-[500] leading-[32px] text-[#141a1f]">
            Transport Manager Portal
          </h1>
          <p className="text-[12px] font-[500] leading-[16px] text-[#8e95a1] uppercase tracking-[0.05em]">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        {/* Content Scrollable */}
        <div className="flex-1 overflow-auto p-[16px] lg:p-[40px] pb-[90px] lg:pb-[40px]">
          {children}
        </div>
        
        {/* Mobile Tab Bar */}
        <div className="flex lg:hidden flex-row items-center justify-around bg-[#1B2432] h-[64px] shrink-0 fixed bottom-0 left-0 right-0 z-50">
          <Link to="/workspace/app/add-account" className="flex flex-col items-center gap-[4px] flex-1 py-[8px] relative">
            <UserPlus className={`w-[20px] h-[20px] ${path.includes("add-") ? "text-white" : "text-[#8e95a1]"}`} />
            <span className={`text-[10px] font-[500] ${path.includes("add-") ? "text-white" : "text-[#8e95a1]"}`}>New Account</span>
            {path.includes("add-") && <div className="absolute bottom-0 left-[50%] translate-x-[-50%] w-[48px] h-[3px] bg-white rounded-t-[2px]"></div>}
          </Link>
          <Link to="/workspace/app/manage-account" className="flex flex-col items-center gap-[4px] flex-1 py-[8px] relative">
            <UserRoundCog className={`w-[20px] h-[20px] ${path.includes("manage-") ? "text-white" : "text-[#8e95a1]"}`} />
            <span className={`text-[10px] font-[500] ${path.includes("manage-") ? "text-white" : "text-[#8e95a1]"}`}>Manage Account</span>
            {path.includes("manage-") && <div className="absolute bottom-0 left-[50%] translate-x-[-50%] w-[48px] h-[3px] bg-white rounded-t-[2px]"></div>}
          </Link>
          <Link to="/workspace/app/password-request" className="flex flex-col items-center gap-[4px] flex-1 py-[8px] relative">
            <Lock className={`w-[20px] h-[20px] ${path.includes("password-") ? "text-white" : "text-[#8e95a1]"}`} />
            <span className={`text-[10px] font-[500] leading-tight text-center ${path.includes("password-") ? "text-white" : "text-[#8e95a1]"}`}>Password<br/>Requests</span>
            {path.includes("password-") && <div className="absolute bottom-0 left-[50%] translate-x-[-50%] w-[48px] h-[3px] bg-white rounded-t-[2px]"></div>}
          </Link>
        </div>
      </div>
    </div>
  );
}
