import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { inventoryService } from "@/lib/fleetopsx/services";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { cn } from "@/lib/utils";
import type { InventoryItem, InventoryRequisition, WorkOrder } from "@/lib/fleetopsx/types";

/** A head or tail waiting in the check-up / maintenance queue. */
export type CheckAsset = {
  id: string;
  kind: "head" | "tail";
  label: string;
  reg: string;
};

export const SEVERITIES = [
  "Minor (Operable with Repair)",
  "Major (Grounded for Repair)",
  "Critical (Grounded)",
] as const;

const inputClass =
  "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none bg-white";

export type PartLine = { part: string; itemId: string; quantity: number; unitCost: number };

function PartPicker({
  items,
  lines,
  onAdd,
  onRemove,
}: {
  items: InventoryItem[];
  lines: PartLine[];
  onAdd: (line: PartLine) => void;
  onRemove: (index: number) => void;
}) {
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState(1);
  const options = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const chosen = options.find((i) => i.id === partId);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px]">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#141A1F]">
            Select Spare Parts <span className="text-[#ED351D]">*</span>
          </span>
          <select value={partId} onChange={(e) => setPartId(e.target.value)} className={`${inputClass} bg-white`}>
            <option value="">Select a part…</option>
            {options.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.stock.toLocaleString("en-NG")} in stock
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#141A1F]">
            Quantity <span className="text-[#ED351D]">*</span>
          </span>
          <span className="flex h-10 items-center justify-between rounded border border-[#1B2432] px-1">
            <button
              type="button"
              aria-label="Decrease quantity"
              className="grid size-8 place-items-center rounded hover:bg-[#F1F2F4]"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="size-4" />
            </button>
            <span className="text-[14px] font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              className="grid size-8 place-items-center rounded hover:bg-[#F1F2F4]"
              onClick={() => setQty((q) => Math.min(999, q + 1))}
            >
              <Plus className="size-4" />
            </button>
          </span>
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!chosen) {
            toast.error("Select a spare part first.");
            return;
          }
          onAdd({ part: chosen.name, itemId: chosen.id, quantity: qty, unitCost: chosen.unitCost });
          setPartId("");
          setQty(1);
        }}
        className="h-10 rounded bg-[#1B2432] text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#2a3547]"
      >
        Add Spare Part
      </button>
      {lines.length > 0 ? (
        <div className="overflow-hidden rounded border border-[#E2E5E9]">
          <div className="grid grid-cols-[1fr_80px_44px] bg-[#F7F8FA] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
            <span>Part No.</span>
            <span className="text-right">Quantity</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div
              key={`${l.itemId}-${i}`}
              className="grid grid-cols-[1fr_80px_44px] items-center border-t border-[#E2E5E9] px-3 py-2 text-[13px]"
            >
              <span className="truncate font-medium text-[#1B2432]">{l.part}</span>
              <span className="text-right tabular-nums">{l.quantity.toLocaleString("en-NG")}</span>
              <button
                type="button"
                aria-label={`Remove ${l.part}`}
                className="ml-auto grid size-7 place-items-center rounded text-[#ED351D] hover:bg-[#FFF1EF]"
                onClick={() => onRemove(i)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-[#E2E5E9] bg-[#F7F8FA] px-3 py-2 text-[13px] font-semibold">
            <span>Total Parts Requested</span>
            <span className="tabular-nums">{lines.reduce((t, l) => t + l.quantity, 0)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The check-up verdict, as the approved design inspects it: no issues returns
 * the truck to Available; issues ground it to Maintenance with a defect log,
 * a severity, and an optional grouped spare-parts request for HOE review.
 */
export function InspectionDialog({
  asset,
  items,
  inspector,
  onClose,
  onDone,
}: {
  asset: CheckAsset;
  items: InventoryItem[];
  inspector: string;
  onClose: () => void;
  onDone: (group: string | null, result: "no-issues" | "issues") => void;
}) {
  const [result, setResult] = useState<"no-issues" | "issues">("no-issues");
  const [defect, setDefect] = useState("");
  const [severity, setSeverity] = useState<string>(SEVERITIES[0]);
  const [by, setBy] = useState(inspector);
  const [wantParts, setWantParts] = useState(false);
  const [lines, setLines] = useState<PartLine[]>([]);
  const [saving, setSaving] = useState(false);
  // Assign Engineer — a repair is rarely one pair of hands. Each line names an
  // engineer and the work THEY own, so the job carries the split instead of a
  // single name. Fed from the live staff register (Active accounts holding an
  // Engineering role); free text is still allowed for a name on no roster.
  const [assignments, setAssignments] = useState<Array<{ name: string; task: string }>>([
    { name: "", task: "" },
  ]);
  const [technicians, setTechnicians] = useState<string[]>([]);
  // External labour — work an outside workshop does on THIS truck. The charge
  // rides on the work order's cost, which Accounts reads as External Labour
  // against the truck's plate; it is never a loose figure on the page.
  const [external, setExternal] = useState({ workshop: "", cost: "" });
  /** What the outside workshop charges, as a number — read by the form and the
   *  pinned action bar, which states the amount and the truck it is booked to. */
  const externalCost = Number(external.cost.replace(/[^0-9.]/g, "")) || 0;

  useEffect(() => {
    let cancelled = false;
    inventoryService
      .technicians()
      .then((names) => {
        if (!cancelled && Array.isArray(names)) setTechnicians(names.map(String));
      })
      .catch(() => {}); // empty list just renders a plain text field
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (result === "issues" && !defect.trim()) {
      toast.error("Log the defect that was found.");
      return;
    }
    if (result === "issues" && wantParts && lines.length === 0) {
      toast.error("Add the spare parts the repair needs, or untick the request.");
      return;
    }
    // A work line with nobody against it would leave the job half-assigned.
    if (assignments.some((a) => !a.name.trim() && a.task.trim())) {
      toast.error("Name the engineer who does that work, or clear the work line.");
      return;
    }
    const crew = assignments
      .map((a) => ({ name: a.name.trim(), task: a.task.trim() }))
      .filter((a) => a.name);
    if (external.workshop.trim() && externalCost <= 0) {
      toast.error("Enter what the outside workshop charged for this truck.");
      return;
    }
    setSaving(true);
    try {
      const res = await inventoryService.logInspection({
        ...(asset.kind === "head" ? { headId: asset.id } : { tailId: asset.id }),
        truckReg: asset.reg,
        result,
        defect: defect.trim(),
        severity,
        inspectedBy: by.trim(),
        assignedTo: crew.map((a) => a.name).join(", ") || undefined,
        assignments: crew,
        externalLabour:
          externalCost > 0
            ? { workshop: external.workshop.trim(), cost: externalCost }
            : undefined,
        parts: result === "issues" && wantParts ? lines : [],
      });
      toast.success(
        result === "no-issues"
          ? `${asset.label} passed — back to Available.`
          : `${asset.label} → Under Maintenance${res.group ? ` · parts ${res.group} sent for HOE review` : ""}.`,
      );
      onDone(res.group ?? null, result);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The inspection was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Check-up inspection for ${asset.label}`}
      onClick={onClose}
    >
      <div
        className="my-6 flex max-h-[calc(100vh-48px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#1B2432] px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-white">Check-up Inspection</h3>
            <p className="text-[12px] text-white/60">{asset.label} • Inspection Verification</p>
          </div>
          <button
            type="button"
            aria-label="Close inspection"
            onClick={onClose}
            className="grid size-8 place-items-center rounded text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>
        {/* The body scrolls inside the capped modal so nothing — the crew lines,
            the external-labour block, the spare parts — hides under the fold,
            while the action bar below stays pinned and always reachable. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-[8px] border p-3.5",
              result === "no-issues" ? "border-[#34C759] bg-[#34C759]/5" : "border-[#E2E5E9]",
            )}
          >
            <input
              type="radio"
              name="verdict"
              checked={result === "no-issues"}
              onChange={() => setResult("no-issues")}
              className="mt-1 accent-[#ED351D]"
            />
            <span>
              <span className="block text-[14px] font-semibold text-[#1B2432]">
                Option 1: No Issues Identified
              </span>
              <span className="block text-[12px] text-[#5C6470]">
                Sets the fleet as Available on the fleet registry.
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-[8px] border p-3.5",
              result === "issues" ? "border-[#ED351D] bg-[#ED351D]/5" : "border-[#E2E5E9]",
            )}
          >
            <input
              type="radio"
              name="verdict"
              checked={result === "issues"}
              onChange={() => setResult("issues")}
              className="mt-1 accent-[#ED351D]"
            />
            <span>
              <span className="block text-[14px] font-semibold text-[#1B2432]">
                Option 2: Issues Identified
              </span>
              <span className="block text-[12px] text-[#5C6470]">
                Sets the fleet as Under Maintenance on the registry and enforces defect logging.
              </span>
            </span>
          </label>

          {result === "issues" ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium text-[#141A1F]">
                  Identified Defects <span className="text-[#ED351D]">*</span>
                </span>
                <textarea
                  value={defect}
                  onChange={(e) => setDefect(e.target.value)}
                  rows={3}
                  placeholder="The bearing is unhinged"
                  className="w-full rounded border border-[#1B2432] px-3 py-2 text-[14px] text-[#141A1F] outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium text-[#141A1F]">
                  Severity / Urgency <span className="text-[#ED351D]">*</span>
                </span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className={`${inputClass} bg-white`}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2.5 text-[14px] font-medium text-[#141A1F]">
                <input
                  type="checkbox"
                  checked={wantParts}
                  onChange={(e) => setWantParts(e.target.checked)}
                  className="size-4 accent-[#ED351D]"
                />
                Spare parts Request
              </label>
              {wantParts ? (
                <PartPicker
                  items={items}
                  lines={lines}
                  onAdd={(l) => setLines((prev) => [...prev, l])}
                  onRemove={(i) => setLines((prev) => prev.filter((_, x) => x !== i))}
                />
              ) : null}
            </>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-[#141A1F]">
              Inspected by <span className="text-[#ED351D]">*</span>
            </span>
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              placeholder="Engr. David Doe"
              className={inputClass}
            />
          </label>

          {result === "issues" ? (
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-medium text-[#141A1F]">
                Assign Engineer{assignments.length > 1 ? "s" : ""}
              </span>
              <p className="-mt-1 text-[12px] text-[#5C6470]">
                One line per engineer — say which part of the repair each takes.
              </p>
              {assignments.map((row, i) => (
                <div key={i} className="rounded-[8px] border border-[#E2E5E9] p-2.5">
                  <div className="flex items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[12px] font-medium text-[#141A1F]">
                        Engineer
                      </span>
                      <input
                        value={row.name}
                        onChange={(e) =>
                          setAssignments((prev) =>
                            prev.map((r, x) => (x === i ? { ...r, name: e.target.value } : r)),
                          )
                        }
                        list="engineer-roster"
                        placeholder="Pick from the roster or type a name"
                        className={`${inputClass} bg-white`}
                      />
                    </label>
                    {assignments.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove engineer ${i + 1}`}
                        onClick={() =>
                          setAssignments((prev) => prev.filter((_, x) => x !== i))
                        }
                        className="mb-1 grid size-9 shrink-0 place-items-center rounded border border-[#E2E5E9] text-[#ED351D] hover:bg-[#FFF1EF]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-2 flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-[#141A1F]">
                      Work to be done
                    </span>
                    <input
                      value={row.task}
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((r, x) => (x === i ? { ...r, task: e.target.value } : r)),
                        )
                      }
                      placeholder="e.g. Replace the front wheel bearing"
                      className={`${inputClass} bg-white`}
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setAssignments((prev) => [...prev, { name: "", task: "" }])
                }
                className="flex h-9 items-center justify-center gap-1.5 rounded border border-dashed border-[#9AA2AC] text-[13px] font-medium text-[#1B2432] hover:border-[#ED351D] hover:text-[#ED351D]"
              >
                <Plus className="size-4" />
                Add another engineer
              </button>
              <datalist id="engineer-roster">
                {technicians.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          ) : null}

          {result === "issues" ? (
            <div className="flex flex-col gap-2 rounded-[8px] border border-[#E2E5E9] p-2.5">
              <div>
                <span className="text-[14px] font-medium text-[#141A1F]">External Labour</span>
                <p className="text-[12px] text-[#5C6470]">
                  Work an outside workshop does on {asset.reg || "this truck"} — the charge
                  is booked to this truck as external labour.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px]">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#141A1F]">
                    Workshop / work done
                  </span>
                  <input
                    value={external.workshop}
                    onChange={(e) =>
                      setExternal((prev) => ({ ...prev, workshop: e.target.value }))
                    }
                    placeholder="e.g. Kenworth workshop — press the chassis"
                    className={`${inputClass} bg-white`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#141A1F]">Cost (₦)</span>
                  <input
                    value={external.cost}
                    onChange={(e) =>
                      setExternal((prev) => ({ ...prev, cost: e.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="0"
                    className={`${inputClass} bg-white`}
                  />
                </label>
              </div>
            </div>
          ) : null}

        </div>

        {/* Pinned action bar — never scrolls away from the operator. The left
            side states the money being booked and the truck it is booked to, so
            the external-labour entry is confirmed against the right vehicle. */}
        <div className="flex items-center justify-between gap-3 border-t border-[#E2E5E9] px-5 py-4">
          <div className="min-w-0 text-[12.5px] text-[#5C6470]">
            {result === "issues" && externalCost > 0 ? (
              <>
                <span className="font-semibold text-[#1B2432]">
                  {externalCost.toLocaleString("en-NG", {
                    style: "currency",
                    currency: "NGN",
                    maximumFractionDigits: 0,
                  })}
                </span>{" "}
                external labour → {asset.reg || "this truck"}
              </>
            ) : (
              <span className="truncate">{asset.reg || asset.label}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded border border-[#D3D7DE] px-4 text-[14px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="h-10 rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : result === "no-issues"
                  ? "Confirm Available"
                  : "Log Defect & Parts Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The return-to-available handshake: completion notes, then the truck is freed. */
export function MaintenanceCompleteDialog({
  asset,
  onClose,
  onConfirm,
  busy,
}: {
  asset: CheckAsset;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Return ${asset.label} to available`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#1B2432] px-5 py-4">
          <h3 className="text-[17px] font-semibold text-white">Ready to Go</h3>
          <p className="text-[12px] text-white/60">
            {asset.label} • Head of Engineering confirms the repair is done
          </p>
        </div>
        <div className="flex flex-col gap-3 px-5 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-[#141A1F]">Maintenance Completion Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Physical maintenance completed. All defected parts over-hauled and road-tested."
              className="w-full rounded border border-[#1B2432] px-3 py-2 text-[14px] text-[#141A1F] outline-none"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded border border-[#D3D7DE] px-4 text-[14px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm(notes.trim())}
              className="h-10 rounded bg-[#34C759] px-4 text-[14px] font-medium text-white hover:bg-[#2cab4e] disabled:opacity-60"
            >
              {busy ? "Marking ready…" : "Confirm — Ready to Go"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The historical record of one completed inspection — the Maintenance Report
 * card the log opens: date • truck, inspector, verdict, defect and parts.
 */
export function InspectionReportCard({
  job,
  parts,
}: {
  job: WorkOrder;
  parts: InventoryRequisition[];
}) {
  const lines = formatDateLines(job.completedAt || job.reportedAt);
  const passed = job.status === "Completed" && !job.defect;
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white">
      <div className="bg-[#1B2432] px-4 py-3">
        <p className="text-[15px] font-semibold text-white">Maintenance Report</p>
        <p className="text-[12px] text-white/60">
          {lines.date} • {job.truckReg || "—"}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-4 text-[13px]">
        <p className="text-[#3C4653]">
          Inspected by: <span className="font-medium text-[#1B2432]">{job.inspectedBy || job.reportedBy || "—"}</span>
        </p>
        {job.mechanic ? (
          <p className="text-[#3C4653]">
            Assigned to: <span className="font-medium text-[#1B2432]">{job.mechanic}</span>
          </p>
        ) : null}
        {Number(job.cost ?? 0) > 0 ? (
          <p className="text-[#3C4653]">
            External labour:{" "}
            <span className="font-medium text-[#1B2432]">
              {Number(job.cost).toLocaleString("en-NG", {
                style: "currency",
                currency: "NGN",
                maximumFractionDigits: 0,
              })}
            </span>{" "}
            <span className="text-[#8E95A1]">— booked to {job.truckReg || "the truck"}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-2">
          <span className="text-[#5C6470]">Status:</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              passed ? "bg-[#34C759]/15 text-[#0A8F4D]" : "bg-[#ED351D]/10 text-[#ED351D]",
            )}
          >
            {passed ? "Passed — No Defect" : "Defect Logged"}
          </span>
          {job.severity ? (
            <span className="rounded-full bg-[#1B2432] px-2.5 py-0.5 text-[11px] font-semibold text-white">
              {job.severity}
            </span>
          ) : null}
        </p>
        {job.defect ? (
          <div className="rounded-[6px] border border-[#ED351D]/30 bg-[#FFF1EF] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#ED351D]">
              Logged Defect:
            </p>
            <p className="mt-0.5 text-[#1B2432]">{job.defect}</p>
          </div>
        ) : null}
        <div>
          <p className="text-[12px] font-semibold text-[#1B2432]">
            Parts Requested{parts.length ? ` (${parts.length})` : ""}
          </p>
          {parts.length === 0 ? (
            <p className="text-[#8E95A1]">No parts were requested for this inspection.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {parts.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded border border-[#E2E5E9] px-2.5 py-1.5">
                  <span className="font-medium text-[#1B2432]">{p.part}</span>
                  <span className="tabular-nums text-[#5C6470]">× {p.quantity.toLocaleString("en-NG")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
