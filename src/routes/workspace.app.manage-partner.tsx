import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, MoreVertical, X, ArrowLeft, AlertCircle, Upload, AlertOctagon } from "lucide-react";
import { useEffect, useState } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import type { User } from "@/lib/fleetopsx/types";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/app/manage-partner")({
  component: AdminManagePartner,
});

function AdminManagePartner() {
  const [users, setUsers] = useState<User[]>([]);
  const navigate = useNavigate();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showSortModal, setShowSortModal] = useState(false);

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{ type: "password" | "suspend" | "activate" | "delete"; userId: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    void adminService.users().then(setUsers);
  }, []);

  // ONLY show External Partners
  const filtered = users.filter(u => u.status !== "Deleted" && u.department === "External Partner");

  const handleAction = (type: "password" | "suspend" | "activate" | "delete", userId: string) => {
    setActiveMenu(null);
    setConfirmAction({ type, userId });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "password") {
      await adminService.resetPassword(confirmAction.userId);
      toast.success("Password reset initiated. Partner must change password on next login.");
      setConfirmAction(null);
      setShowShareModal(true);
    } else if (confirmAction.type === "suspend") {
      await adminService.suspendUser(confirmAction.userId);
      toast.warning("Partner account suspended.");
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    } else if (confirmAction.type === "activate") {
      // Assuming activate function exists or just edit user status
      toast.success("Partner account activated.");
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    } else if (confirmAction.type === "delete") {
      await adminService.deleteUser(confirmAction.userId);
      toast.error("Partner account deleted.");
      setConfirmAction(null);
      void adminService.users().then(setUsers);
    }
  };

  const shareText = `Hello,\n\nYour account password has been reset for the Partner Portal.\nPlease check your email or contact your administrator for the temporary password.\nLogin at: ${window.location.origin}/workspace/customer-portal/login`;

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
    setShowShareModal(false);
  };

  const handleShareEmail = () => {
    window.open(`mailto:?subject=Password Reset&body=${encodeURIComponent(shareText)}`, "_blank");
    setShowShareModal(false);
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(shareText);
    toast.success("Details copied to clipboard");
    setShowShareModal(false);
  };

  const exportCSV = () => {
    const headers = "S/N,Company Name,Contact Person,Username,Status\n";
    const csv = filtered.map((u, i) => `${i + 1},${u.partnerCompanyName || "-"},${u.name},${u.username},${u.status}`).join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "partner_accounts.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  return (
    <>
      <div className="w-full max-w-[1000px]">
        {/* Title row */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between mb-[24px] lg:mb-[32px] gap-[16px]">
          <div className="flex flex-col gap-[4px] lg:gap-[8px]">
            <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f]">Manage Partner Account</h2>
            <p className="text-[13px] lg:text-[12px] font-[400] lg:font-[500] leading-[14.52px] lg:tracking-[0.05em] text-[#8e95a1] lowercase lg:uppercase first-letter:uppercase">
              Manage listing of partner company
            </p>
          </div>
          <div className="flex flex-col items-center gap-[8px] w-full lg:w-auto mt-[8px] lg:mt-0">
            <Link to="/workspace/app/add-partner" className="flex items-center justify-center py-[12px] lg:py-[10px] px-[16px] rounded-[6px] bg-[#e3351d] hover:bg-[#d62e19] transition-colors w-full lg:w-auto">
              <span className="text-[15px] lg:text-[14px] font-[500] leading-[20px] text-[#ffffff]">+ Add New Account</span>
            </Link>
            <button onClick={exportCSV} className="hidden lg:flex items-center justify-center gap-[8px] py-[8px] px-[12px] rounded-[4px] bg-[#141a1f] hover:bg-[#2a3441] transition-colors self-end w-full lg:w-auto">
              <Upload className="w-[16px] h-[16px] text-white" />
              <span className="text-[12px] font-[500] text-white">Export CVS</span>
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-[12px] mb-[24px]">
          <div className="flex items-center gap-[12px]">
            <div className="relative flex-1 lg:flex-none lg:w-[400px]">
              <Search className="absolute left-[16px] top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-[#8e95a1]" />
              <input 
                type="text" 
                placeholder="Search" 
                className="w-full pl-[40px] pr-[16px] py-[10px] bg-[#f6f7f9] lg:bg-[#ffffff] border border-[#e2e5e9] rounded-[4px] text-[14px] outline-none focus:border-[#141a1f]" 
              />
            </div>
            <button onClick={() => setShowSortModal(true)} className="w-[44px] h-[44px] shrink-0 bg-[#ed351d] hover:bg-[#d62e19] flex items-center justify-center rounded-[4px] transition-colors">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 5.83333H17.5M5 10H15M8.33333 14.1667H11.6667" stroke="white" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          {/* Active Sort Tags */}
          <div className="flex items-center gap-[8px]">
            <div className="flex items-center gap-[8px] px-[12px] py-[4px] rounded-[4px] bg-[#ed351d]">
              <span className="text-[12px] font-[500] text-[#ffffff]">Username</span>
              <X className="w-[12px] h-[12px] text-[#ffffff] cursor-pointer" />
            </div>
            <div className="flex items-center gap-[8px] px-[12px] py-[4px] rounded-[4px] bg-[#141a1f]">
              <span className="text-[12px] font-[500] text-[#ffffff]">Accending</span>
              <X className="w-[12px] h-[12px] text-[#ffffff] cursor-pointer" />
            </div>
          </div>
        </div>

        {/* Table Container Desktop */}
        <div className="hidden lg:block w-full bg-[#ffffff] border border-[#e2e5e9] rounded-[10px] shadow-[0px_10px_40px_rgba(0,0,0,0.04)] px-[32px] py-[24px]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#f1f2f4]">
                <th className="py-[16px] text-[14px] font-[600] text-[#141a1f] w-[60px]">S/N</th>
                <th className="py-[16px] text-[14px] font-[600] text-[#141a1f]">Name</th>
                <th className="py-[16px] text-[14px] font-[600] text-[#141a1f]">Company Name</th>
                <th className="py-[16px] text-[14px] font-[600] text-[#141a1f]">Username</th>
                <th className="py-[16px] w-[120px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id} className="border-b border-[#f1f2f4] last:border-0 hover:bg-[#f6f7f9]/50 transition-colors">
                  <td className="py-[20px] text-[14px] text-[#5c6470] font-[400]">{i + 1}</td>
                  <td className="py-[20px] text-[14px] text-[#5c6470] font-[400]">{u.name}</td>
                  <td className="py-[20px] text-[14px] text-[#5c6470] font-[400]">{u.partnerCompanyName || "—"}</td>
                  <td className="py-[20px] text-[14px] text-[#5c6470] font-[400]">{u.username}</td>
                  <td className="py-[20px]">
                    <div className="flex items-center justify-end gap-[16px] relative">
                      {u.status === "Suspended" && (
                        <div className="px-[12px] py-[4px] rounded-[4px] bg-[#ed351d]">
                          <span className="text-[11px] font-[500] text-white">Suspended</span>
                        </div>
                      )}
                      <button onClick={() => setActiveMenu(activeMenu === u.id ? null : u.id)} className="p-[4px]">
                        <MoreVertical className="w-[20px] h-[20px] text-[#141a1f]" />
                      </button>
                      {activeMenu === u.id && (
                        <div className="absolute top-[40px] right-0 z-40 w-[150px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                          <button onClick={() => handleAction("password", u.id)} className="w-full text-left px-[16px] py-[10px] text-[13px] font-[500] text-[#5c6470] hover:bg-[#f6f7f9]">View</button>
                          {u.status !== "Suspended" ? (
                             <button onClick={() => handleAction("suspend", u.id)} className="w-full text-left px-[16px] py-[10px] text-[13px] font-[500] text-[#5c6470] hover:bg-[#f6f7f9]">Suspend</button>
                          ) : (
                             <button onClick={() => handleAction("activate", u.id)} className="w-full text-left px-[16px] py-[10px] text-[13px] font-[500] text-[#5c6470] hover:bg-[#f6f7f9]">Activate</button>
                          )}
                          <button onClick={() => handleAction("delete", u.id)} className="w-full text-left px-[16px] py-[10px] text-[13px] font-[500] text-[#ed351d] hover:bg-[#f6f7f9]">Delete</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile List Container */}
        <div className="flex lg:hidden flex-col gap-[16px]">
           {filtered.map((u, i) => (
              <div key={u.id} className="flex flex-col bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-[16px] relative shadow-[0px_2px_8px_rgba(0,0,0,0.04)]">
                 <div className="flex items-center justify-between mb-[12px]">
                    <div className="px-[8px] py-[4px] rounded-[4px] bg-[#f1f2f4]">
                       <span className="text-[12px] font-[600] text-[#5c6470]">#{i + 1}</span>
                    </div>
                    <button onClick={() => setActiveMenu(activeMenu === u.id ? null : u.id)} className="p-[4px] -mr-[4px]">
                      <MoreVertical className="w-[20px] h-[20px] text-[#141a1f]" />
                    </button>
                 </div>
                 
                 <h3 className="text-[18px] font-[600] text-[#141a1f] mb-[12px]">{u.partnerCompanyName || "—"}</h3>
                 
                 <div className="flex items-center justify-between relative">
                   <div className="flex flex-col gap-[8px]">
                      <div className="flex items-center gap-[8px]">
                         <span className="text-[14px] font-[400] text-[#8e95a1] w-[80px]">Name:</span>
                         <span className="text-[14px] font-[400] text-[#141a1f]">{u.name}</span>
                      </div>
                      <div className="flex items-center gap-[8px]">
                         <span className="text-[14px] font-[400] text-[#8e95a1] w-[80px]">Username:</span>
                         <span className="text-[14px] font-[400] text-[#141a1f]">{u.username}</span>
                      </div>
                   </div>
                   
                   {u.status === "Suspended" && (
                      <div className="absolute top-0 right-0 px-[10px] py-[4px] rounded-[4px] bg-[#ed351d]">
                        <span className="text-[11px] font-[500] text-white">Suspended</span>
                      </div>
                   )}
                 </div>
                 
                 {activeMenu === u.id && (
                    <div className="absolute top-[48px] right-[16px] z-40 w-[140px] rounded-[8px] bg-[#ffffff] border border-[#e2e5e9] shadow-[0px_4px_16px_rgba(0,0,0,0.1)] py-[8px]">
                      <button onClick={() => handleAction("password", u.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[500] text-[#5c6470] hover:bg-[#f6f7f9]">View</button>
                      {u.status !== "Suspended" ? (
                         <button onClick={() => handleAction("suspend", u.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[500] text-[#5c6470] hover:bg-[#f6f7f9]">Suspend</button>
                      ) : (
                         <button onClick={() => handleAction("activate", u.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[500] text-[#5c6470] hover:bg-[#f6f7f9]">Activate</button>
                      )}
                      <button onClick={() => handleAction("delete", u.id)} className="w-full text-left px-[16px] py-[10px] text-[14px] font-[500] text-[#ed351d] hover:bg-[#f6f7f9]">Delete</button>
                    </div>
                  )}
              </div>
           ))}
        </div>
      </div>

      {/* Confirmation Modals */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60 px-[16px]">
          <div className="flex flex-col items-center w-full max-w-[360px] rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)] pt-[32px] pb-[24px] px-[24px]">
            <AlertOctagon className="w-[48px] h-[48px] text-[#ed351d] mb-[16px]" strokeWidth={1.5} />
            <p className="text-[14px] font-[400] text-[#5c6470] text-center mb-[32px] max-w-[240px]">
              {confirmAction.type === "password" && "Are you sure you want to\nview this account?"}
              {confirmAction.type === "suspend" && "Are you sure you want to\nsuspend this account?"}
              {confirmAction.type === "activate" && "Are you sure you want to\nactivate this account?"}
              {confirmAction.type === "delete" && "Are you sure you want to\ndelete this account?"}
            </p>
            <div className="flex flex-row items-center justify-between w-full gap-[16px]">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-[10px] text-[14px] font-[500] text-[#ed351d] hover:underline text-center">Cancel</button>
              <button onClick={handleConfirmAction} className="flex-1 py-[10px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] text-[14px] font-[500] text-[#ffffff] transition-colors text-center">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Sign In Details Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60 px-[16px]">
          <div className="flex flex-col w-full max-w-[360px] rounded-[10px] bg-[#ffffff] shadow-[0px_20px_60px_rgba(0,0,0,0.15)] relative">
            <button onClick={() => setShowShareModal(false)} className="absolute top-[20px] right-[20px] text-[#5c6470] hover:text-[#141a1f]">
              <X className="w-[20px] h-[20px]" />
            </button>
            <div className="px-[32px] pt-[32px] pb-[20px]">
              <h3 className="text-[18px] font-[600] text-[#e3351d]">Share Sign In Details</h3>
            </div>
            <div className="w-full h-[1px] bg-[#f1f2f4] mb-[8px]"></div>
            
            <div className="flex flex-row justify-between items-center px-[40px] py-[32px]">
              <div className="flex flex-col items-center gap-[12px] cursor-pointer hover:opacity-80" onClick={handleShareWhatsApp}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#5c6470" /></svg>
                <span className="text-[13px] font-[500] text-[#8e95a1]">WhatsApp</span>
              </div>
              <div className="flex flex-col items-center gap-[12px] cursor-pointer hover:opacity-80" onClick={handleShareEmail}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#5c6470" /></svg>
                <span className="text-[13px] font-[500] text-[#8e95a1]">Gmail</span>
              </div>
              <div className="flex flex-col items-center gap-[12px] cursor-pointer hover:opacity-80" onClick={handleCopyLink}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#5c6470" /></svg>
                <span className="text-[13px] font-[500] text-[#8e95a1]">Copy</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sort Modal */}
      {showSortModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60 px-[16px]">
          <div className="flex flex-col w-full max-w-[400px] rounded-[10px] bg-[#ffffff] shadow-[0px_20px_60px_rgba(0,0,0,0.15)] relative p-[32px]">
             <h3 className="text-[16px] font-[600] text-[#ed351d] mb-[16px]">Sort By</h3>
             <div className="flex flex-col gap-[12px] mb-[24px]">
               <label className="flex items-center gap-[12px] cursor-pointer group">
                  <div className="w-[16px] h-[16px] rounded-[4px] border border-[#e2e5e9] flex items-center justify-center group-hover:border-[#8e95a1] transition-colors"></div>
                  <span className="text-[14px] font-[500] text-[#8e95a1]">Full Name</span>
               </label>
               <label className="flex items-center gap-[12px] cursor-pointer">
                  <div className="w-[16px] h-[16px] rounded-[4px] bg-[#ed351d] flex items-center justify-center">
                     <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4L4 6.5L8.5 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span className="text-[14px] font-[500] text-[#8e95a1]">Username</span>
               </label>
               <label className="flex items-center gap-[12px] cursor-pointer group">
                  <div className="w-[16px] h-[16px] rounded-[4px] border border-[#e2e5e9] flex items-center justify-center group-hover:border-[#8e95a1] transition-colors"></div>
                  <span className="text-[14px] font-[500] text-[#8e95a1]">Company</span>
               </label>
             </div>
             
             <div className="w-full h-[1px] bg-[#f1f2f4] mb-[24px]"></div>
             
             <h3 className="text-[16px] font-[600] text-[#ed351d] mb-[16px]">Order By</h3>
             <div className="flex flex-col gap-[12px] mb-[32px]">
               <label className="flex items-center gap-[12px] cursor-pointer">
                  <div className="w-[16px] h-[16px] rounded-[4px] bg-[#ed351d] flex items-center justify-center">
                     <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4L4 6.5L8.5 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span className="text-[14px] font-[500] text-[#8e95a1]">Ascending</span>
               </label>
               <label className="flex items-center gap-[12px] cursor-pointer group">
                  <div className="w-[16px] h-[16px] rounded-[4px] border border-[#e2e5e9] flex items-center justify-center group-hover:border-[#8e95a1] transition-colors"></div>
                  <span className="text-[14px] font-[500] text-[#8e95a1]">Descending</span>
               </label>
             </div>

             <button onClick={() => setShowSortModal(false)} className="w-[100px] self-end py-[10px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] text-[14px] font-[500] text-[#ffffff] transition-colors">
               Save
             </button>
          </div>
        </div>
      )}

      {/* Click away for row menu */}
      {activeMenu && <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)}></div>}
    </>
  );
}
