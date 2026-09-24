import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import {
  StaffRecordForm,
  emptyStaffDraft,
  type StaffDraft,
} from "@/components/fleetopsx/hr-staff-form";
import {
  HR_ACCESS_ROLES,
  employmentStatusForWrite,
  nextStaffNumber,
  rolesCanMaintainStaff,
} from "@/lib/fleetopsx/hr-helpers";
import { authService, driverService } from "@/lib/fleetopsx/services";
import type { Driver } from "@/lib/fleetopsx/types";

/**
 * Onboarding a staff member is a PAGE, not a dialog.
 *
 * The record has ten fields on it and a document to attach; a dialog that size
 * scrolls, hides its own footer and loses the field you were on when the roster
 * reloads behind it. The department draws it as a screen with a way back, and
 * that is what it is: the one place a new person enters the register.
 */
export const Route = createFileRoute("/workspace/app/hr-onboard")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: OnboardStaffPage,
});

function OnboardStaffPage() {
  const navigate = useNavigate();
  // Decided after mount: the session lives in localStorage, so a server render
  // cannot know the role, and a first-paint guess would hydrate mismatched.
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState<StaffDraft>(() => emptyStaffDraft());
  /** Read only, to suggest the next payroll number the register will accept. */
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const roles = authService.getRoles();
    setCanEdit(rolesCanMaintainStaff());
    if (!roles.some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    void driverService
      .list()
      .then((list) => {
        setDrivers(list);
        // Pre-fill with the next free number in the register's own series, so
        // the field is a confirmation rather than a blank the roster will
        // silently reject as a duplicate.
        setDraft((d) => (d.staffId ? d : { ...d, staffId: nextStaffNumber(list) }));
      })
      .catch(() => toast.error("Could not read the staff register to suggest the next number."));
  }, []);

  const goBack = () => navigate({ to: "/workspace/app/hr" });

  const submit = async () => {
    const staffId = draft.staffId.trim().toUpperCase();
    if (!staffId) {
      toast.error("Staff Salary Number is required.");
      return;
    }
    if (!draft.department.trim()) {
      toast.error("Choose the department the staff member belongs to.");
      return;
    }
    if (!draft.name.trim()) {
      toast.error("Full Name is required.");
      return;
    }
    if (!draft.phone.trim()) {
      toast.error("Phone Number is required — it is the number dispatchers and the tracking desk call.");
      return;
    }
    setSaving(true);
    try {
      // Every field on this form is a live Driver column, so nothing typed here
      // is quietly dropped. Blank optional fields go as "" so a cleared
      // guarantor clears, rather than keeping the previous value.
      const created = await driverService.create({
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        staffId,
        department: draft.department.trim(),
        status: employmentStatusForWrite(draft.status),
        licenseNumber: draft.licenseNumber.trim(),
        licenseExpiry: draft.licenseExpiry.trim(),
        category: draft.licenseCategory.trim(),
        truckReg: draft.truckReg.trim(),
        truckReg2: draft.truckReg2.trim(),
        guarantorName: draft.guarantorName.trim(),
        guarantorPhone: draft.guarantorPhone.trim(),
      } as never);

      /*
       * The licence document is attached on its own request, and only once the
       * record exists to attach it to — the bytes are the one part of this form
       * that cannot travel with the create. If it fails, the person is still
       * onboarded: losing a scanned licence must never lose the staff record.
       */
      if (draft.licenceFile && created?.id) {
        try {
          await driverService.attachLicence(created.id, draft.licenceFile.name, draft.licenceFile.dataUrl);
        } catch (err) {
          toast.error(
            `${draft.name.trim()} was onboarded, but the licence document did not attach.`,
            { description: err instanceof Error ? err.message : "Attach it from Edit Staff Record." },
          );
        }
      }

      toast.success(`${draft.name.trim()} onboarded as ${staffId}.`);
      goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to onboard staff";
      toast.error(
        /unique|409/i.test(msg) ? `Staff Salary Number ${staffId} is already assigned to another driver.` : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DepartmentTabs department="hr" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to staff records"
            className="grid size-8 place-items-center rounded text-[#1B2432] hover:bg-[#E2E5E9]"
          >
            <ArrowLeft className="size-5" strokeWidth={1.75} />
          </button>
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Onboard New Staff</h2>
        </div>

        {!canEdit && (
          <span className="w-fit rounded bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
            View only — HR &amp; Personnel maintains these records
          </span>
        )}

        <fieldset disabled={!canEdit || saving} className="flex flex-col gap-5">
          <StaffRecordForm value={draft} onChange={setDraft} />

          <section className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white px-5 pb-5 pt-4 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E5E9] pt-4">
              <button
                type="button"
                onClick={goBack}
                className="text-[14px] font-medium tracking-[0.4px] text-[#ED351D] hover:underline"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canEdit || saving}
                className="flex h-9 items-center rounded bg-[#ED351D] px-3 text-[12px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19] disabled:opacity-60"
              >
                {saving ? "Onboarding…" : "Confirm New Staff"}
              </button>
            </div>
          </section>
        </fieldset>
      </div>
    </>
  );
}
