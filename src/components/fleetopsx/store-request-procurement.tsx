import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModalActions, ModalField, ModalShell, classOfItem, inputClass, type StoreTab } from "@/components/fleetopsx/store-portal";
import { fetchApi } from "@/lib/fleetopsx/apiClient";
import { authService, formatNairaFull } from "@/lib/fleetopsx/services";
import type { InventoryItem, ProcurementRequest } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

const currentUserName = () =>
  authService.getCurrentUser()?.name?.trim() ||
  (typeof window !== "undefined" ? localStorage.getItem("fleetopsx_user_name") || "" : "") ||
  "";

/**
 * Request Procurement — the store asks the buying desk to restock one of its
 * own shelf lines. The line is picked from the registered inventory and the
 * number fields carry what the shelf already knows (SKU, name, category, the
 * last price paid); only the quantity is decided here. It lands on the
 * Transport Manager's authorisation desk, never straight into stock.
 */
export function RequestProcurementModal({
  items,
  onClose,
  onDone,
}: {
  items: InventoryItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [tab, setTab] = useState<StoreTab>("parts");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [requestedBy, setRequestedBy] = useState(currentUserName());
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => items.filter((i) => classOfItem(i) === tab), [items, tab]);
  const chosen = useMemo(() => candidates.find((i) => i.id === itemId) || null, [candidates, itemId]);

  const submit = async () => {
    if (!chosen) {
      toast.error("Pick a line from the registered inventory.");
      return;
    }
    if ((Number(quantity) || 0) <= 0) {
      toast.error("How many units should be bought?");
      return;
    }
    setBusy(true);
    // The PO lands in the procurement ledger with exactly the fields the model
    // owns — partName carries the SKU the store re-reads on delivery, kind
    // Part keeps the fuel-tank restocks out of the store's ledger.
    const po: Partial<ProcurementRequest> = {
      partName: chosen.sku,
      quantity: Number(quantity) || 0,
      linkedId: chosen.sku || chosen.id,
      status: "Requested",
      kind: "Part",
      unitPrice: chosen.unitCost || null,
      date: new Date().toISOString(),
    };
    try {
      await fetchApi("/procurement", { method: "POST", body: JSON.stringify(po) });
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The request did not reach Procurement.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Request Procurement"
      subtitle="Request for purchase requisition to procurements"
      onClose={onClose}
      width="max-w-[620px]"
    >
      <div className="flex items-center gap-2">
        {(["parts", "lubricants", "tyres"] as StoreTab[]).map((t) => (
          <label
            key={t}
            className={cn(
              "flex h-[38px] cursor-pointer items-center gap-2 rounded-[8px] border px-3.5 text-[13px]",
              tab === t ? "border-[#E2E5E9] shadow-[0px_1px_2px_rgba(27,36,50,0.08)]" : "border-[#E9ECF0] text-[#5C6470]",
            )}
          >
            <input
              type="radio"
              name="proc-family"
              checked={tab === t}
              onChange={() => {
                setTab(t);
                setItemId("");
              }}
              className="accent-[#ED351D]"
            />
            {t === "parts" ? "Spare Parts" : t === "lubricants" ? "Lubricants" : "Tyre & Rims"}
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <ModalField label="Select from Registered Inventory">
          <div className="relative">
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className={cn(inputClass, "appearance-none pr-9")}
            >
              <option value="">Select</option>
              {candidates.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} — {i.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6470]" />
          </div>
        </ModalField>
        <ModalField label="Part Number (Auto-Fill)" required>
          <input className={cn(inputClass, "bg-[#F7F8FA] text-[#9AA2AC]")} readOnly value={chosen?.sku ?? ""} />
        </ModalField>
        <ModalField label="Part Name (Auto-Fill)" required>
          <input className={cn(inputClass, "bg-[#F7F8FA] text-[#9AA2AC]")} readOnly value={chosen?.name ?? ""} />
        </ModalField>
        <ModalField label="Category (Auto-Fill)" required>
          <input className={cn(inputClass, "bg-[#F7F8FA] text-[#9AA2AC]")} readOnly value={chosen?.category ?? ""} />
        </ModalField>
        <ModalField label="Requested Quantity" required>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </ModalField>
        <ModalField label="Unit Cost (Auto-Fill)" required>
          <input
            className={cn(inputClass, "bg-[#F7F8FA] text-[#9AA2AC]")}
            readOnly
            value={chosen?.unitCost ? formatNairaFull(chosen.unitCost) : ""}
          />
        </ModalField>
      </div>

      <div className="mt-3.5">
        <ModalField label="Procurement Note:">
          <textarea
            rows={3}
            placeholder="e.g. critical stock depletion"
            className="w-full rounded-[8px] border border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px] text-[#1B2432] outline-none placeholder:text-[#9AA2AC] focus:border-[#ED351D]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </ModalField>
      </div>

      <div className="mt-3.5">
        <ModalField label="Requested by:" required>
          <input
            className={inputClass}
            placeholder="e.g. David Doe"
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
          />
        </ModalField>
      </div>

      <div className="mt-4">
        <ModalActions onCancel={onClose} submitLabel="Send Request" busy={busy} onAction={submit} />
      </div>
    </ModalShell>
  );
}
