import { useRef } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_STATUSES,
  HR_DEPARTMENTS,
  employmentStatusOf,
  type EmploymentStatus,
} from "@/lib/fleetopsx/hr-helpers";
import type { Driver } from "@/lib/fleetopsx/types";

/**
 * EVERY FIELD HR CAN WRITE ON A STAFF RECORD, in one shape.
 *
 * The onboard page and the edit dialog are the same form twice: same labels,
 * same order, same two cards. They used to be two hand-written dialogs that had
 * already drifted — the editor knew about the licence class and the truck
 * pairing, the onboard form did not, and neither could attach the licence
 * document it asked for. One draft, one form, both screens.
 */
export type StaffDraft = {
  /** The payroll number — the "Staff Salary Number" on the record. */
  staffId: string;
  department: string;
  name: string;
  phone: string;
  licenseNumber: string;
  /** yyyy-mm-dd, the shape <input type="date"> reads and writes. */
  licenseExpiry: string;
  /** EMPLOYMENT, not duty: Active / On Leave / Suspended. */
  status: EmploymentStatus;
  guarantorName: string;
  guarantorPhone: string;
  /** Licence class — "Professional", "Heavy Duty"… stored as `category`. */
  licenseCategory: string;
  /** The truck normally paired with this driver: head (cap/plate) and tail. */
  truckReg: string;
  truckReg2: string;
  /**
   * A licence document chosen in THIS visit, held as bytes until the record
   * exists to attach it to. Null means "leave whatever is on file alone" — a
   * form that cannot tell those two apart deletes a scan by being opened.
   */
  licenceFile: { name: string; dataUrl: string } | null;
  /** Explicitly take the document off file. Never implied by an empty field. */
  removeLicence: boolean;
};

export const emptyStaffDraft = (): StaffDraft => ({
  staffId: "",
  department: "",
  name: "",
  phone: "",
  licenseNumber: "",
  licenseExpiry: "",
  status: "Active",
  guarantorName: "",
  guarantorPhone: "",
  licenseCategory: "",
  truckReg: "",
  truckReg2: "",
  licenceFile: null,
  removeLicence: false,
});

/** The same form, opened on an existing record. */
export function draftFromDriver(driver: Driver): StaffDraft {
  return {
    staffId: driver.salaryNumber || driver.employeeId || "",
    department: driver.department || "",
    name: driver.name,
    phone: driver.phone ?? "",
    licenseNumber: driver.licenseNumber ?? "",
    // A stored stamp still fills a date input, which only reads yyyy-mm-dd.
    licenseExpiry: (driver.licenseExpiry ?? "").slice(0, 10),
    status: employmentStatusOf(driver),
    guarantorName: driver.guarantorName ?? "",
    guarantorPhone: driver.guarantorPhone ?? "",
    licenseCategory: driver.licenseCategory ?? "",
    truckReg: driver.assignedTruck ?? "",
    truckReg2: driver.assignedTail ?? "",
    licenceFile: null,
    removeLicence: false,
  };
}

/** The cap the form promises, and the server enforces. */
export const LICENCE_MAX_BYTES = 10 * 1024 * 1024;
export const LICENCE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const LICENCE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * Read a chosen licence into the data URL the API stores.
 *
 * Checked here as well as on the server because the failure the user cares
 * about is "this file is too big", and finding that out after a 13 MB upload is
 * not an answer. Anything rejected throws with the reason to show.
 */
export async function readLicenceFile(file: File): Promise<{ name: string; dataUrl: string }> {
  if (file.size > LICENCE_MAX_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`);
  }
  if (file.type && !LICENCE_MIME.includes(file.type.toLowerCase())) {
    throw new Error("The licence must be a PDF or an image (JPG, PNG, WEBP).");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("That file could not be read. Try choosing it again."));
    reader.readAsDataURL(file);
  });
  if (!dataUrl.startsWith("data:")) throw new Error("That file could not be read. Try choosing it again.");
  return { name: file.name, dataUrl };
}

export const staffInputClass =
  "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";
const staffSelectClass = `${staffInputClass} bg-white`;

/** Label + control + optional hint — one shape for every field on the record. */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
        {label}
        {required ? <span className="text-[#ED351D]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-[#5C6470]">{hint}</span> : null}
    </label>
  );
}

/** One of the two cards the record is filed under. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]">
      <h3 className="border-b border-[#E2E5E9] pb-4 text-[18px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
        {title}
      </h3>
      <div className="grid gap-x-12 gap-y-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * The licence document slot: what is on file, and the way to replace it.
 *
 * The browser never lets a page re-fill a file input, so the name shown has to
 * come from the record — the file picker itself can only ever report the file
 * chosen in this visit.
 */
function LicenceFileField({
  chosen,
  attachedName,
  removing,
  onFile,
  onClear,
  onToggleRemove,
}: {
  chosen: { name: string; dataUrl: string } | null;
  attachedName?: string | null;
  removing: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onToggleRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = chosen ? chosen.name : removing ? "No File Chosen" : attachedName || "No File Chosen";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
        License Expiry{chosen ? " (max. size 10mb)" : ""}
      </span>
      <div className="flex h-10 w-full items-stretch overflow-hidden rounded border border-[#1B2432]">
        <span className="flex min-w-0 flex-1 items-center gap-2 bg-white px-3">
          {chosen ? <FileText className="size-4 shrink-0 text-[#5C6470]" /> : null}
          <span
            className={cn("truncate text-[14px] tracking-[0.4px]", chosen ? "text-[#141A1F]" : "text-[#5C6470]")}
            title={label}
          >
            {label}
          </span>
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "shrink-0 px-3 text-[13px] font-medium tracking-[0.4px]",
            chosen ? "bg-[#1B2432] text-white" : "bg-[#E2E5E9] text-[#141A1F]",
          )}
        >
          Choose File
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LICENCE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Reset so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />
      {chosen ? (
        <button
          type="button"
          onClick={onClear}
          className="w-fit text-[11px] font-medium text-[#5C6470] underline"
        >
          Undo this file
        </button>
      ) : attachedName ? (
        <button
          type="button"
          onClick={onToggleRemove}
          className={cn("w-fit text-[11px] font-medium underline", removing ? "text-[#5C6470]" : "text-[#ED351D]")}
        >
          {removing ? "Keep the document on file" : "Remove the document on file"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The record itself: what the department files a man under, and the licence
 * that lets him work.
 *
 * `extras` carries the three fields the register has always recorded that the
 * drawn record does not show — licence class and the truck pairing. They are
 * kept, in their own card, because the values are live columns the fleet desk
 * reads; dropping the control would leave them writable by nobody.
 */
export function StaffRecordForm({
  value,
  onChange,
  extras = false,
  /** The licence already attached to the record, if any. */
  attachedLicenceName,
}: {
  value: StaffDraft;
  onChange: (next: StaffDraft) => void;
  extras?: boolean;
  attachedLicenceName?: string | null;
}) {
  const set = <K extends keyof StaffDraft>(key: K, next: StaffDraft[K]) =>
    onChange({ ...value, [key]: next });

  const onFile = async (file: File) => {
    try {
      const read = await readLicenceFile(file);
      onChange({ ...value, licenceFile: read, removeLicence: false });
    } catch (err) {
      // The reason is the answer here — surface the size rather than silence.
      const { toast } = await import("sonner");
      toast.error(err instanceof Error ? err.message : "That file could not be attached.");
    }
  };

  return (
    <>
      <Card title="General Information">
        <Field label="Staff Salary Number" required hint="The payroll number the man is filed under.">
          <input
            value={value.staffId}
            onChange={(e) => set("staffId", e.target.value)}
            placeholder="eg: SL-00830"
            className={staffInputClass}
          />
        </Field>
        <Field label="Department" required>
          <select
            value={value.department}
            onChange={(e) => set("department", e.target.value)}
            className={staffSelectClass}
          >
            <option value="">Select</option>
            {HR_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full Name" required>
          <input
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="eg: John Doe"
            className={staffInputClass}
          />
        </Field>
        <Field label="Phone Number" required hint="Dispatchers and the tracking desk call this number.">
          <input
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="eg: 080 123 4567"
            className={staffInputClass}
          />
        </Field>
      </Card>

      <Card title="License and Guarantor">
        <Field label="License Number" hint={attachedLicenceName ? `${attachedLicenceName} is on file.` : undefined}>
          <input
            value={value.licenseNumber}
            onChange={(e) => set("licenseNumber", e.target.value)}
            placeholder="eg: DL-00830"
            className={staffInputClass}
          />
        </Field>
        <Field label="License Expiry Date" hint="The register flags it amber 60 days before, red once it passes.">
          <input
            type="date"
            value={value.licenseExpiry}
            onChange={(e) => set("licenseExpiry", e.target.value)}
            className={staffInputClass}
          />
        </Field>
        <LicenceFileField
          chosen={value.licenceFile}
          attachedName={attachedLicenceName}
          removing={value.removeLicence}
          onFile={(file) => void onFile(file)}
          onClear={() => set("licenceFile", null)}
          onToggleRemove={() =>
            onChange({ ...value, removeLicence: !value.removeLicence, licenceFile: null })
          }
        />
        <Field label="Employment Status" required hint="Active means he can be put on a dispatch today.">
          <select
            value={value.status}
            onChange={(e) => set("status", e.target.value as EmploymentStatus)}
            className={staffSelectClass}
          >
            <option value="">Select</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Guarantor Name">
          <input
            value={value.guarantorName}
            onChange={(e) => set("guarantorName", e.target.value)}
            placeholder="eg: Sara Chen"
            className={staffInputClass}
          />
        </Field>
        <Field label="Guarantor Phone Number">
          <input
            value={value.guarantorPhone}
            onChange={(e) => set("guarantorPhone", e.target.value)}
            placeholder="eg: 070 56 1456"
            className={staffInputClass}
          />
        </Field>
      </Card>

      {extras ? (
        <Card title="Truck Pairing">
          <Field label="License Class">
            <input
              value={value.licenseCategory}
              onChange={(e) => set("licenseCategory", e.target.value)}
              placeholder="example: Professional"
              className={staffInputClass}
            />
          </Field>
          <Field label="Assigned Truck Head" hint="Cap number or plate. Dispatch can still put him on another.">
            <input
              value={value.truckReg}
              onChange={(e) => set("truckReg", e.target.value)}
              placeholder="example: P073 or GGE98YK"
              className={staffInputClass}
            />
          </Field>
          <Field label="Assigned Truck Tail" hint="The tail normally paired with that head.">
            <input
              value={value.truckReg2}
              onChange={(e) => set("truckReg2", e.target.value)}
              placeholder="example: B056"
              className={staffInputClass}
            />
          </Field>
        </Card>
      ) : null}
    </>
  );
}
