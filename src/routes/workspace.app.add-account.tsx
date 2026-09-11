import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Download, MoreVertical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PortalOverlay, WhatsAppIcon } from "@/components/fleetopsx/portal-overlay";
import { ADMIN_DEPARTMENTS, departmentToRoleKey } from "@/lib/fleetopsx/admin-departments";
import { adminService, authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/add-account")({
  component: AdminAddAccount,
});

function buildUsername(firstName: string, surname: string) {
  if (!firstName || !surname) return "";
  return `${firstName[0]!.toUpperCase()}.${surname[0]!.toUpperCase()}${surname.slice(1)}`;
}

function generateSharePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < bytes.length; i++) body += alphabet[bytes[i]! % alphabet.length];
  return `Tmp${body}!`;
}

function AdminAddAccount() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const deptRef = useRef<HTMLDivElement>(null);

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [department, setDepartment] = useState("");
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [role, setRole] = useState("");
  const [staffId, setStaffId] = useState("");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [generatedPassword] = useState(() => generateSharePassword());

  const generatedUsername = buildUsername(firstName.trim(), surname.trim());

  useEffect(() => {
    if (!showDeptDropdown) return;
    const onDoc = (e: MouseEvent) => {
      if (!deptRef.current?.contains(e.target as Node)) setShowDeptDropdown(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showDeptDropdown]);

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
        roles: [departmentToRoleKey(department)],
        username: generatedUsername,
        department,
        staffId,
        companyId: currentUser?.companyId,
        password: generatedPassword,
      });
      toast.success("Staff account created.");
      setShowConfirmModal(false);
      setShowShareModal(true);
    } catch {
      toast.error("Failed to create user.");
    }
  };

  const shareText = `Hello ${firstName},\n\nYour account has been created for Transport Manager Portal.\nUsername: ${generatedUsername}\nPassword: ${generatedPassword}\nLogin at: ${window.location.origin}`;

  const handleShareDone = () => {
    setShowShareModal(false);
    navigate({ to: "/workspace/app/manage-account" });
  };

  const fieldClass =
    "h-10 w-full rounded border border-[#E2E5E9] bg-transparent px-[12.067px] text-[14px] font-normal tracking-[0.4px] text-[#141A1F] shadow-[0px_4px_10px_0px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]";

  const readOnlyClass =
    "flex h-10 w-full items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-[12.067px] text-[14px] font-normal tracking-[0.4px] text-[#5C6470] shadow-[0px_4px_10px_0px_rgba(0,0,0,0.05)]";

  return (
    <>
      {/* Figma 59:1020 content — padding 30px, gap 20px */}
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Create Staff Account</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              create the digital profile of internal staff
            </p>
          </div>

          <div className="relative md:hidden">
            <button type="button" onClick={() => setShowMoreMenu((v) => !v)} className="p-1">
              <MoreVertical className="size-5 text-[#141A1F]" />
            </button>
            {showMoreMenu && (
              <div className="absolute top-8 right-0 z-40 w-40 rounded border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-[#141A1F] hover:bg-[#F1F2F4]"
                  onClick={() => {
                    setShowMoreMenu(false);
                    toast.message("Import not available yet", {
                      description: "Bulk staff import will connect to the live CSV endpoint next.",
                    });
                  }}
                >
                  <Download className="size-3.5" /> Import CVS
                </button>
              </div>
            )}
          </div>

          {/* Figma: Import CVS only — 123×32, no Export */}
          <button
            type="button"
            onClick={() =>
              toast.message("Import not available yet", {
                description: "Bulk staff import will connect to the live CSV endpoint next.",
              })
            }
            className="hidden h-8 w-[123px] items-center gap-[5px] rounded px-[7px] py-[5px] md:flex"
          >
            <Download className="size-[18px] text-[#1B2432]" strokeWidth={1.5} />
            <span className="text-[14px] font-medium leading-5 tracking-[0.4px] text-[#1B2432]">Import CVS</span>
          </button>
        </div>

        <form
          onSubmit={handleSaveAccountClick}
          className="flex w-full flex-col items-end gap-6 rounded-[10px] border border-[#E2E5E9] bg-white px-5 pt-[23.53px] pb-[24.06px] shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]"
        >
          <div className="w-full border-b border-[#E2E5E9] py-[5px]">
            <h3 className="h-8 text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Staff Information</h3>
          </div>

          <div className="flex w-full flex-col gap-3">
            <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="example: Joe"
              className={fieldClass}
            />
          </div>

          <div className="flex w-full flex-col gap-3">
            <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Surname</label>
            <input
              type="text"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              placeholder="example: Doe"
              className={fieldClass}
            />
          </div>

          <div ref={deptRef} className="relative flex w-full flex-col gap-3">
            <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Assign Department</label>
            <button
              type="button"
              onClick={() => setShowDeptDropdown((v) => !v)}
              className="flex h-10 w-full items-center justify-between rounded border border-[#E2E5E9] bg-white px-[12.067px] shadow-[0px_1px_2px_rgba(12,12,13,0.1),0px_1px_2px_rgba(12,12,13,0.05)]"
            >
              <span
                className={`text-[14px] font-medium leading-5 tracking-[0.4px] ${department ? "text-[#141A1F]" : "text-[#5C6470]"}`}
              >
                {department || "Select"}
              </span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 6L8 10L12 6" stroke="#5C6470" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Figma 93:1374 department checklist */}
            {showDeptDropdown && (
              <div className="absolute top-[62px] left-0 z-40 w-full overflow-hidden rounded border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                {ADMIN_DEPARTMENTS.map((dept) => {
                  const selected = department === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => {
                        setDepartment(dept);
                        setShowDeptDropdown(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F1F2F4]"
                    >
                      <span
                        className={`flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] ${
                          selected ? "border-[#ED351D] bg-[#ED351D]" : "border-[#5C6470] bg-white"
                        }`}
                      >
                        {selected && <Check className="size-3 text-white" strokeWidth={2.5} />}
                      </span>
                      <span className="text-[14px] font-normal leading-5 tracking-[0.4px] text-[#5C6470]">{dept}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-3">
            <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="example: Dispatcher"
              className={fieldClass}
            />
          </div>

          <div className="flex w-full flex-col gap-3">
            <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Staff ID</label>
            <input
              type="text"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              placeholder="example: PTL-FL-005"
              className={fieldClass}
            />
          </div>

          <button
            type="submit"
            className="flex h-10 w-[149px] items-center justify-center rounded bg-[#ED351D] px-3 hover:bg-[#d62e19]"
          >
            <span className="text-[14px] font-medium leading-5 tracking-[0.4px] text-white">Save Account</span>
          </button>
        </form>
      </div>

      {/* Confirm — Figma 245:3369 */}
      {showConfirmModal && (
        <PortalOverlay onBackdropClick={() => setShowConfirmModal(false)}>
          <div
            className="flex max-h-[90vh] w-full max-w-[580px] flex-col overflow-y-auto rounded-[10px] bg-white px-5 py-6 shadow-[0px_10px_40px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
              Confirm Account Details
            </h3>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Staff ID</label>
                <div className={readOnlyClass}>{staffId}</div>
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">First Name</label>
                <div className={readOnlyClass}>{firstName}</div>
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Last Name</label>
                <div className={readOnlyClass}>{surname}</div>
              </div>

              <div className="flex flex-col gap-5 sm:flex-row sm:gap-5">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Department</label>
                  <div className={readOnlyClass}>{department}</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Role</label>
                  <div className={readOnlyClass}>{role}</div>
                </div>
              </div>

              <div className="h-px w-full bg-[#E2E5E9]" />

              <div className="flex flex-col gap-5 sm:flex-row sm:gap-5">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Username</label>
                  <div className={readOnlyClass}>{generatedUsername}</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <label className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
                    Default Password
                  </label>
                  <div className={readOnlyClass}>{generatedPassword}</div>
                </div>
              </div>

              <div className="h-px w-full bg-[#E2E5E9]" />

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex h-10 w-[149px] items-center justify-center rounded px-3 text-[14px] font-medium leading-5 tracking-[0.4px] text-[#ED351D]"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAndSend}
                  className="flex h-10 items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium leading-5 tracking-[0.4px] text-white hover:bg-[#d62e19]"
                >
                  Confirm and Send Details
                </button>
              </div>
            </div>
          </div>
        </PortalOverlay>
      )}

      {/* Share — Figma 245:3465 */}
      {showShareModal && (
        <PortalOverlay onBackdropClick={handleShareDone}>
          <div
            className="relative w-[320px] rounded-[10px] bg-white shadow-[0px_10px_40px_rgba(0,0,0,0.08)] sm:w-[360px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleShareDone}
              className="absolute top-5 right-5 text-[#8E95A1] hover:text-[#141A1F]"
            >
              <X className="size-4" />
            </button>
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-[16px] font-semibold text-[#ED351D]">Share Sign In Details</h3>
            </div>
            <div className="h-px w-full bg-[#E2E5E9]" />
            <div className="flex items-center justify-between px-10 py-8">
              <button
                type="button"
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
                  handleShareDone();
                }}
              >
                <WhatsAppIcon className="size-6" />
                <span className="text-[12px] font-medium text-[#5C6470]">WhatsApp</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  window.open(`mailto:?subject=Your Account Details&body=${encodeURIComponent(shareText)}`, "_blank");
                  handleShareDone();
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M2 5V19H22V5H2ZM20 7V7.12L12 11.95L4 7.12V7H20ZM4 17V9.45L11.48 13.97C11.64 14.07 11.82 14.12 12 14.12C12.18 14.12 12.36 14.07 12.52 13.97L20 9.45V17H4Z"
                    fill="#141A1F"
                  />
                </svg>
                <span className="text-[12px] font-medium text-[#5C6470]">Gmail</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  void navigator.clipboard.writeText(shareText);
                  toast.success("Details copied to clipboard");
                  handleShareDone();
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M19 21H8V7H19M19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1Z"
                    fill="#141A1F"
                  />
                </svg>
                <span className="text-[12px] font-medium text-[#5C6470]">Copy</span>
              </button>
            </div>
          </div>
        </PortalOverlay>
      )}

      {showMoreMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
      )}
    </>
  );
}
