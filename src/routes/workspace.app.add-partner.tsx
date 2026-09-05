import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/app/add-partner")({
  component: AddPartner,
});

function AddPartner() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  
  const [collapsed, setCollapsed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const generatedUsername = firstName && surname ? `${firstName.toLowerCase()}.${surname.toLowerCase()}` : "";
  const [generatedPassword] = useState(() => Math.random().toString(36).slice(-8));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAccountClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !firstName || !surname) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmAndSend = async () => {
    try {
      await adminService.createUser({
        firstName,
        surname,
        roles: ["Customer Portals (External)"],
        username: generatedUsername,
        department: "External Partner",
        companyId: companyName, // Map company name for now
      });
      toast.success("Partner account created. Default password requires reset on login.");
      setShowConfirmModal(false);
      setShowShareModal(true);
    } catch {
      toast.error("Failed to create partner.");
    }
  };

  const shareText = `Hello ${firstName},\n\nYour Partner account has been created for ${companyName}.\nUsername: ${generatedUsername}\nPassword: ${generatedPassword}\nLogin at: ${window.location.origin}/workspace/customer-portal/login`;

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
    handleShareDone();
  };

  const handleShareEmail = () => {
    window.open(`mailto:?subject=Your Partner Account Details&body=${encodeURIComponent(shareText)}`, "_blank");
    handleShareDone();
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(shareText);
    toast.success("Details copied to clipboard");
    handleShareDone();
  };

  const handleShareDone = () => {
    setShowShareModal(false);
    navigate({ to: "/workspace/app/manage-account" }); // Assume manage partners is in manage accounts for now
  };

  return (
    <div className="flex h-screen w-full bg-[#f6f7f9] font-['Inter',sans-serif]">
      {/* Desktop Sidebar */}
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

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
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex flex-col px-[40px] pt-[32px] pb-[24px] border-b-[1px] border-[#e2e5e9] bg-[#f6f7f9]">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">Transport Manager Portal</h1>
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
            MANAGE THE LIFECYCLE OF EVERY ACCOUNT WITHIN THE COMPANY TO MAINTAIN DATA INTEGRITY.
          </p>
        </div>

        {/* Content Body */}
        <div className="flex flex-col px-[16px] lg:px-[40px] py-[24px] lg:py-[32px] flex-1 lg:items-center">
          <form onSubmit={handleSaveAccountClick} className="flex flex-col w-full lg:w-[600px] lg:rounded-[10px] lg:border-[1px] lg:border-[#e2e5e9] lg:bg-[#ffffff] lg:p-[32px] lg:shadow-[0px_4px_24px_rgba(0,0,0,0.04)]">
            <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f] mb-[4px] lg:mb-[8px]">Add A Partner</h2>
            <p className="text-[12px] font-[400] lg:font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase mb-[24px] lg:mb-[32px]">
              CREATE THE DIGITAL PROFILE OF EXTERNAL PARTNERS
            </p>

            <div className="flex flex-col gap-[20px] lg:gap-[24px]">
              {/* Logo Upload */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Company Logo</label>
                <div 
                  className="flex flex-col items-center justify-center w-full h-[120px] border-2 border-dashed border-[#e2e5e9] rounded-[8px] bg-[#f6f7f9] cursor-pointer hover:bg-[#e2e5e9]/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logo ? (
                    <img src={logo} alt="Company Logo" className="h-[80px] object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-[8px]">
                      <Upload className="w-[24px] h-[24px] text-[#8e95a1]" />
                      <span className="text-[12px] font-[500] text-[#8e95a1]">Click to upload logo</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>

              {/* Company Name */}
              <div className="flex flex-col gap-[8px] w-full">
                <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Company Name</label>
                <input 
                  type="text" 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Logistics"
                  className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                />
              </div>

              <div className="flex flex-row items-center gap-[16px] lg:gap-[24px] w-full">
                {/* First Name */}
                <div className="flex flex-col gap-[8px] flex-1">
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
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Surname</label>
                  <input 
                    type="text" 
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder="e.g. Doe"
                    className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[40px] lg:h-[36px] outline-none focus:border-[#141a1f] text-[14px] font-[400] text-[#141a1f]"
                  />
                </div>
              </div>

              <div className="flex flex-row items-center gap-[16px] lg:gap-[24px] w-full">
                {/* Username */}
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Username (Auto)</label>
                  <input 
                    type="text" 
                    value={generatedUsername}
                    disabled
                    className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#f6f7f9] h-[40px] lg:h-[36px] outline-none text-[14px] font-[400] text-[#5c6470]"
                  />
                </div>
                
                {/* Password */}
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Password (Auto)</label>
                  <input 
                    type="text" 
                    value={generatedPassword}
                    disabled
                    className="flex flex-row items-center py-[8px] px-[12px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#f6f7f9] h-[40px] lg:h-[36px] outline-none text-[14px] font-[400] text-[#5c6470]"
                  />
                </div>
              </div>

              <button type="submit" className="flex flex-row items-center justify-center py-[12px] lg:py-[10px] rounded-[4px] lg:rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] transition-colors lg:self-end lg:px-[16px] mt-[8px]">
                <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Save Account</span>
              </button>
            </div>
          </form>
        </div>

        {/* Confirm Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/60">
            <div className="flex flex-col w-[calc(100%-32px)] lg:w-[540px] max-h-[90vh] overflow-y-auto rounded-[10px] bg-[#ffffff] shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
              <div className="px-[24px] lg:px-[32px] pt-[24px] lg:pt-[32px] pb-[16px]">
                <h3 className="text-[18px] lg:text-[20px] font-[600] leading-[28px] text-[#141a1f]">Confirm Partner Details</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              <div className="flex flex-col px-[24px] lg:px-[32px] py-[24px] gap-[20px] lg:gap-[24px]">
                <div className="flex flex-col lg:flex-row lg:items-center gap-[20px] lg:gap-[24px] w-full">
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Company Name</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{companyName}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Contact Name</label>
                    <div className="flex items-center px-[12px] h-[36px] rounded-[4px] bg-[#f6f7f9]">
                      <span className="text-[14px] font-[400] text-[#5c6470]">{firstName} {surname}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row lg:items-center gap-[20px] lg:gap-[24px] w-full">
                  <div className="flex flex-col gap-[8px] flex-1">
                    <label className="text-[14px] font-[600] text-[#141a1f]">Default Username</label>
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
                <h3 className="text-[16px] font-[600] text-[#ed351d]">Share Partner Details</h3>
              </div>
              <div className="w-full h-[1px] bg-[#e2e5e9]"></div>
              <div className="flex flex-row justify-between items-center px-[40px] py-[32px]">
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareWhatsApp}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.52 3.44C18.24 1.17 15.2 0 11.96 0C5.36 0 0 5.36 0 11.97C0 14.1 .56 16.14 1.6 17.92L0 24L6.19 22.39C7.94 23.34 9.93 23.86 11.96 23.86C18.57 23.86 23.94 18.5 23.94 11.89C23.94 8.7 22.72 5.67 20.44 3.39H20.52Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">WhatsApp</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleShareEmail}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Email</span>
                </div>
                <div className="flex flex-col items-center gap-[8px] cursor-pointer" onClick={handleCopyLink}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z" fill="#141a1f"/></svg>
                  <span className="text-[12px] font-[500] text-[#5c6470]">Copy</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
