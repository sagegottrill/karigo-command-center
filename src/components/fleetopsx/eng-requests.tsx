import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Minus, Plus, Trash2, Upload } from "lucide-react";
import { authService, inventoryService } from "@/lib/fleetopsx/services";
import { liveCreateFuelRequest, liveSetFuelRequestStatus } from "@/lib/fleetopsx/live-api";
import { truckLabel } from "@/lib/fleetopsx/engineering-helpers";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import {
  fuelBadge,
  groupRequisitions,
  hoeReviewableFuel,
  requisitionBadge,
  tmApprovable,
  tmAuthorizableFuel,
  type RequestGroup,
} from "@/lib/fleetopsx/request-status";
import { cn } from "@/lib/utils";
import type {
  FuelRequest,
  InventoryItem,
  InventoryRequisition,
  TruckHead,
  TruckTail,
} from "@/lib/fleetopsx/types";
import type { PartLine } from "./eng-checkup";

export type RequestTarget = "Truck Head" | "Truck Tail" | "Workshop";

const inputClass =
  "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none bg-white";

const naira = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;

function Shell({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          "my-6 flex w-full flex-col rounded-[14px] bg-white shadow-xl",
          wide ? "max-w-[640px]" : "max-w-[560px]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The design's header: an ink bar INSET inside the white modal, not full-bleed. */}
        <div className="m-2.5 rounded-[10px] bg-[#1B2432] px-4 py-3.5">
          <h3 className="text-[17px] font-semibold text-white">{title}</h3>
          <p className="text-[12px] text-white/60">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * The design's target control: three radio CHIPS inline (Truck Head / Truck
 * Tail / Workshop), with the truck's own select appearing on the SAME row once
 * a head or tail is picked (the design drops it entirely for Workshop).
 */
function TargetField({
  value,
  onChange,
  truckOptions,
  truckId,
  setTruckId,
}: {
  value: RequestTarget;
  onChange: (t: RequestTarget) => void;
  truckOptions: { id: string; label: string }[];
  truckId: string;
  setTruckId: (id: string) => void;
}) {
  return (
    <span className="flex flex-col gap-2">
      <span className="text-[15px] font-semibold text-[#141A1F]">
        Target Equipment Allocation <span className="text-[#ED351D]">*</span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        {(["Truck Head", "Truck Tail", "Workshop"] as const).map((t) => (
          <span
            key={t}
            className="flex h-9 items-center gap-2 rounded-full border border-[#D3D7DE] bg-white px-3.5 text-[13.5px] font-medium text-[#344256]"
          >
            <input
              type="radio"
              name="req-target"
              checked={value === t}
              onChange={() => {
                onChange(t);
                setTruckId("");
              }}
              className="size-4 accent-[#ED351D]"
            />
            {t}
          </span>
        ))}
        {value !== "Workshop" ? (
          <select
            value={truckId}
            onChange={(e) => setTruckId(e.target.value)}
            aria-label={`Select ${value}`}
            className="h-10 min-w-[150px] flex-1 rounded-lg border-[1.5px] border-[#1B2432] bg-white px-3 text-[14px] text-[#141A1F] outline-none"
          >
            <option value="">Select</option>
            {truckOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
      </span>
    </span>
  );
}

function LinesEditor({
  items,
  lines,
  onAdd,
  onRemove,
}: {
  items: InventoryItem[];
  lines: PartLine[];
  onAdd: (l: PartLine) => void;
  onRemove: (i: number) => void;
}) {
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState(1);
  const options = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);
  return (
    <span className="flex flex-col gap-2">
      <span className="border-t border-[#E2E5E9] pt-3 text-[15px] font-semibold text-[#141A1F]">
        Add Parts from Inventory
      </span>
      <span className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-medium text-[#141A1F]">
            Select Spare Parts <span className="text-[#ED351D]">*</span>
          </span>
          <select
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
            className="h-10 rounded-lg border border-[#D3D7DE] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
          >
            <option value="">Select</option>
            {options.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.stock.toLocaleString("en-NG")} in stock
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-medium text-[#141A1F]">
            Quantity <span className="text-[#ED351D]">*</span>
          </span>
          <span className="flex h-10 items-center justify-between rounded-lg border-[1.5px] border-[#1B2432] px-1">
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
      </span>
      <button
        type="button"
        onClick={() => {
          const chosen = options.find((i) => i.id === partId);
          if (!chosen) {
            toast.error("Select a spare part first.");
            return;
          }
          onAdd({ part: chosen.name, itemId: chosen.id, quantity: qty, unitCost: chosen.unitCost });
          setPartId("");
          setQty(1);
        }}
        className="h-10 rounded-lg bg-[#1B2432] text-[14px] font-medium text-white hover:bg-[#2a3547]"
      >
        Add Part
      </button>
      {lines.length > 0 ? (
        <span className="block overflow-hidden rounded-lg border border-[#E2E5E9]">
          <span className="grid grid-cols-[1fr_90px_44px] bg-[#F1F3F5] px-3 py-2 text-[13px] font-semibold text-[#344256]">
            <span>Part No.</span>
            <span className="text-center">Quantity</span>
            <span />
          </span>
          {lines.map((l, i) => (
            <span
              key={`${l.itemId}-${i}`}
              className="grid grid-cols-[1fr_90px_44px] items-center border-t border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px]"
            >
              <span className="truncate text-[#344256]">{l.part}</span>
              <span className="text-center tabular-nums text-[#344256]">{l.quantity.toLocaleString("en-NG")}</span>
              <button
                type="button"
                aria-label={`Remove ${l.part}`}
                className="ml-auto grid size-7 place-items-center rounded text-[#ED351D] hover:bg-[#FFF1EF]"
                onClick={() => onRemove(i)}
              >
                <Trash2 className="size-4" />
              </button>
            </span>
          ))}
          <span className="flex items-center justify-between border-t border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px] font-semibold text-[#1B2432]">
            <span>Total Parts Requested</span>
            <span className="tabular-nums">{lines.length}</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The workshop's ask: target (head / tail / workshop) + description + as many
 * store lines as the repair needs. It lands on the Head of Engineering's desk —
 * the store only sees it after the Transfer Manager approves.
 */
export function PartsRequestDialog({
  heads,
  tails,
  items,
  onClose,
  onDone,
}: {
  heads: TruckHead[];
  tails: TruckTail[];
  items: InventoryItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const me = authService.getCurrentUser()?.name || "Senior Engineer";
  const [target, setTarget] = useState<RequestTarget>("Truck Head");
  const [truckId, setTruckId] = useState("");
  const [description, setDescription] = useState("");
  const [by, setBy] = useState(me);
  const [lines, setLines] = useState<PartLine[]>([]);
  const [saving, setSaving] = useState(false);

  const truckOptions =
    target === "Truck Tail"
      ? tails.map((t) => ({
          id: t.id,
          label: `${t.number}${t.registration ? ` (${t.registration})` : ""}`,
          reg: t.registration || t.number,
        }))
      : heads.map((h) => ({ id: h.id, label: truckLabel(h), reg: h.registration }));
  const chosen = truckOptions.find((o) => o.id === truckId);

  const submit = async () => {
    if (target !== "Workshop" && !chosen) {
      toast.error("Choose the truck this request is for.");
      return;
    }
    if (!description.trim()) {
      toast.error("Describe what the parts are needed for.");
      return;
    }
    if (!lines.length) {
      toast.error("Add at least one part line.");
      return;
    }
    setSaving(true);
    try {
      const res = await inventoryService.createRequisitionGroup({
        targetType: target,
        truckReg: target === "Workshop" ? "WORKSHOP" : (chosen?.reg ?? ""),
        description: description.trim(),
        requestedBy: by.trim() || me,
        lines: lines.map((l) => ({
          part: l.part,
          itemId: l.itemId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
      toast.success(`${res.group} submitted — awaiting HOE review.`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The request was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Request Parts" subtitle={`Requested by: ${me}`} onClose={onClose}>
      <TargetField
        value={target}
        onChange={setTarget}
        truckOptions={truckOptions}
        truckId={truckId}
        setTruckId={setTruckId}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-[#141A1F]">
          Reason for Request: <span className="text-[#ED351D]">*</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="e.g. enter description"
          className="w-full rounded-lg border border-[#D3D7DE] px-3 py-2 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-[#141A1F]">
          Requested by: <span className="text-[#ED351D]">*</span>
        </span>
        <input
          value={by}
          onChange={(e) => setBy(e.target.value)}
          placeholder="e.g. Engr. Joe"
          className="h-10 rounded-lg border border-[#D3D7DE] px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
        />
      </label>
      <LinesEditor
        items={items}
        lines={lines}
        onAdd={(l) => setLines((prev) => [...prev, l])}
        onRemove={(i) => setLines((prev) => prev.filter((_, x) => x !== i))}
      />
      <div className="mt-1 flex items-center justify-between border-t border-[#E2E5E9] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 text-[14px] font-medium text-[#5C6470] hover:text-[#1B2432]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="h-10 rounded-lg bg-[#ED351D] px-5 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
        >
          {saving ? "Submitting…" : "Submit Requests"}
        </button>
      </div>
    </Shell>
  );
}

/**
 * An engineering draw. Three kinds, per the design:
 *   • Diesel / Gas — a draw on the bulk tank (fuel-requests pipeline);
 *   • Motor Oil — a draw from the store's oil shelf, raised through the same
 *     requisition "+ Select Oil Type" flow the design gives it, so it lands
 *     on the HOE desk and then the TM board with the shelf SKU named.
 * It passes HOE review before the Transport Manager authorises it.
 */
export function LubricantRequestDialog({
  heads,
  tails,
  items,
  onClose,
  onDone,
}: {
  heads: TruckHead[];
  tails: TruckTail[];
  /** The store shelf — Motor Oil draws pick a real oil line from it. */
  items: InventoryItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const me = authService.getCurrentUser()?.name || "Senior Engineer";
  const [target, setTarget] = useState<RequestTarget>("Truck Head");
  const [truckId, setTruckId] = useState("");
  const [fuelType, setFuelType] = useState<"Diesel" | "Gas" | "Motor Oil">("Diesel");
  const [oilItemId, setOilItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [by, setBy] = useState(me);
  const [saving, setSaving] = useState(false);

  const truckOptions =
    target === "Truck Tail"
      ? tails.map((t) => ({
          id: t.id,
          label: `${t.number}${t.registration ? ` (${t.registration})` : ""}`,
          reg: t.registration || t.number,
        }))
      : heads.map((h) => ({ id: h.id, label: truckLabel(h), reg: h.registration }));
  const chosen = truckOptions.find((o) => o.id === truckId);
  const oils = useMemo(
    () =>
      items
        .filter(
          (i) =>
            /^(oil|grs|grease|lub|lube|hyd|coolant|atf|ep2|2t|4t|sae)/i.test(i.sku) ||
            /lubricant|grease|coolant|hydraulic|engine oil|gear oil|transmission oil|brake oil/i.test(
              `${i.category} ${i.name}`,
            ),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );
  const chosenOil = oils.find((o) => o.id === oilItemId);

  const submit = async () => {
    if (target !== "Workshop" && !chosen) {
      toast.error("Choose the truck this draw is for.");
      return;
    }
    if (fuelType === "Motor Oil" && !chosenOil) {
      toast.error("Select the Oil Type this draw takes from the shelf.");
      return;
    }
    if (!Number(qty) || Number(qty) <= 0) {
      toast.error("Enter the quantity.");
      return;
    }
    if (!purpose.trim()) {
      toast.error("State the reason for this request.");
      return;
    }
    setSaving(true);
    try {
      if (fuelType === "Motor Oil") {
        await inventoryService.createRequisitionGroup({
          targetType: target,
          truckReg: target === "Workshop" ? "WORKSHOP" : (chosen?.reg ?? ""),
          description: purpose.trim(),
          requestedBy: by.trim() || me,
          lines: [
            {
              part: chosenOil!.name,
              itemId: chosenOil!.id,
              quantity: qty,
              unitCost: chosenOil!.unitCost,
            },
          ],
        });
      } else {
        await liveCreateFuelRequest({
          fuelType,
          quantity: qty,
          source: "Internal Use",
          requestedBy: by.trim() || me,
          purpose: purpose.trim(),
          plateNumber: target === "Workshop" ? "WORKSHOP" : (chosen?.reg ?? ""),
          targetType: target,
        });
      }
      toast.success("Lubricant request submitted — awaiting HOE review.");
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The request was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Request Lubricant" subtitle={`Requested by: ${me}`} onClose={onClose}>
      <TargetField
        value={target}
        onChange={setTarget}
        truckOptions={truckOptions}
        truckId={truckId}
        setTruckId={setTruckId}
      />
      <span className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-[#141A1F]">
          Select Lubricant <span className="text-[#ED351D]">*</span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {(["Diesel", "Gas", "Motor Oil"] as const).map((f) => (
            <span
              key={f}
              className="flex h-9 items-center gap-2 rounded-full border border-[#D3D7DE] bg-white px-3.5 text-[13.5px] font-medium text-[#344256]"
            >
              <input
                type="radio"
                name="lube-type"
                checked={fuelType === f}
                onChange={() => {
                  setFuelType(f);
                  setOilItemId("");
                }}
                className="size-4 accent-[#ED351D]"
              />
              {f}
            </span>
          ))}
          {fuelType === "Motor Oil" ? (
            <select
              value={oilItemId}
              onChange={(e) => setOilItemId(e.target.value)}
              aria-label="Select Oil Type"
              className="h-10 min-w-[150px] flex-1 rounded-lg border-[1.5px] border-[#1B2432] bg-white px-3 text-[14px] text-[#141A1F] outline-none"
            >
              <option value="">Select Oil Type</option>
              {oils.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {o.stock.toLocaleString("en-NG")} in stock
                </option>
              ))}
            </select>
          ) : null}
        </span>
      </span>
      {/* The design prints no quantity field, but the desk dispenses a real
          figure and the board cards carry quantity chips — so the stepper is
          the one deliberate addition here. */}
      <span className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
        <span className="hidden sm:block" />
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-medium text-[#141A1F]">
            Quantity <span className="text-[#ED351D]">*</span>
          </span>
          <span className="flex h-10 items-center justify-between rounded-lg border-[1.5px] border-[#1B2432] px-1">
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
              onClick={() => setQty((q) => Math.min(99999, q + 1))}
            >
              <Plus className="size-4" />
            </button>
          </span>
        </label>
      </span>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-[#141A1F]">
          Reason for Request <span className="text-[#ED351D]">*</span>
        </span>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={2}
          placeholder="e.g. enter description"
          className="w-full rounded-lg border border-[#D3D7DE] px-3 py-2 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-[#141A1F]">
          Requested by: <span className="text-[#ED351D]">*</span>
        </span>
        <input
          value={by}
          onChange={(e) => setBy(e.target.value)}
          placeholder="e.g. Engr. Joe"
          className="h-10 rounded-lg border border-[#D3D7DE] px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
        />
      </label>
      <div className="mt-1 flex items-center justify-between border-t border-[#E2E5E9] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 text-[14px] font-medium text-[#5C6470] hover:text-[#1B2432]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="h-10 rounded-lg bg-[#ED351D] px-5 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
        >
          {saving ? "Submitting…" : "Submit Requests"}
        </button>
      </div>
    </Shell>
  );
}

/**
 * The Head of Engineering's desk: validate the lines (correct names and
 * quantities first — that is the review's whole point), then pass the request
 * to the Transfer Manager, or decline it with a reason.
 */
export function GroupReviewDialog({
  group,
  onClose,
  onDone,
}: {
  group: RequestGroup;
  onClose: () => void;
  onDone: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, { part: string; quantity: number }>>(() =>
    Object.fromEntries(group.lines.map((l) => [l.id, { part: l.part, quantity: l.quantity }])),
  );
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);

  const decide = async (approve: boolean) => {
    let note = "";
    if (!approve) {
      note = (
        window.prompt(
          `Why is request ${group.key} for ${group.truckReg} declined? Attached to the record.`,
        ) ?? ""
      ).trim();
      if (!note) return;
    }
    setSaving(approve ? "approve" : "reject");
    try {
      await inventoryService.reviewRequisitionGroup(
        group.key,
        approve,
        note,
        group.lines.map((l) => ({
          id: l.id,
          part: edits[l.id]?.part ?? l.part,
          quantity: edits[l.id]?.quantity ?? l.quantity,
        })),
      );
      toast.success(
        approve
          ? `${group.key} validated — sent to the Transfer Manager.`
          : `${group.key} declined.`,
      );
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The review was not saved.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Shell
      title="Review Part Request"
      subtitle={`${group.truckReg} • ${group.requestedBy || "—"}`}
      onClose={onClose}
      wide
    >
      <div className="rounded-[6px] border border-[#E2E5E9] bg-[#F7F8FA] px-3 py-2.5 text-[13px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
          Description
        </p>
        <p className="mt-0.5 text-[#1B2432]">{group.description || "—"}</p>
      </div>
      <span className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold text-[#141A1F]">
          Modify Parts from Inventory
        </span>
        {group.lines.map((l) => {
          const e = edits[l.id] ?? { part: l.part, quantity: l.quantity };
          return (
            <span
              key={l.id}
              className="grid grid-cols-[1fr_96px] items-center gap-2 rounded border border-[#E2E5E9] px-2.5 py-2"
            >
              <input
                value={e.part}
                onChange={(ev) =>
                  setEdits((p) => ({ ...p, [l.id]: { ...e, part: ev.target.value } }))
                }
                aria-label="Part name"
                className="h-9 rounded border border-[#E2E5E9] px-2 text-[13px] outline-none focus:border-[#1B2432]"
              />
              <span className="flex h-9 items-center justify-between rounded border border-[#E2E5E9] px-1">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  className="grid size-7 place-items-center rounded hover:bg-[#F1F2F4]"
                  onClick={() =>
                    setEdits((p) => ({
                      ...p,
                      [l.id]: { ...e, quantity: Math.max(1, e.quantity - 1) },
                    }))
                  }
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="text-[13px] font-semibold tabular-nums">{e.quantity.toLocaleString("en-NG")}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  className="grid size-7 place-items-center rounded hover:bg-[#F1F2F4]"
                  onClick={() =>
                    setEdits((p) => ({
                      ...p,
                      [l.id]: { ...e, quantity: Math.min(999, e.quantity + 1) },
                    }))
                  }
                >
                  <Plus className="size-3.5" />
                </button>
              </span>
            </span>
          );
        })}
      </span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded border border-[#D3D7DE] px-4 text-[14px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => void decide(false)}
          className="h-10 rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
        >
          {saving === "reject" ? "Declining…" : "Reject Request"}
        </button>
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => void decide(true)}
          className="h-10 rounded bg-[#34C759] px-4 text-[14px] font-medium text-white hover:bg-[#2cab4e] disabled:opacity-60"
        >
          {saving === "approve" ? "Approving…" : "Confirm and Approve"}
        </button>
      </div>
    </Shell>
  );
}

const PAGE = 5;

function toCsv(rows: string[][]) {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The department's Parts and Lubricant Requests board, converted from the
 * approved mobile design: raise buttons, Parts/Lubricant tabs, sort by status,
 * request cards with their stage badges, and the decision buttons each stage
 * allows — HOE review, Transfer Manager approval, store handover state.
 */
export function RequestsBoard({
  requisitions,
  fuel,
  heads,
  tails,
  items,
  canWork,
  canTM,
  onRefresh,
}: {
  requisitions: InventoryRequisition[];
  fuel: FuelRequest[];
  heads: TruckHead[];
  tails: TruckTail[];
  items: InventoryItem[];
  /** Engineering owners: raise + HOE review. */
  canWork: boolean;
  /** Transfer Manager / admin: approve + authorise. */
  canTM: boolean;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<"parts" | "lubricant">("parts");
  const [sort, setSort] = useState("Newest");
  const [partsForm, setPartsForm] = useState(false);
  const [lubeForm, setLubeForm] = useState(false);
  const [reviewing, setReviewing] = useState<RequestGroup | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => groupRequisitions(requisitions), [requisitions]);
  const engFuel = useMemo(
    () =>
      fuel
        .filter((f) => f.source === "Internal Use" && f.targetType)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [fuel],
  );

  const stageRank = (s: string) =>
    s === "Awaiting HOE Review"
      ? 0
      : s === "Awaiting Admin Approval"
        ? 1
        : s === "Approved by Admin"
          ? 2
          : s === "Rejected"
            ? 4
            : 3;

  const visibleGroups = useMemo(() => {
    const list = [...groups];
    if (sort === "Status")
      list.sort(
        (a, b) =>
          stageRank(a.stage) - stageRank(b.stage) || String(b.date).localeCompare(String(a.date)),
      );
    else if (sort === "Oldest") list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    else list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return list;
  }, [groups, sort]);

  const pageCount = Math.max(1, Math.ceil(visibleGroups.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = visibleGroups.slice(safePage * PAGE, safePage * PAGE + PAGE);

  const tmApproveGroup = async (g: RequestGroup) => {
    setBusy(g.key);
    try {
      for (const l of g.lines) {
        await inventoryService.approveRequisition({
          id: l.id,
          itemId: l.itemId,
          quantity: l.quantity,
        });
      }
      toast.success(`${g.key} approved — handed to the store floor.`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The approval was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const tmRejectLine = async (g: RequestGroup) => {
    const note = (
      window.prompt(
        `Why is request ${g.key} for ${g.truckReg} rejected? Attached to the record.`,
      ) ?? ""
    ).trim();
    if (!note) return;
    setBusy(g.key);
    try {
      for (const l of g.lines) await inventoryService.rejectRequisition(l.id, note);
      toast.success(`${g.key} rejected.`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The rejection was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const hoeFuel = async (r: FuelRequest, approve: boolean) => {
    let reason = "";
    if (!approve) {
      reason = (
        window.prompt(`Why is ${r.reference} declined? Attached to the record.`) ?? ""
      ).trim();
      if (!reason) return;
    }
    setBusy(r.id);
    try {
      await inventoryService.hoeReviewFuelRequest(r.id, approve, reason);
      toast.success(
        approve
          ? `${r.reference} validated — sent to the Transfer Manager.`
          : `${r.reference} declined.`,
      );
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The review was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const tmAuthorizeFuel = async (r: FuelRequest) => {
    setBusy(r.id);
    try {
      await liveSetFuelRequestStatus(r.id, "Authorized");
      toast.success(`${r.reference} authorised — the desk can dispense it.`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authorisation failed.");
    } finally {
      setBusy(null);
    }
  };

  const exportParts = () =>
    downloadCsv("parts_requests.csv", [
      [
        "Group",
        "Target",
        "Truck",
        "Description",
        "Requested by",
        "HOE review",
        "Stage",
        "Part",
        "Qty",
        "Unit cost",
      ],
      ...visibleGroups.flatMap((g) =>
        g.lines.map((l) => [
          g.key,
          g.targetType,
          g.truckReg,
          g.description,
          g.requestedBy,
          g.reviewedBy,
          g.stage,
          l.part,
          String(l.quantity),
          String(l.unitCost ?? ""),
        ]),
      ),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-semibold text-[#1B2432]">Parts and Lubricant Requests</h2>
        <p className="text-[11.5px] uppercase tracking-[0.4px] text-[#8E95A1]">
          Track lubricant and parts requests to transfer manager approval and stock confirmation
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!canWork}
          onClick={() => setPartsForm(true)}
          className="h-11 rounded bg-[#ED351D] text-[15px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-40"
        >
          Request Parts
        </button>
        <button
          type="button"
          disabled={!canWork}
          onClick={() => setLubeForm(true)}
          className="h-11 rounded bg-[#1B2432] text-[15px] font-medium text-white hover:bg-[#2a3547] disabled:opacity-40"
        >
          Request Lubricant
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["parts", "lubricant"] as const).map((t) => {
          const n = t === "parts" ? groups.length : engFuel.length;
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setPage(0);
              }}
              className={cn(
                "h-10 rounded-[8px] border text-[14px] font-medium",
                on
                  ? "border-[#1B2432] bg-white text-[#1B2432]"
                  : "border-[#E2E5E9] bg-[#F1F2F4] text-[#5C6470]",
              )}
            >
              {t === "parts" ? "Parts Requests" : "Lubricant Requests"} ({n})
            </button>
          );
        })}
      </div>

      {tab === "parts" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2432]">
              Request Listing
              <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] text-white">
                {visibleGroups.length}
              </span>
            </p>
            <span className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort requests"
                className="h-9 rounded border border-[#E2E5E9] bg-white px-2 text-[13px] text-[#1B2432]"
              >
                <option>Newest</option>
                <option>Oldest</option>
                <option>Status</option>
              </select>
              <button
                type="button"
                onClick={exportParts}
                className="flex h-9 items-center gap-1.5 rounded border border-[#E2E5E9] px-3 text-[13px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
              >
                <Upload className="size-4" /> Export CSV
              </button>
            </span>
          </div>

          {slice.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[#D3D7DE] bg-white px-4 py-10 text-center text-[14px] text-[#8E95A1]">
              No parts requests yet — raise one with Request Parts.
            </p>
          ) : (
            slice.map((g) => {
              const hoe = g.stage === "Awaiting HOE Review";
              // HOE-validated groups plus legacy single-line Pending tickets.
              const tm =
                g.stage === "Awaiting Admin Approval" ||
                g.lines.some((l) => l.status === "Pending");
              return (
                <div key={g.key} className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-[#1B2432]">
                      {g.truckReg === "WORKSHOP" ? "Workshop" : g.truckReg}
                      <span className="ml-2 text-[12px] font-normal text-[#8E95A1]">
                        {g.key} • {g.targetType}
                      </span>
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        stagePill(g.stage),
                      )}
                    >
                      {g.stage}
                    </span>
                  </div>
                  <div className="mt-2 rounded-[6px] border border-[#ED351D]/25 bg-[#FFF5F4] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#ED351D]">
                      Description:
                    </p>
                    <p className="text-[13.5px] text-[#1B2432]">{g.description || "—"}</p>
                  </div>
                  <p className="mt-2 text-[13px] text-[#5C6470]">
                    Requested by:{" "}
                    <span className="font-medium text-[#1B2432]">{g.requestedBy || "—"}</span>
                    {g.reviewedBy ? (
                      <span>
                        {" "}
                        • HOE: <span className="font-medium text-[#1B2432]">{g.reviewedBy}</span>
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-2 overflow-hidden rounded border border-[#E2E5E9]">
                    <p className="bg-[#F7F8FA] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                      Requested Parts
                    </p>
                    {g.lines.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between gap-3 border-t border-[#E2E5E9] px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-[#1B2432]">
                            {l.part}
                          </span>
                          <span className="block text-[11.5px] text-[#8E95A1]">
                            {requisitionBadge(l).label}
                            {l.unitCost ? ` • ${naira(l.unitCost)}` : ""}
                          </span>
                        </span>
                        <span className="grid size-7 shrink-0 place-items-center rounded border border-[#E2E5E9] text-[13px] font-semibold tabular-nums">
                          {l.quantity.toLocaleString("en-NG")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hoe && canWork ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setReviewing(g)}
                          className="h-9 rounded border border-[#D3D7DE] px-3.5 text-[13px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
                        >
                          ✎ Modify
                        </button>
                        <button
                          type="button"
                          disabled={busy === g.key}
                          onClick={() =>
                            void (async () => {
                              const note = (
                                window.prompt(
                                  `Why is request ${g.key} declined? Attached to the record.`,
                                ) ?? ""
                              ).trim();
                              if (!note) return;
                              setBusy(g.key);
                              try {
                                await inventoryService.reviewRequisitionGroup(g.key, false, note);
                                toast.success(`${g.key} declined.`);
                                onRefresh();
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "The review was not saved.",
                                );
                              } finally {
                                setBusy(null);
                              }
                            })()
                          }
                          className="h-9 rounded bg-[#ED351D] px-3.5 text-[13px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewing(g)}
                          className="h-9 rounded bg-[#34C759] px-3.5 text-[13px] font-medium text-white hover:bg-[#2cab4e]"
                        >
                          Review and Approve
                        </button>
                      </>
                    ) : null}
                    {tm && canTM ? (
                      <>
                        <button
                          type="button"
                          disabled={busy === g.key}
                          onClick={() => void tmApproveGroup(g)}
                          className="h-9 rounded bg-[#34C759] px-3.5 text-[13px] font-medium text-white hover:bg-[#2cab4e] disabled:opacity-60"
                        >
                          {busy === g.key ? "Approving…" : "Approve — Send to Store"}
                        </button>
                        <button
                          type="button"
                          disabled={busy === g.key}
                          onClick={() => void tmRejectLine(g)}
                          className="h-9 rounded bg-[#ED351D] px-3.5 text-[13px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {!hoe && !tm ? (
                      <span className="text-[12.5px] text-[#8E95A1]">
                        {g.stage === "Rejected"
                          ? "Declined — see the record note."
                          : "With the store — handover and sign-off happen at the Inventory Desk."}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          <div className="flex items-center justify-between text-[13px] text-[#5C6470]">
            <span>
              {visibleGroups.length === 0 ? 0 : safePage * PAGE + 1} –{" "}
              {Math.min(visibleGroups.length, safePage * PAGE + PAGE)} of {visibleGroups.length}
            </span>
            <span className="flex gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                className="grid size-8 place-items-center rounded border border-[#E2E5E9] bg-white disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                className="grid size-8 place-items-center rounded border border-[#E2E5E9] bg-white disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2432]">
              Request Listing
              <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] text-white">
                {engFuel.length}
              </span>
            </p>
          </div>
          {engFuel.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[#D3D7DE] bg-white px-4 py-10 text-center text-[14px] text-[#8E95A1]">
              No lubricant requests yet — raise one with Request Lubricant.
            </p>
          ) : (
            engFuel.map((r) => {
              const badge = fuelBadge(r);
              const hoe = hoeReviewableFuel(r);
              const tm = tmAuthorizableFuel(r) && r.status === "HOE Approved";
              return (
                <div key={r.id} className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-[#1B2432]">
                      {r.plateNumber === "WORKSHOP" ? "Workshop" : r.plateNumber || r.reference}
                      <span className="ml-2 text-[12px] font-normal text-[#8E95A1]">
                        {r.reference} • {r.targetType}
                      </span>
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        stagePill(badge.label),
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-2 rounded-[6px] border border-[#E2E5E9] bg-[#F7F8FA] px-3 py-2 text-[13.5px] text-[#1B2432]">
                    {r.fuelType} • {r.quantity.toLocaleString()} litres
                  </div>
                  {r.purpose ? (
                    <div className="mt-2 rounded-[6px] border border-[#ED351D]/25 bg-[#FFF5F4] px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#ED351D]">
                        Purpose:
                      </p>
                      <p className="text-[13.5px] text-[#1B2432]">{r.purpose}</p>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[13px] text-[#5C6470]">
                    Requested by:{" "}
                    <span className="font-medium text-[#1B2432]">{r.requestedBy}</span>
                    {r.reviewedBy ? (
                      <span>
                        {" "}
                        • HOE: <span className="font-medium text-[#1B2432]">{r.reviewedBy}</span>
                      </span>
                    ) : null}
                    <span> • {formatDateLines(r.createdAt).date}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hoe && canWork ? (
                      <>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => void hoeFuel(r, false)}
                          className="h-9 rounded bg-[#ED351D] px-3.5 text-[13px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => void hoeFuel(r, true)}
                          className="h-9 rounded bg-[#34C759] px-3.5 text-[13px] font-medium text-white hover:bg-[#2cab4e] disabled:opacity-60"
                        >
                          {busy === r.id ? "Saving…" : "Review and Approve"}
                        </button>
                      </>
                    ) : null}
                    {tm && canTM ? (
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => void tmAuthorizeFuel(r)}
                        className="h-9 rounded bg-[#34C759] px-3.5 text-[13px] font-medium text-white hover:bg-[#2cab4e] disabled:opacity-60"
                      >
                        {busy === r.id ? "Authorising…" : "Authorise — Send to Desk"}
                      </button>
                    ) : null}
                    {!hoe && !tm ? (
                      <span className="text-[12.5px] text-[#8E95A1]">
                        {r.status === "Declined"
                          ? "Declined — see the record note."
                          : "With the fuel desk — dispensing happens at Lubricant Disbursal."}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {partsForm ? (
        <PartsRequestDialog
          heads={heads}
          tails={tails}
          items={items}
          onClose={() => setPartsForm(false)}
          onDone={onRefresh}
        />
      ) : null}
      {lubeForm ? (
        <LubricantRequestDialog
          heads={heads}
          tails={tails}
          items={items}
          onClose={() => setLubeForm(false)}
          onDone={onRefresh}
        />
      ) : null}
      {reviewing ? (
        <GroupReviewDialog
          group={reviewing}
          onClose={() => setReviewing(null)}
          onDone={onRefresh}
        />
      ) : null}
    </div>
  );
}

function stagePill(stage: string) {
  switch (stage) {
    case "Awaiting HOE Review":
      return "bg-[#F99E1F]/15 text-[#B26A00]";
    case "Awaiting Admin Approval":
      return "bg-[#2F6BD8]/10 text-[#2F6BD8]";
    case "Approved by Admin":
      return "bg-[#34C759]/15 text-[#0A8F4D]";
    case "Awaiting Procurement":
      return "bg-[#7C3AED]/10 text-[#7C3AED]";
    case "Parts Issued":
    case "Dispensed":
      return "bg-[#E2E5E9] text-[#5C6470]";
    case "Rejected":
    case "Declined":
      return "bg-[#ED351D]/10 text-[#ED351D]";
    default:
      return "bg-[#F99E1F]/15 text-[#B26A00]";
  }
}
