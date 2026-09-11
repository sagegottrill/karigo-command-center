import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X, Upload, Copy, Mail, MoreVertical } from "lucide-react";
import { useState, useRef } from "react";
import { PortalOverlay, WhatsAppIcon } from "@/components/fleetopsx/portal-overlay";
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
  const [generatedPassword] = useState(() => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    let body = "";
    for (let i = 0; i < bytes.length; i++) body += alphabet[bytes[i]! % alphabet.length];
    return `Tmp${body}!`;
  });

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
    if (!logo) {
      toast.error("Please upload a company logo.");
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
        companyId: tenantCompanyId,
        partnerCompanyName: companyName,
        password: generatedPassword,
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
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-row justify-between items-center w-full lg:w-auto">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Create Partner Account</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              create the digital profile of partner company
            </p>
          </div>
          <button className="lg:hidden p-2 text-[#141a1f]">
            <MoreVertical className="w-[20px] h-[20px]" />
          </button>
        </div>
        <button
          type="button"
          onClick={() =>
            toast.message("Import not available yet", {
              description: "Bulk partner import will connect to the live CSV endpoint next.",
            })
          }
          className="hidden lg:flex items-center gap-[8px] px-[16px] py-[8px] text-[#141a1f] hover:bg-gray-200/50 rounded-md transition-colors font-[500] text-[14px]"
        >
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
              placeholder="example: Saba Steel"
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
              Attach Company Logo <span className="text-[#ED351D] font-[400]">*</span>{" "}
              <span className="text-[#8e95a1] font-[400]">(max. 10mb)</span>
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
            <span className="text-[14px] font-[500] text-[#ffffff]">Save Partner</span>
          </button>
        </div>
      </form>
      {/* Confirm Modal */}
      {showConfirmModal && (
        <PortalOverlay onBackdropClick={() => setShowConfirmModal(false)}>
          <div
            className="relative flex w-full max-w-[540px] flex-col rounded-[10px] bg-white shadow-[0px_20px_60px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-6 lg:px-10 lg:pt-10 lg:pb-8">
              <h3 className="mb-4 text-[20px] font-semibold text-[#141A1F] lg:mb-6 lg:text-[24px]">Confirm Partner Details</h3>
              <div className="mb-4 h-px w-full bg-[#F1F2F4] lg:mb-6" />

              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[14px] font-semibold text-[#141A1F]">Company</label>
                  <input type="text" value={companyName} disabled className="h-11 rounded border-0 bg-[#F6F7F9] px-4 text-[15px] text-[#8E95A1] outline-none" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[14px] font-semibold text-[#141A1F]">First Name</label>
                  <input type="text" value={firstName} disabled className="h-11 rounded border-0 bg-[#F6F7F9] px-4 text-[15px] text-[#8E95A1] outline-none" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[14px] font-semibold text-[#141A1F]">Last Name</label>
                  <input type="text" value={surname} disabled className="h-11 rounded border-0 bg-[#F6F7F9] px-4 text-[15px] text-[#8E95A1] outline-none" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[14px] font-semibold text-[#141A1F]">Company Logo</label>
                  {logo ? (
                    <div className="flex size-20 items-center justify-center rounded border border-[#E2E5E9] bg-white p-2">
                      <img src={logo} alt="Company Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-11 items-center rounded border border-[#ED351D] px-4 text-[15px] text-[#8E95A1]">
                      No Logo Attached
                    </div>
                  )}
                </div>

                <div className="my-2 h-px w-full bg-[#F1F2F4]" />

                <div className="flex gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <label className="whitespace-nowrap text-[13px] font-semibold text-[#141A1F] lg:text-[14px]">Assigned Username</label>
                    <input type="text" value={generatedUsername} disabled className="h-11 rounded border-0 bg-[#F6F7F9] px-4 text-[15px] text-[#8E95A1] outline-none" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <label className="whitespace-nowrap text-[13px] font-semibold text-[#141A1F] lg:text-[14px]">Default Password</label>
                    <input type="text" value={generatedPassword} disabled className="h-11 rounded border-0 bg-[#F6F7F9] px-4 text-[15px] text-[#8E95A1] outline-none" />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button type="button" onClick={() => setShowConfirmModal(false)} className="text-[15px] font-medium text-[#ED351D] hover:underline">
                    Go Back
                  </button>
                  <button type="button" onClick={handleConfirmAndSend} className="rounded bg-[#ED351D] px-6 py-3 text-[15px] font-medium text-white hover:bg-[#d62e19]">
                    Confirm and Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PortalOverlay>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <PortalOverlay onBackdropClick={handleShareDone}>
          <div
            className="relative flex w-full max-w-[360px] flex-col rounded-[10px] bg-white shadow-[0px_20px_60px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={handleShareDone} className="absolute top-5 right-5 text-[#5C6470] hover:text-[#141A1F]">
              <X className="size-5" />
            </button>
            <div className="px-8 pt-8 pb-5">
              <h3 className="text-[18px] font-semibold text-[#ED351D]">Share Sign In Details</h3>
            </div>
            <div className="mb-2 h-px w-full bg-[#F1F2F4]" />

            <div className="flex items-center justify-between px-10 py-8">
              <button type="button" className="flex flex-col items-center gap-3 hover:opacity-80" onClick={handleShareWhatsApp}>
                <WhatsAppIcon className="size-7" />
                <span className="text-[13px] font-medium text-[#8E95A1]">WhatsApp</span>
              </button>
              <button type="button" className="flex flex-col items-center gap-3 hover:opacity-80" onClick={handleShareEmail}>
                <Mail className="size-7 text-[#5C6470]" />
                <span className="text-[13px] font-medium text-[#8E95A1]">Gmail</span>
              </button>
              <button type="button" className="flex flex-col items-center gap-3 hover:opacity-80" onClick={handleCopyLink}>
                <Copy className="size-7 text-[#5C6470]" />
                <span className="text-[13px] font-medium text-[#8E95A1]">Copy</span>
              </button>
            </div>
          </div>
        </PortalOverlay>
      )}
    </div>
  );
}
