import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CardShell,
  ModalActions,
  ModalField,
  ModalShell,
  StockChip,
  inputClass,
} from "@/components/fleetopsx/store-portal";
import { authService, formatNairaFull, inventoryService } from "@/lib/fleetopsx/services";
import type { InventoryItem } from "@/lib/fleetopsx/types";

/**
 * PROCUREMENT · INVENTORY — the buying desk's own shelf book.
 *
 * The store and procurement share one stock ledger, but not one screen. This is
 * the desk's: every line carries the money — the unit price paid for it and the
 * cost of what is sitting on the shelf — and both can be typed here, on a new
 * line as it is entered and on every line already there. The store's own
 * inventory has no price column at all: the two pages read the same rows, the
 * store just never receives the money.
 */
export const Route = createFileRoute("/workspace/app/procurement/inventory")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = [
      "Procurement",
      "Procurement Officer",
      "Procurement Manager",
      "Procurement Clerk",
      "Head of Procurement",
      "Purchasing Officer",
      "Buyer",
      "Transport Manager",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: ProcurementInventoryPage,
});

const PAGE_SIZE = 12;

const valueOf = (item: InventoryItem) =>
  Number(item.stock ?? 0) * Number(item.unitCost ?? 0);

function ProcurementInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const load = async () => {
    try {
      const rows = await inventoryService.list();
      setItems(rows);
    } catch {
      toast.error("Could not read the shelf. Retry in a moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.sku.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const totalCost = filtered.reduce((sum, i) => sum + valueOf(i), 0);
  const priced = filtered.filter((i) => Number(i.unitCost ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-[#1B2432]">
            Procurement Inventory
          </h1>
          <p className="mt-1 max-w-[620px] text-[13px] leading-[19px] text-[#5C6470]">
            The same shelf the store works, with the money on it. Set or change the unit
            price of any line — the cost of what sits there follows the quantity
            automatically. The store's own inventory never shows these figures.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-2 rounded-[8px] bg-[#1B2432] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#2A3547]"
        >
          <Plus className="h-4 w-4" /> Input New Inventory
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Shelf lines" value={filtered.length.toLocaleString("en-NG")} />
        <Metric label="Priced lines" value={`${priced.toLocaleString("en-NG")} of ${filtered.length.toLocaleString("en-NG")}`} />
        <Metric label="Stock value" value={formatNairaFull(totalCost)} />
      </div>

      <CardShell>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFF1F4] px-4 py-3">
          <p className="text-[14px] font-semibold text-[#1B2432]">
            Inventory Listing{" "}
            <span className="ml-1 rounded-[5px] bg-[#FDEDE8] px-1.5 py-0.5 text-[11px] font-semibold text-[#C6432A]">
              {filtered.length.toLocaleString("en-NG")}
            </span>
          </p>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search code, name or shelf"
            className="w-[260px] rounded-[8px] border border-[#E2E5E9] bg-white px-3 py-2 text-[13px] text-[#1B2432] outline-none focus:border-[#C9CFD8]"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[#5C6470]">
                <th className="py-3 pl-4 pr-3">Code</th>
                <th className="py-3 pr-3">Description</th>
                <th className="py-3 pr-3">Shelf</th>
                <th className="py-3 pr-3 text-right">Qty</th>
                <th className="py-3 pr-3 text-right">Unit price</th>
                <th className="py-3 pr-3 text-right">Cost</th>
                <th className="py-3 pr-3">Status</th>
                <th className="w-[92px] py-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-t border-[#EFF1F4]">
                  <td className="py-3 pl-4 pr-3 text-[12.5px] font-semibold text-[#1B2432]">
                    {item.sku}
                  </td>
                  <td className="py-3 pr-3 text-[12.5px] text-[#5C6470]">
                    <span className="line-clamp-2 max-w-[260px]">{item.name}</span>
                  </td>
                  <td className="py-3 pr-3 text-[12px] text-[#5C6470]">{item.category}</td>
                  <td className="py-3 pr-3 text-right text-[12.5px] text-[#1B2432]">
                    {Number(item.stock).toLocaleString("en-NG")}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      title="Set or change this line's unit price"
                      className={`rounded-[5px] px-1 py-0.5 text-[12.5px] font-semibold underline decoration-dotted decoration-[#C9CFD8] underline-offset-2 hover:bg-[#F7F8FA] ${
                        Number(item.unitCost ?? 0) > 0 ? "text-[#1B2432]" : "text-[#8A94A3]"
                      }`}
                    >
                      {Number(item.unitCost ?? 0) > 0
                        ? formatNairaFull(Number(item.unitCost))
                        : "Set price"}
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-right text-[12.5px] font-medium text-[#1B2432]">
                    {valueOf(item) > 0 ? formatNairaFull(valueOf(item)) : "—"}
                  </td>
                  <td className="py-3 pr-3">
                    <StockChip
                      status={
                        Number(item.stock) <= 0
                          ? "Out of Stock"
                          : item.status === "Low Stock"
                            ? "Low Stock"
                            : "In Stock"
                      }
                    />
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded-[6px] border border-[#E2E5E9] bg-white px-2 py-1 text-[12px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
                    >
                      Modify
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-[#8A94A3]">
                    {loading ? "Reading the shelf…" : "No line matches that search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[#EFF1F4] px-4 py-3 text-[12px] text-[#5C6470]">
          <span>
            {filtered.length
              ? `${safePage * PAGE_SIZE + 1} - ${Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of ${filtered.length.toLocaleString("en-NG")}`
              : "0 lines"}
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage(safePage - 1)}
              className="rounded-[6px] border border-[#E2E5E9] px-2.5 py-1.5 disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              className="rounded-[6px] border border-[#E2E5E9] px-2.5 py-1.5 disabled:opacity-40"
            >
              ›
            </button>
          </span>
        </div>
      </CardShell>

      {newOpen && (
        <InventoryForm
          mode="new"
          onClose={() => setNewOpen(false)}
          onDone={async () => {
            setNewOpen(false);
            await load();
          }}
        />
      )}
      {editing && (
        <InventoryForm
          mode="edit"
          item={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#E2E5E9] bg-white px-4 py-3">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.4px] text-[#7C8794]">{label}</p>
      <p className="mt-1 text-[18px] font-semibold text-[#1B2432]">{value}</p>
    </div>
  );
}

/**
 * One form for both doors: a brand new shelf line (which carries its price from
 * the first keystroke) and an existing one. Cost is never typed by hand — it is
 * the quantity times the unit price, so the two columns can never disagree.
 */
function InventoryForm({
  mode,
  item,
  onClose,
  onDone,
}: {
  mode: "new" | "edit";
  item?: InventoryItem;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [category, setCategory] = useState(item?.category ?? "General");
  const [stock, setStock] = useState(String(item?.stock ?? 0));
  const [reorder, setReorder] = useState(String(item?.reorderLevel ?? 5));
  const [unitPrice, setUnitPrice] = useState(
    item && Number(item.unitCost ?? 0) > 0 ? String(item.unitCost) : "",
  );
  const [busy, setBusy] = useState(false);

  const qty = Math.max(0, Math.trunc(Number(stock) || 0));
  const price = Math.max(0, Number(unitPrice) || 0);
  const cost = qty * price;

  const save = async () => {
    if (!name.trim()) {
      toast.error("What is the line called?");
      return;
    }
    if (mode === "new" && !sku.trim()) {
      toast.error("A stock code is required.");
      return;
    }
    if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0) {
      toast.error("Unit price must be a number, e.g. 1750.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "new") {
        await inventoryService.createItem({
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim() || "General",
          stock: qty,
          reorderLevel: Math.max(0, Math.trunc(Number(reorder) || 0)),
          unitCost: price,
        });
        toast.success("The line is on the shelf, priced.");
      } else if (item) {
        await inventoryService.updateItem(item.id, {
          name: name.trim(),
          category: category.trim() || "General",
          stock: qty,
          reorderLevel: Math.max(0, Math.trunc(Number(reorder) || 0)),
          unitCost: price,
        });
        toast.success("The line is updated.");
      }
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The line did not save.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={mode === "new" ? "Input New Inventory" : "Modify Inventory"}
      onClose={onClose}
      width="max-w-[560px]"
    >
      <div className="grid grid-cols-2 gap-3">
        <ModalField label="Part Number:" required>
          <input
            className={inputClass}
            value={sku}
            disabled={mode === "edit"}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. SP0447"
          />
        </ModalField>
        <ModalField label="Part Name:" required>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 10mm Washer"
          />
        </ModalField>
        <ModalField label="Shelf / Category:">
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Spare Parts"
          />
        </ModalField>
        <ModalField label="Quantity:">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </ModalField>
        <ModalField label="Unit Price:" required>
          <input
            inputMode="decimal"
            className={inputClass}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="e.g. 12,345"
          />
        </ModalField>
        <ModalField label="Reorder Level:">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
          />
        </ModalField>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-[8px] bg-[#EAF7F3] px-4 py-3">
        <span className="text-[13px] font-semibold text-[#1B2432]">Cost of this line:</span>
        <span className="text-[13.5px] font-semibold text-[#1B2432]">
          {cost > 0 ? formatNairaFull(cost) : "—"}
          <span className="ml-2 text-[11.5px] font-medium text-[#7C8794]">
            {qty.toLocaleString("en-NG")} × {price > 0 ? formatNairaFull(price) : "—"}
          </span>
        </span>
      </div>

      <div className="mt-4">
        <ModalActions
          onCancel={onClose}
          submitLabel={mode === "new" ? "Save and Upload to List" : "Save Changes"}
          busy={busy}
          onAction={save}
        />
      </div>
    </ModalShell>
  );
}
