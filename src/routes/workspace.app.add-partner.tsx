import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X, Upload, Download, Copy, Mail, MessageCircle, MoreVertical } from "lucide-react";
import { useState, useRef } from "react";
import { adminService, authService } from "@/lib/fleetopsx/services";
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
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const generatedUsername = firstName && surname ? `${firstName.charAt(0).toUpperCase()}.${surname.charAt(0).toUpperCase()}${surname.slice(1).toLowerCase()}` : "";
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
      // Get the current logged-in user's tenant ID for proper isolation
      const currentUser = authService.getCurrentUser();
      const tenantCompanyId = currentUser?.companyId || "tnt_001";
      
      await adminService.createUser({
        firstName,
        surname,
        roles: ["Customer Portals (External)"],
        username: generatedUsername,
        department: "External Partner",
        companyId: tenantCompanyId, // Links partner to the tenant that created them
        partnerCompanyName: companyName, // The partner's actual company name
      });
      toast.success("Partner account created.");
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
    navigate({ to: "/workspace/app/manage-partner" });
  };

  return (
    <div className="w-full max-w-[1000px]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-[24px] lg:mb-[32px] gap-4">
        <div className="flex flex-row justify-between items-center w-full lg:w-auto">
          <div>
            <h2 className="text-[20px] lg:text-[24px] font-[600] leading-[28px] lg:leading-[32px] text-[#141a1f] mb-[4px]">Create Partner Account</h2>
            <p className="text-[10px] lg:text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">
              CREATE THE DIGITAL PROFILE OF PARTNER COMPANY
            </p>
          </div>
          <button className="lg:hidden p-2 text-[#141a1f]">
            <MoreVertical className="w-[20px] h-[20px]" />
          </button>
        </div>
        <button className="hidden lg:flex items-center gap-[8px] px-[16px] py-[8px] text-[#141a1f] hover:bg-gray-200/50 rounded-md transition-colors font-[500] text-[14px]">
          <Download className="w-[18px] h-[18px]" />
          Import CVS
        </button>
      </div>

      <form onSubmit={handleSaveAccountClick} className="w-full rounded-[10px] border border-[#e2e5e9] bg-[#ffffff] pt-[24px] lg:pt-[32px] pb-[24px] lg:pb-[32px] px-[20px] lg:px-[40px] shadow-sm lg:shadow-[0px_10px_40px_rgba(0,0,0,0.04)]">
        <h3 className="text-[18px] lg:text-[20px] font-[600] leading-[28px] text-[#141a1f] mb-[16px] lg:mb-[24px]">Partner Information</h3>
        <div className="w-full h-[1px] bg-[#f1f2f4] -mx-[20px] lg:-mx-[40px] px-[40px] lg:px-[80px] mb-[24px] lg:mb-[32px]"></div>

        <div className="flex flex-col gap-[20px] lg:gap-[24px] max-w-[800px]">

          {/* Company Name */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">Company name</label>
            <input 
              type="text" 
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="example: Joe"
              className="flex flex-row items-center py-[10px] px-[16px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[44px] outline-none focus:border-[#141a1f] text-[15px] font-[400] text-[#141a1f]"
            />
          </div>

          {/* First Name */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">First name</label>
            <input 
              type="text" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="example: Joe"
              className="flex flex-row items-center py-[10px] px-[16px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[44px] outline-none focus:border-[#141a1f] text-[15px] font-[400] text-[#141a1f]"
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
              className="flex flex-row items-center py-[10px] px-[16px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] h-[44px] outline-none focus:border-[#141a1f] text-[15px] font-[400] text-[#141a1f]"
            />
          </div>

          {/* Logo Upload */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[14px] font-[600] leading-[20px] text-[#141a1f]">
              Attach Company Logo <span className="text-[#8e95a1] font-[400]">(max. 10mb)</span>
            </label>
            <div 
              className="flex items-center justify-center w-full h-[48px] border-[1px] border-[#e3351d] rounded-[4px] bg-[#ffffff] cursor-pointer hover:bg-[#e3351d]/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {logo ? (
                <span className="text-[14px] font-[500] text-[#e3351d]">Logo Selected (Click to change)</span>
              ) : (
                <div className="flex items-center gap-[8px]">
                  <Upload className="w-[18px] h-[18px] text-[#e3351d]" />
                  <span className="text-[14px] font-[500] text-[#e3351d]">Upload Image</span>
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

          <button type="submit" className="flex items-center justify-center py-[12px] px-[24px] rounded-[4px] bg-[#e3351d] hover:bg-[#d62e19] transition-colors self-end mt-[16px]">
            <span className="text-[14px] font-[500] text-[#ffffff]">Save Account</span>
          </button>
        </div>
      </form>
      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/40 px-[16px]">
          <div className="flex flex-col w-full max-w-[540px] rounded-[10px] bg-[#ffffff] shadow-[0px_20px_60px_rgba(0,0,0,0.15)] relative">
            <div className="pt-[24px] lg:pt-[40px] pb-[24px] lg:pb-[32px] px-[24px] lg:px-[40px]">
              <h3 className="text-[20px] lg:text-[24px] font-[600] text-[#141a1f] mb-[16px] lg:mb-[24px]">Confirm Account Details</h3>
              <div className="w-full h-[1px] bg-[#f1f2f4] -mx-[24px] lg:-mx-[40px] px-[48px] lg:px-[80px] mb-[16px] lg:mb-[24px]"></div>
              
              <div className="flex flex-col gap-[20px]">
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">Company</label>
                  <input type="text" value={companyName} disabled className="h-[44px] px-[16px] rounded-[4px] bg-[#f6f7f9] text-[15px] font-[400] text-[#8e95a1] outline-none" />
                </div>
                
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">First Name</label>
                  <input type="text" value={firstName} disabled className="h-[44px] px-[16px] rounded-[4px] bg-[#f6f7f9] text-[15px] font-[400] text-[#8e95a1] outline-none" />
                </div>
                
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">Last Name</label>
                  <input type="text" value={surname} disabled className="h-[44px] px-[16px] rounded-[4px] bg-[#f6f7f9] text-[15px] font-[400] text-[#8e95a1] outline-none" />
                </div>

                <div className="flex flex-col gap-[8px]">
                  <label className="text-[14px] font-[600] text-[#141a1f]">Company Logo</label>
                  {logo ? (
                    <div className="w-[80px] h-[80px] border border-[#e2e5e9] rounded-[4px] flex items-center justify-center bg-white p-2">
                      <img src={logo} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-[44px] px-[16px] rounded-[4px] border border-[#e3351d] text-[15px] font-[400] text-[#8e95a1] flex items-center">
                      No Logo Attached
                    </div>
                  )}
                </div>

                <div className="w-full h-[1px] bg-[#f1f2f4] my-[8px]"></div>

                <div className="flex gap-[24px]">
                  <div className="flex flex-col gap-[8px] flex-1 min-w-0">
                    <label className="text-[13px] lg:text-[14px] font-[600] text-[#141a1f] whitespace-nowrap">Assigned Username</label>
                    <input type="text" value={generatedUsername} disabled className="h-[44px] px-[16px] rounded-[4px] bg-[#f6f7f9] text-[15px] font-[400] text-[#8e95a1] outline-none" />
                  </div>
                  <div className="flex flex-col gap-[8px] flex-1 min-w-0">
                    <label className="text-[13px] lg:text-[14px] font-[600] text-[#141a1f] whitespace-nowrap">Default Password</label>
                    <input type="text" value={generatedPassword} disabled className="h-[44px] px-[16px] rounded-[4px] bg-[#f6f7f9] text-[15px] font-[400] text-[#8e95a1] outline-none" />
                  </div>
                </div>

                <div className="flex justify-between items-center mt-[24px]">
                  <button type="button" onClick={() => setShowConfirmModal(false)} className="text-[15px] font-[500] text-[#e3351d] hover:underline">
                    Go Back
                  </button>
                  <button type="button" onClick={handleConfirmAndSend} className="py-[12px] px-[24px] rounded-[4px] bg-[#e3351d] hover:bg-[#d62e19] text-[15px] font-[500] text-[#ffffff] transition-colors">
                    Confirm and Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141a1f]/40 px-[16px]">
          <div className="flex flex-col w-full max-w-[360px] rounded-[10px] bg-[#ffffff] shadow-[0px_20px_60px_rgba(0,0,0,0.15)] relative">
            <button onClick={handleShareDone} className="absolute top-[20px] right-[20px] text-[#5c6470] hover:text-[#141a1f]">
              <X className="w-[20px] h-[20px]" />
            </button>
            <div className="px-[32px] pt-[32px] pb-[20px]">
              <h3 className="text-[18px] font-[600] text-[#e3351d]">Share Sign In Details</h3>
            </div>
            <div className="w-full h-[1px] bg-[#f1f2f4] mb-[8px]"></div>
            
            <div className="flex flex-row justify-between items-center px-[40px] py-[32px]">
              <div className="flex flex-col items-center gap-[12px] cursor-pointer hover:opacity-80" onClick={handleShareWhatsApp}>
                <MessageCircle className="w-[28px] h-[28px] text-[#5c6470]" />
                <span className="text-[13px] font-[500] text-[#8e95a1]">WhatsApp</span>
              </div>
              <div className="flex flex-col items-center gap-[12px] cursor-pointer hover:opacity-80" onClick={handleShareEmail}>
                <Mail className="w-[28px] h-[28px] text-[#5c6470]" />
                <span className="text-[13px] font-[500] text-[#8e95a1]">Gmail</span>
              </div>
              <div className="flex flex-col items-center gap-[12px] cursor-pointer hover:opacity-80" onClick={handleCopyLink}>
                <Copy className="w-[28px] h-[28px] text-[#5c6470]" />
                <span className="text-[13px] font-[500] text-[#8e95a1]">Copy</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
