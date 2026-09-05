import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Upload, MoreVertical, X, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/admin/add-account")({
  component: AdminAddAccount,
});

const DEPARTMENT_OPTIONS = [
  "Transport Admin",
  "Fleet Operations",
  "Fuel Management",
  "Engineering and Maintenance",
  "Parts and Store",
  "Accounts",
  "HR and Personnel",
  "Security",
  "Drivers",
];

function AdminAddAccount() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [department, setDepartment] = useState("");
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [role, setRole] = useState("");
  const [staffId, setStaffId] = useState("");
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const generatedUsername = firstName && surname ? `${firstName[0]}.${surname}` : "";
  const [generatedPassword] = useState(() => Math.random().toString(36).slice(-8));

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
    } catch {
      toast.error("Failed to create user.");
    }
  };

  const handleShareDone = () => {
    setShowShareModal(false);
    navigate({ to: "/workspace/admin/manage-account" });
  };

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-col w-[260px] bg-[#1B2432] h-full shrink-0">
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
            <Link to="/workspace/admin/password-request" className="flex flex-row items-center px-[24px] py-[12px] gap-[12px] hover:bg-white/5 transition-colors">
              <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full border-[1.5px] border-[#ffffff]">
                <span className="text-[#ffffff] text-[10px] font-bold leading-none">?</span>
              </div>
              <span className="text-[14px] font-[400] leading-[16.94px] text-[#ffffff]">Password Request</span>
            </Link>
          </div>
        </div>
        <div className="mt-auto p-[24px] border-t border-[#ffffff]/5">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-[12px]">
              <div className="w-[32px] h-[32px] rounded-[4px] bg-[#e2e5e9] flex items-center justify-center">
                <span className="text-[14px] font-[600] text-[#141a1f]">{currentUser?.initials || "JD"}</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[14px] font-[600] leading-[16.94px] text-[#ffffff]">{currentUser?.name || "J.Doe"}</span>
                <span className="text-[12px] font-[400] leading-[14.52px] text-[#8e95a1]">{currentUser?.email || "j.doe@gmail.com"}</span>
              </div>
            </div>
            <MoreVertical className="w-[16px] h-[16px] text-[#8e95a1] cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-auto relative pb-[80px] lg:pb-0">
        {/* Mobile Header */}
        <div className="flex lg:hidden flex-row items-center justify-between px-[16px] py-[16px] bg-[#1B2432]">
          <div className="flex items-center gap-[12px]">
            <button onClick={() => navigate({ to: "/workspace/app" })}>
              <ArrowLeft className="w-[20px] h-[20px] text-[#ffffff]" />
            </button>
            <span className="text-[16px] font-[500] text-[#ffffff]">Transport Manager Portal</span>
          </div>
          <div className="w-[32px] h-[32px] rounded-full bg-[#ed351d] flex items-center justify-center">
            <span className="text-[12px] font-[600] text-[#ffffff]">{currentUser?.initials || "JD"}</span>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">Transport Manager Portal</h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        {/* Content Body */}
        <div className="flex flex-col px-[16px] lg:px-[40px] py-[24px] lg:py-[32px] flex-1">
          {/* Title row */}
          <div className="flex flex-row items-start justify-between mb-[16px] lg:mb-[32px]">
            <div className="flex flex-col gap-[4px] lg:gap-[8px]">
              <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f]">Create Staff Account</h2>
              <p className="text-[12px] font-[400] lg:font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] lg:uppercase">
                CREATE THE DIGITAL PROFILE OF INTERNAL STAFF
              </p>
            </div>
            {/* Mobile more menu */}
            <div className="relative lg:hidden">
              <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-[4px]">
                <MoreVertical className="w-[20px] h-[20px] text-[#141a1f]" />
              </button>
              {showMoreMenu && (
                <div className="absolute top-[32px] right-0 z-40 w-[160px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                  <button className="w-full text-left px-[16px] py-[10px] text-[13px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9] flex items-center gap-[8px]">
                    <Download className="w-[14px] h-[14px]" /> Import CVS
                  </button>
                  <button className="w-full text-left px-[16px] py-[10px] text-[13px] font-[400] text-[#141a1f] hover:bg-[#f6f7f9] flex items-center gap-[8px]">
                    <Upload className="w-[14px] h-[14px]" /> Export CVS
                  </button>
                </div>
              )}
            </div>
            {/* Desktop Import/Export */}
            <div className="hidden lg:flex flex-row items-center gap-[16px]">
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
            className="flex flex-col w-full lg:max-w-[1000px] rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] pt-[24px] lg:pt-[32px] pb-[24px] lg:pb-[32px] px-[16px] lg:px-[32px] shadow-[0px_4px_24px_rgba(0,0,0,0.04)]"
          >
            <h3 className="text-[18px] lg:text-[20px] font-[600] leading-[28px] text-[#141a1f] mb-[16px] lg:mb-[24px]">Staff Information</h3>
            <div className="w-full h-[1px] bg-[#e2e5e9] mb-[16px] lg:mb-[24px]"></div>

            <div className="flex flex-col gap-[20px] lg:gap-[24px]">
              {/* First Name */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">First name</label>
                <input 
                  type="text" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. John"
                  className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>
              
              {/* Surname */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Surname</label>
                <input 
                  type="text" 
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="e.g. Doe"
                  className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              {/* Assign Department */}
              <div className="flex flex-col gap-[8px] w-full relative">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Assign Department</label>
                <button 
                  type="button"
                  onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                  className="flex flex-row items-center justify-between py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] text-[14px] font-[400] text-left"
                >
                  <span className={department ? "text-[#141a1f]" : "text-[#8e95a1]"}>{department || "Select Department..."}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                {showDeptDropdown && (
                  <div className="absolute top-[72px] lg:top-[64px] left-0 right-0 z-40 rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] max-h-[300px] overflow-y-auto">
                    {DEPARTMENT_OPTIONS.map(dept => (
                      <label key={dept} className="flex items-center gap-[12px] px-[16px] py-[12px] cursor-pointer hover:bg-[#f6f7f9]" onClick={() => { setDepartment(dept); setShowDeptDropdown(false); }}>
                        <div className={`w-[18px] h-[18px] rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 ${department === dept ? "bg-[#ed351d] border-[#ed351d]" : "border-[#8e95a1]"}`}>
                          {department === dept && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className="text-[14px] font-[400] text-[#5c6470]">{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Role */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Role</label>
                <input 
                  type="text" 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Supervisor"
                  className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              {/* Staff ID */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Staff ID</label>
                <input 
                  type="text" 
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder="e.g. PTL-FL-005"
                  className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              <button type="submit" className="flex flex-row items-center justify-center py-[12px] lg:py-[10px] rounded-[4px] lg:rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors lg:self-end lg:px-[16px] mt-[8px]">
                <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Save Account</span>
              </button>
            </div>
          </form>
        </div>

        {/* Mobile Bottom Nav */}
        <div className="fixed bottom-0 left-0 right-0 flex lg:hidden flex-row items-center justify-around bg-[#ffffff] border-t border-[#e2e5e9] py-[10px] z-30">
          <Link to="/workspace/admin/add-account" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 4V16M4 10H16" stroke="#141a1f" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span className="text-[10px] font-[600] text-[#141a1f]">New{"\n"}Account</span>
            <div className="w-[40px] h-[2px] bg-[#141a1f] rounded-full"></div>
          </Link>
          <Link to="/workspace/admin/manage-account" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 14C13 11.79 11.21 10 9 10C6.79 10 5 11.79 5 14" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="6" r="3" stroke="#8e95a1" strokeWidth="1.5"/></svg>
            <span className="text-[10px] font-[500] text-[#8e95a1]">Manage{"\n"}Account</span>
          </Link>
          <Link to="/workspace/admin/password-request" className="flex flex-col items-center gap-[4px]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="12" height="9" rx="2" stroke="#8e95a1" strokeWidth="1.5"/><path d="M7 8V6C7 4.34 8.34 3 10 3C11.66 3 13 4.34 13 6V8" stroke="#8e95a1" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="13" r="1.5" fill="#8e95a1"/></svg>
            <span className="text-[10px] font-[500] text-[#8e95a1]">Password{"\n"}Requests</span>
          </Link>
        </div>

        {/* Confirm Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col w-[calc(100%-32px)] lg:w-[540px] max-h-[90vh] overflow-y-auto rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
              <div className="px-[24px] lg:px-[32px] pt-[24px] lg:pt-[32px] pb-[16px]">
                <h3 className="text-[18px] lg:text-[20px] font-[600] leading-[28px] text-[#141a1f]">Confirm Account Details</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              <div className="flex flex-col px-[24px] lg:px-[32px] py-[24px] gap-[20px] lg:gap-[24px]">
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">Staff ID</label>
                  <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                    <span className="text-[14px] font-[400] text-[#5c6470]">{staffId}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">First Name</label>
                  <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                    <span className="text-[14px] font-[400] text-[#5c6470]">{firstName}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">Last Name</label>
                  <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                    <span className="text-[14px] font-[400] text-[#5c6470]">{surname}</span>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row gap-[20px] lg:gap-[16px] w-full">
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Department</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{department}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Role</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{role}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row gap-[16px] w-full">
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Assigned Username</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{generatedUsername}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Default Password</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{generatedPassword}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row justify-between items-center mt-[8px]">
                  <button type="button" onClick={() => setShowConfirmModal(false)} className="text-[14px] font-[500] text-[#ed351d] hover:underline">Go Back</button>
                  <button type="button" onClick={handleConfirmAndSend} className="py-[10px] px-[16px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] text-[14px] font-[500] text-[#ffffff]">Confirm and Send</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col w-[320px] lg:w-[360px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)] relative">
              <button onClick={handleShareDone} className="absolute top-[20px] right-[20px] text-[#8e95a1] hover:text-[#141a1f]">
                <X className="w-[16px] h-[16px]" />
              </button>
              <div className="px-[24px] pt-[24px] pb-[16px]">
                <h3 className="text-[16px] font-[600] text-[#ed351d]">Share Sign In Details</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              <div className="flex flex-row justify-between items-center px-[40px] py-[32px]">
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareDone}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">WhatsApp</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareDone}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Gmail</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareDone}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Copy</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Click-away for dropdowns */}
      {(showDeptDropdown || showMoreMenu) && <div className="fixed inset-0 z-30" onClick={() => { setShowDeptDropdown(false); setShowMoreMenu(false); }} />}
    </div>
  );
}
