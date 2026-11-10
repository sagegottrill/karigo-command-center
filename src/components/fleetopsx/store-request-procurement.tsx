import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ModalActions,
  ModalField,
  ModalShell,
  FAMILY_LABEL,
  FAMILY_OPTIONS,
  familyFromOption,
  familyOfItem,
  inputClass,
  type ItemFamily,
} from "@/components/fleetopsx/store-portal";
import { fetchApi } from "@/lib/fleetopsx/apiClient";
import { authService } from "@/lib/fleetopsx/services";
import type { InventoryItem, ProcurementRequest } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

const currentUserName = () =>
  authService.getCurrentUser()?.name?.trim() ||
  (typeof window !== "undefined" ? localStorage.getItem("fleetopsx_user_name") || "" : "") ||
  "";

/** The shelf families a brand-new part can be filed under. */
const NEW_PART_CATEGORIES: string[] = [
  FAMILY_LABEL.parts,
  FAMILY_LABEL.lubricants,
  FAMILY_LABEL.tyres,
  FAMILY_LABEL.rims,
  FAMILY_LABEL.batteries,
  "Other",
];

/**
 * Request Procurement — the store asks the buying desk to buy a part.
 *
 * Two ways in, because the yard needs both:
 *
 *   Registered inventory — a line already on the shelf. Its name and category
 *   auto-fill from the shelf row.
 *
 *   New part — a part the store has never stocked, so there is nothing to pick
 *   and nothing to auto-fill. The name is typed and the category is picked.
 *
 * NEITHER CARRIES A PRICE (TM's ruling, Nov 2026): the store raises the need and
 * the Procurement desk prices it. The Unit Cost field used to sit here and the
 * store's figure became the PO's price before a buyer had quoted anything — the
 * store is cost-blind elsewhere, so it is cost-blind here too.
 *
 * Either way the request lands on the Transport Manager's authorisation desk,
 * never straight into stock.
 */
export function RequestProcurementModal({
  items,
  onClose,
  onDone,
  initialItemId,
}: {
  items: InventoryItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
  /** Pre-picked when the row menu's "Procure Request" opened the modal. */
  initialItemId?: string;
}) {
  const [mode, setMode] = useState<"registered" | "new">("registered");
  const [familyOption, setFamilyOption] = useState(FAMILY_OPTIONS[0] ?? "All Categories");
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(NEW_PART_CATEGORIES[0] ?? "Spare Parts");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [requestedBy, setRequestedBy] = useState(currentUserName());
  const [busy, setBusy] = useState(false);

  const optionFamily = familyFromOption(familyOption);
  const candidates = useMemo(
    () => (optionFamily ? items.filter((i) => familyOfItem(i) === optionFamily) : items),
    [items, optionFamily],
  );
  const chosen = useMemo(() => candidates.find((i) => i.id === itemId) || null, [candidates, itemId]);

  const pickItem = (id: string) => {
    setItemId(id);
  };

  const partLabel =
    mode === "registered" ? chosen?.name ?? "" : newName.trim();

  const submit = async () => {
    if (mode === "registered" && !chosen) {
      toast.error("Pick a line from the registered inventory, or switch to New part.");
      return;
    }
    if (mode === "new" && !newName.trim()) {
      toast.error("Name the part being bought.");
      return;
    }
    if ((Number(quantity) || 0) <= 0) {
      toast.error("How many units should be bought?");
      return;
    }
    setBusy(true);
    // The PO lands in the procurement ledger with exactly the fields the model
    // owns. A registered line keeps its SKU as the part name (the store re-reads
    // it on delivery); a new part carries the typed name and no buying reference,
    // so the server stamps its own PO tag. The category of a new part rides in
    // the note — the ledger has no category column of its own.
    const base: Partial<ProcurementRequest> = {
      quantity: Number(quantity) || 0,
      status: "Requested",
      kind: "Part",
      // Priced by Procurement, never by the store.
      unitPrice: null,
      date: new Date().toISOString(),
      requestedBy: requestedBy.trim() || undefined,
    };
    const po: Partial<ProcurementRequest> =
      mode === "registered" && chosen
        ? {
            ...base,
            partName: chosen.sku,
            linkedId: chosen.sku || chosen.id,
            note: note.trim() || undefined,
          }
        : {
            ...base,
            partName: newName.trim(),
            note:
              [`New part · Category: ${newCategory}`, note.trim()].filter(Boolean).join(" · ") ||
              undefined,
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
      {/* Where the part comes from decides what the form asks for. */}
      <div className="mb-3.5 flex items-center gap-2">
        {(
          [
            { id: "registered", label: "Registered inventory" },
            { id: "new", label: "New part" },
          ] as const
        ).map((option) => {
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              className={cn(
                "h-[34px] rounded-[6px] px-3 text-[13px] font-medium",
                active
                  ? "bg-[#1B2432] text-white"
                  : "border border-[#E2E5E9] bg-white text-[#5C6470] hover:bg-[#F7F8FA]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {mode === "registered" ? (
          <>
            <ModalField label="Select Category">
              <div className="relative">
                <select
                  value={familyOption}
                  onChange={(e) => {
                    setFamilyOption(e.target.value);
                    setItemId("");
                  }}
                  className={cn(inputClass, "appearance-none pr-9")}
                >
                  {FAMILY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6470]" />
              </div>
            </ModalField>
            <ModalField label="Select from Registered Inventory">
              <div className="relative">
                <select
                  value={itemId}
                  onChange={(e) => pickItem(e.target.value)}
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
            <ModalField label="Part Name" required>
              <input
                className={cn(inputClass, "bg-[#F7F8FA] text-[#5C6470]")}
                readOnly
                value={chosen?.name ?? ""}
                placeholder="Fills from the shelf line you pick"
              />
            </ModalField>
            <ModalField label="Category" required>
              <input
                className={cn(inputClass, "bg-[#F7F8FA] text-[#5C6470]")}
                readOnly
                value={chosen ? FAMILY_LABEL[familyOfItem(chosen)] : ""}
                placeholder="Fills from the shelf line you pick"
              />
            </ModalField>
          </>
        ) : (
          <>
            <ModalField label="Part Name" required>
              <input
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. 12mm hydraulic hose"
              />
            </ModalField>
            <ModalField label="Category" required>
              <div className="relative">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className={cn(inputClass, "appearance-none pr-9")}
                >
                  {NEW_PART_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6470]" />
              </div>
            </ModalField>
          </>
        )}

        <ModalField label="Requested Quantity" required>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
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

      {partLabel && (Number(quantity) || 0) > 0 ? (
        <div className="mt-3.5 flex items-center justify-between rounded-[8px] bg-[#EAF7F3] px-4 py-3">
          <span className="text-[13.5px] font-semibold text-[#1B2432]">
            {partLabel} × {Number(quantity) || 0}
          </span>
          <span className="text-[13.5px] font-medium text-[#7C8794]">
            Price to be quoted by Procurement
          </span>
        </div>
      ) : null}

      <div className="mt-4">
        <ModalActions onCancel={onClose} submitLabel="Send Request" busy={busy} onAction={submit} />
      </div>
    </ModalShell>
  );
}
