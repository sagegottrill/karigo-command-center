import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { resolveTruck, truckLabel } from "@/lib/fleetopsx/engineering-helpers";
import { inventoryService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";
import type { InventoryItem, TruckHead, WorkOrder } from "@/lib/fleetopsx/types";

/**
 * The workshop asking the store for a part against a job.
 *
 * This is the first half of the parts loop the Transport Manager approves: the
 * request is raised here, priced here, and lands on his dashboard as a decision.
 * The price is snapshotted onto the request, so re-pricing the store item later
 * cannot rewrite what was asked for.
 *
 * Picking a part from the store links the request to that line (so approving it
 * draws the stock down). Typing a part the store does not hold is allowed and
 * normal — that is exactly the request the store cannot cover, which is what the
 * TM's inventory alerts are for.
 */
export function RaisePartsRequestModal({
  open,
  onClose,
  jobs,
  heads,
  items,
  initialJob,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Open jobs a part can be asked for. */
  jobs: WorkOrder[];
  heads: TruckHead[];
  items: InventoryItem[];
  /** Prefilled when raised from a job's own row menu. */
  initialJob?: WorkOrder | null;
  onCreated: () => void;
}) {
  const [jobId, setJobId] = useState("");
  const [part, setPart] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const truckOf = useMemo(
    () => (job: WorkOrder | undefined | null) => {
      if (!job) return "";
      const head = resolveTruck(job, heads);
      return head ? truckLabel(head) : job.truckReg;
    },
    [heads],
  );

  useEffect(() => {
    if (!open) return;
    setJobId(initialJob?.id ?? jobs[0]?.id ?? "");
    setPart("");
    setQuantity("1");
    setUnitCost("");
    setReason("");
    setSaving(false);
  }, [open, initialJob, jobs]);

  const job = jobs.find((j) => j.id === jobId) ?? initialJob ?? undefined;

  /** The store line a typed part name matches, if the workshop meant one. */
  const matchedItem = items.find(
    (i) => i.name.trim().toLowerCase() === part.trim().toLowerCase() && part.trim().length > 0,
  );

  const submit = async () => {
    if (!part.trim()) {
      toast.error("Name the part the job needs.");
      return;
    }
    if (!Number(quantity)) {
      toast.error("How many are needed?");
      return;
    }
    setSaving(true);
    try {
      await inventoryService.createRequisition({
        workOrder: job?.id ?? "",
        truckReg: job?.truckReg ?? "",
        mechanic: job?.mechanic && job.mechanic !== "Unassigned" ? job.mechanic : "",
        part: part.trim(),
        itemId: matchedItem?.id ?? "",
        quantity: Number(quantity),
        unitCost: Number(unitCost) || matchedItem?.unitCost || 0,
        reason: reason.trim(),
      });
      toast.success(
        `${part.trim()} requested${job ? ` for ${truckOf(job)}` : ""} — awaiting the Transport Manager's approval.`,
      );
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request was not saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass =
    "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Request parts"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[560px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">Request parts</h3>
            <p className="text-[12px] tracking-[0.4px] text-[#5C6470]">
              The request goes to the Transport Manager for approval before the store releases it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
            Job the part is for <span className="text-[#ED351D]">*</span>
          </span>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputClass}>
            {jobs.length === 0 ? <option value="">No open job on the floor</option> : null}
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {truckOf(j)} — {j.defect}
              </option>
            ))}
          </select>
          {job ? (
            <span className="text-[11px] text-[#5C6470]">
              {job.status} · mechanic {job.mechanic || "unassigned"}
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
              Part <span className="text-[#ED351D]">*</span>
            </span>
            <input
              value={part}
              onChange={(e) => {
                setPart(e.target.value);
                const hit = items.find(
                  (i) =>
                    i.name.trim().toLowerCase() === e.target.value.trim().toLowerCase() &&
                    e.target.value.trim().length > 0,
                );
                if (hit && !unitCost) setUnitCost(String(hit.unitCost || ""));
              }}
              list="store-parts"
              placeholder="eg: Brake pads"
              className={inputClass}
            />
            <datalist id="store-parts">
              {items.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
            <span className="text-[11px] text-[#5C6470]">
              {matchedItem
                ? `Stocked as ${matchedItem.sku} — ${matchedItem.stock} on the shelf, approving draws it down.`
                : "Not in the store — the request is recorded as one the store cannot cover."}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
              Quantity <span className="text-[#ED351D]">*</span>
            </span>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="numeric"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
              Unit price (₦)
            </span>
            <input
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Reason</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="eg: worn discs, replace both sides"
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-col gap-1 rounded bg-[#F1F2F4] px-3 py-2">
          <div className="flex items-center justify-between text-[12px] text-[#5C6470]">
            <span>Requested value</span>
            <span className="font-semibold text-[#1B2432]">
              ₦{((Number(quantity) || 0) * (Number(unitCost) || 0)).toLocaleString()}
            </span>
          </div>
          {matchedItem && matchedItem.stock < (Number(quantity) || 0) ? (
            <span className="text-[11px] text-[#B26A00]">
              The store holds {matchedItem.stock} — the Transport Manager will see this as short.
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className={cn(
              "h-9 rounded bg-[#ED351D] px-4 text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19]",
              saving && "opacity-60",
            )}
          >
            {saving ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </div>
    </div>
  );
}
