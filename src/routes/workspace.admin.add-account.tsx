import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Upload, MoreVertical, X } from "lucide-react";
import { useState } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/admin/add-account")({
  component: AdminAddAccount,
});

function AdminAddAccount() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const DEPARTMENTS = authService.getAllRoles().filter(r => r.key !== "Customer Portals (External)");

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [staffId, setStaffId] = useState("");

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Auto-generated stuff for confirmation
  const generatedUsername = `${firstName[0] || ""}.${surname}`.toLowerCase();
  const generatedPassword = Math.random().toString(36).slice(-8);

  const handleSaveAccountClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !surname || !department || !role || !staffId) {
      toast.error("Please fill in all fields.");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmAndSend = async () => {
    try {
      await adminService.createUser({
        firstName,
        surname,
        roles: [role],
        username: generatedUsername,
        department,
      });
      setShowConfirmModal(false);
      setShowShareModal(true);
    } catch (e) {
      toast.error("Failed to create user.");
    }
  };

  const handleShareDone = () => {
    setShowShareModal(false);
    navigate({ to: "/workspace/admin/manage-account" });
  };

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
            <Link to="/workspace/admin/add-account" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] bg-[#ed351d]">
              <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full border-[1.5px] border-[#ffffff]">
                <span className="text-[#ffffff] text-[10px] font-bold leading-none">+</span>
              </div>
              <span className="text-[14px] font-[500] leading-[16.94px] text-[#ffffff]">Add New Account</span>
            </Link>
            <Link to="/workspace/admin/manage-account" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="#ffffff" strokeWidth="1.5"/>
              </svg>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Account Management</span>
            </Link>
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
      <div className="flex flex-col flex-1 overflow-auto relative">
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
              <h2 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Create Staff Account</h2>
              <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
                CREATE THE DIGITAL PROFILE OF INTERNAL STAFF
              </p>
            </div>
            <div className="flex flex-row items-center gap-[16px]">
              <button className="flex flex-row items-center justify-center py-[10px] px-[16px] gap-[8px] rounded-[4px] hover:bg-[#e2e5e9] transition-colors border-[1px] border-[#e2e5e9]">
                <Download className="w-[16px] h-[16px] text-[#141a1f]" />
                <span className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">Import CVS</span>
              </button>
              <button className="flex flex-row items-center justify-center py-[10px] px-[16px] gap-[8px] rounded-[4px] bg-[#1B2432] hover:bg-[#2a3441] transition-colors">
                <Upload className="w-[16px] h-[16px] text-[#ffffff]" />
                <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Export CVS</span>
              </button>
            </div>
          </div>

          {/* Form Card */}
          <form 
            onSubmit={handleSaveAccountClick}
            className="flex flex-col w-full rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] pt-[32px] pb-[32px] px-[32px] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] max-w-[1000px]"
          >
            <h3 className="text-[20px] font-[600] leading-[28px] text-[#141a1f] mb-[24px]">Staff Information</h3>
            <div className="w-full h-[1px] bg-[#e2e5e9] mb-[24px]"></div>

            <div className="flex flex-col gap-[24px]">
              {/* First Name */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">First name</label>
                <input 
                  type="text" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="example: Joe"
                  className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>
              
              {/* Surname */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Surname</label>
                <input 
                  type="text" 
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="example: Doe"
                  className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              {/* Assign Department */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Assign Department</label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="flex flex-row items-center justify-between py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[36px] w-full text-[14px] font-[400] leading-[20px] text-[#141a1f] shadow-none outline-none focus:ring-0 focus:border-[#141a1f]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept.key} value={dept.key}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Role */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Role</label>
                <input 
                  type="text" 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="example: J.Doe"
                  className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              {/* Staff ID */}
              <div className="flex flex-col gap-[8px] w-full mb-[8px]">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Staff ID</label>
                <input 
                  type="text" 
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder="example: PTL-FL-005"
                  className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              <div className="flex justify-end mt-[8px]">
                <button type="submit" className="flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors">
                  <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Save Account</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Modals */}
        {showConfirmModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col w-[540px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
              <div className="px-[32px] pt-[32px] pb-[16px]">
                <h3 className="text-[20px] font-[600] leading-[28px] text-[#141a1f]">Confirm Account Details</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              
              <div className="flex flex-col px-[32px] py-[24px] gap-[24px]">
                {/* ID */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Staff ID</label>
                  <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                    <span className="text-[14px] font-[400] text-[#5c6470]">{staffId}</span>
                  </div>
                </div>

                {/* Name */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">First Name</label>
                  <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                    <span className="text-[14px] font-[400] text-[#5c6470]">{firstName}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Last Name</label>
                  <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                    <span className="text-[14px] font-[400] text-[#5c6470]">{surname}</span>
                  </div>
                </div>

                {/* Dept & Role */}
                <div className="flex flex-row gap-[16px] w-full">
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Department</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{DEPARTMENTS.find(d => d.key === department)?.name || department}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Role</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{role}</span>
                    </div>
                  </div>
                </div>

                {/* Username & Password */}
                <div className="flex flex-row gap-[16px] w-full">
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Username</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{generatedUsername}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Default Password</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9] border border-transparent">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{generatedPassword}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-row justify-between items-center mt-[16px]">
                  <button onClick={() => setShowConfirmModal(false)} className="text-[14px] font-[500] leading-[20px] text-[#ed351d] hover:underline">
                    Go Back
                  </button>
                  <button onClick={handleConfirmAndSend} className="flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors">
                    <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Confirm and Send Details</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showShareModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col w-[360px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)] relative">
              <button onClick={handleShareDone} className="absolute top-[20px] right-[20px] text-[#8e95a1] hover:text-[#141a1f]">
                <X className="w-[16px] h-[16px]" />
              </button>
              
              <div className="px-[24px] pt-[24px] pb-[16px]">
                <h3 className="text-[16px] font-[600] leading-[24px] text-[#ed351d] text-center">Share Sign In Details</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              
              <div className="flex flex-row justify-between items-center px-[40px] py-[32px]">
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareDone}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.52 3.44001C18.24 1.17001 15.2 0 11.96 0C5.35999 0 0 5.36 0 11.97C0 14.1 0.559997 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.92999 23.86 11.96 23.86H11.97C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67001 20.44 3.39001H20.52ZM11.97 21.84C10.15 21.84 8.40002 21.35 6.89001 20.45L6.53003 20.24L2.83997 21.22L3.82996 17.61L3.59998 17.25C2.61999 15.68 2.08997 13.84 2.08997 11.96C2.08997 6.51 6.53003 2.07 11.98 2.07C14.62 2.07 17.11 3.11 18.98 4.97C20.85 6.84 21.88 9.33 21.88 11.97C21.87 17.41 17.42 21.85 11.96 21.85H11.97ZM17.41 14.41C17.11 14.26 15.63 13.53 15.35 13.43C15.08 13.33 14.88 13.28 14.68 13.58C14.48 13.88 13.91 14.56 13.73 14.76C13.56 14.96 13.38 14.99 13.08 14.84C12.78 14.69 11.8 14.37 10.65 13.34C9.72998 12.51 9.10999 11.51 8.92999 11.21C8.74999 10.91 8.90997 10.74 9.05999 10.59C9.19995 10.45 9.35998 10.25 9.50995 10.08C9.65997 9.91001 9.70996 9.77997 9.80999 9.57996C9.90997 9.37995 9.85998 9.19995 9.77996 9.04993C9.69995 8.89991 9.09997 7.42004 8.84997 6.82007C8.60998 6.23004 8.35998 6.30005 8.17999 6.29004C8.01996 6.28003 7.81995 6.28003 7.61999 6.28003C7.41998 6.28003 7.09997 6.35004 6.82995 6.65003C6.55993 6.95001 5.79998 7.66004 5.79998 9.10999C5.79998 10.56 6.84997 11.96 6.99999 12.16C7.14996 12.36 9.07995 15.35 12.06 16.63C12.77 16.94 13.33 17.12 13.77 17.26C14.48 17.49 15.13 17.45 15.64 17.37C16.22 17.27 17.4 16.65 17.65 15.96C17.9 15.27 17.9 14.67 17.82 14.54C17.75 14.41 17.55 14.33 17.25 14.18V14.41H17.41Z" fill="#141a1f"/>
                  </svg>
                  <span className="text-[12px] font-[500] leading-[20px] text-[#5c6470]">WhatsApp</span>
                </div>
                
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareDone}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141a1f"/>
                  </svg>
                  <span className="text-[12px] font-[500] leading-[20px] text-[#5c6470]">Gmail</span>
                </div>
                
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareDone}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#141a1f"/>
                  </svg>
                  <span className="text-[12px] font-[500] leading-[20px] text-[#5c6470]">Copy</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
