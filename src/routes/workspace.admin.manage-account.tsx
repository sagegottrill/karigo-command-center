import { createFileRoute } from "@tanstack/react-router";
import { Search, MoreVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import type { User } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/admin/manage-account")({
  component: AdminManageAccount,
});

function AdminManageAccount() {
  const [users, setUsers] = useState<User[]>([]);
  const currentUser = authService.getCurrentUser();

  useEffect(() => {
    void adminService.users().then(setUsers);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <div className="flex flex-col w-[260px] bg-[#1B2432] h-full shrink-0">
        <div className="pt-[24px] pb-[32px] px-[24px] flex justify-center border-b border-[#ffffff]/5">
          <img src="/petroline-transparent.png" alt="Petroline Transport Ltd" className="w-[140px] h-[48px] object-contain" />
        </div>
        
        <div className="flex flex-col flex-1 py-[24px]">
          <div className="px-[24px] mb-[12px]">
            <span className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">STAFF ACCOUNT</span>
          </div>
          <div className="flex flex-col">
            <button className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full border-[1.5px] border-[#ffffff]">
                <span className="text-[#ffffff] text-[10px] font-bold leading-none">+</span>
              </div>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Add New Account</span>
            </button>
            <button className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] bg-[#ed351d]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
              </svg>
              <span className="text-[14px] font-[500] leading-[16.94px] text-[#ffffff]">Account Management</span>
            </button>
            <button className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full border-[1.5px] border-[#ffffff]">
                <span className="text-[#ffffff] text-[10px] font-bold leading-none">?</span>
              </div>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Password Request</span>
            </button>
          </div>
        </div>

        <div className="mt-auto p-[24px] border-t border-[#ffffff]/5">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-[12px]">
              <div className="w-[32px] h-[32px] rounded-[4px] bg-[#e2e5e9] flex items-center justify-center">
                <span className="text-[14px] font-[600] text-[#141a1f]">{currentUser?.initials || "AD"}</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[14px] font-[600] leading-[16.94px] text-[#ffffff]">{currentUser?.name || "Admin"}</span>
                <span className="text-[12px] font-[400] leading-[14.52px] text-[#8e95a1]">{currentUser?.email || "admin@petroline.ng"}</span>
              </div>
            </div>
            <MoreVertical className="w-[16px] h-[16px] text-[#8e95a1] cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-auto">
        {/* Header */}
        <div className="flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">
            Transport Manager Portal
          </h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        {/* Content Body */}
        <div className="flex flex-col px-[40px] py-[32px] flex-1">
          <div className="flex flex-row items-start justify-between mb-[32px]">
            <div className="flex flex-col gap-[8px]">
              <h2 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Manage Staff Account</h2>
              <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
                MANAGE LISTING OF INTERNAL STAFF
              </p>
            </div>
            <button className="flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors">
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">+ Add New Staff Account</span>
            </button>
          </div>

          <div className="flex flex-row items-center gap-[16px] mb-[24px]">
            <div className="flex flex-row items-center w-[400px] h-[40px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#f6f7f9] px-[12px] gap-[10px]">
              <Search className="w-[16px] h-[16px] text-[#8e95a1]" />
              <input 
                type="text" 
                placeholder="Search" 
                className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] text-[#141a1f] placeholder-[#8e95a1]"
              />
            </div>
            <button className="flex flex-row items-center justify-center w-[40px] h-[40px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 4.5H13.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M5 8.5H11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M7 12.5H9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Table Card */}
          <div className="flex flex-col w-full rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex flex-row items-center w-full px-[24px] py-[16px] border-b-[1px] border-[#e2e5e9] bg-[#ffffff]">
              <div className="w-[80px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">S/N</span></div>
              <div className="flex-1 min-w-[200px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Name</span></div>
              <div className="flex-1 min-w-[200px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Department</span></div>
              <div className="flex-1 min-w-[150px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Staff ID</span></div>
              <div className="flex-1 min-w-[150px]"><span className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Username</span></div>
              <div className="w-[80px]"></div>
            </div>

            <div className="flex flex-col w-full">
              {users.map((account, index) => (
                <div key={account.id} className="flex flex-row items-center w-full px-[24px] py-[20px] border-b-[1px] border-[#e2e5e9] bg-[#ffffff] last:border-b-0 hover:bg-[#fafafa] transition-colors">
                  <div className="w-[80px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.name}</span>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.department}</span>
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.id}</span>
                  </div>
                  <div className="flex-1 min-w-[150px] flex items-center justify-between">
                    <span className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">{account.username}</span>
                    <button className="w-[32px] h-[32px] flex items-center justify-center rounded-[4px] hover:bg-[#e2e5e9] transition-colors">
                      <MoreVertical className="w-[16px] h-[16px] text-[#141a1f]" />
                    </button>
                  </div>
                  <div className="w-[80px] flex justify-end">
                    {account.status === "Suspended" && (
                      <div className="flex items-center justify-center py-[2px] px-[8px] rounded-[4px] bg-[#ed351d]">
                        <span className="text-[10px] font-[500] leading-[14px] text-[#ffffff]">Suspended</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
