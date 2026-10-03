import { X } from "lucide-react";
import type { FuelRequest } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * One tank draw, opened from a table's 3-dots.
 *
 * The queue only ever shows a row's headline — ref, fuel, litres, who it is
 * for. The rest of the story (the plate, the note, WHO cleared it, what it
 * cost at the TM's price) is on the row itself, because the person asking
 * "what happened to FQ-00012?" is usually the raiser checking his own request.
 */
function stamp(iso: string | null | undefined) {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: FuelRequest["status"]) {
  return status === "Dispensed"
    ? "bg-[#E7F6EC] text-[#137A3D]"
    : status === "Authorized"
      ? "bg-[#FFF3D6] text-[#8A5A00]"
      : status === "Declined"
        ? "bg-[#FDECEA] text-[#C0392B]"
        : "bg-[#EAF1FF] text-[#1B4FA0]";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-1 border-b border-[#F1F2F4] py-2.5">
      <span className="text-[11.4px] uppercase tracking-[0.4px] text-[#8A93A0]">{label}</span>
      <span className="text-[14px] leading-5 tracking-[0.4px] text-[#1B2432]">{value}</span>
    </div>
  );
}

export function FuelRequestDetails({
  row,
  onClose,
}: {
  row: FuelRequest | null;
  onClose: () => void;
}) {
  if (!row) return null;

  const money = row.amount || row.unitPrice * row.quantity;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#141A1F]/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Fuel request ${row.reference}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-[620px] max-w-full flex-col overflow-hidden rounded-[10px] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.2)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E5E9] px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.4px] uppercase tracking-[0.4px] text-[#8A93A0]">
              Fuel request
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[20px] font-semibold tabular-nums tracking-[0.4px] text-[#1B2432]">
                {row.reference}
              </span>
              <span
                className={cn("rounded px-2 py-1 text-[12px] font-medium", statusClass(row.status))}
              >
                {row.status}
              </span>
            </div>
            <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">
              {row.fuelType} · {row.quantity.toLocaleString()} {row.unit}
              {row.requestedFor ? ` for ${row.requestedFor}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4] hover:text-[#1B2432]"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="sleek-scrollbar overflow-y-auto px-6 py-3">
          <p className="pb-1 text-[13px] font-semibold tracking-[0.4px] text-[#1B2432]">The ask</p>
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <Field label="Source" value={row.source} />
            <Field label="Quantity" value={`${row.quantity.toLocaleString()} ${row.unit}`} />
            <Field label="Requested by" value={row.requestedBy} />
            <Field label="Raised with" value={row.requestedByEmail} />
            <Field label="Fuel is for" value={row.requestedFor || "Petroline — our own draw"} />
            <Field label="Raised at" value={stamp(row.createdAt)} />
            <Field label="Purpose" value={row.purpose} />
            <Field label="Plate number" value={row.plateNumber} />
            <Field label="Buyer phone" value={row.buyerPhone} />
            <Field label="Note" value={row.note} />
          </div>

          <p className="pt-5 pb-1 text-[13px] font-semibold tracking-[0.4px] text-[#1B2432]">
            The desk
          </p>
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <Field
              label="Authorized"
              value={
                row.authorizedBy
                  ? `${row.authorizedBy}${row.authorizedAt ? ` · ${stamp(row.authorizedAt)}` : ""}`
                  : ""
              }
            />
            <Field
              label="Dispensed"
              value={
                row.dispensedBy
                  ? `${row.dispensedBy}${row.dispensedAt ? ` · ${stamp(row.dispensedAt)}` : ""}`
                  : ""
              }
            />
            <Field
              label="Declined"
              value={
                row.declinedBy
                  ? `${row.declinedBy}${row.declinedAt ? ` · ${stamp(row.declinedAt)}` : ""}`
                  : ""
              }
            />
            <Field label="Decline reason" value={row.declineReason} />
            <Field
              label="Price per litre"
              value={row.unitPrice ? `₦${row.unitPrice.toLocaleString()}` : ""}
            />
            <Field label="Amount" value={money ? `₦${money.toLocaleString()}` : ""} />
            <Field label="Payment" value={row.paymentStatus} />
            <Field label="Last updated" value={stamp(row.updatedAt)} />
          </div>

          {!row.authorizedBy && !row.dispensedBy && !row.declinedBy && (
            <p className="pt-4 text-[13px] leading-5 text-[#5C6470]">
              Still waiting on the diesel attendant. Nothing leaves the tank until the desk
              authorises and dispenses it.
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-[#E2E5E9] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded bg-[#1B2432] px-5 text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#0F1620]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
