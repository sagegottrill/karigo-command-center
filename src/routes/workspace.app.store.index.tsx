import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronDown, Download, MoreVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { downloadCsvBlob } from "@/lib/fleetopsx/table-export";
import { RequestProcurementModal } from "@/components/fleetopsx/store-request-procurement";
import {
  CardShell,
  CountBadge,
  Dropdown,
  ModalActions,
  ModalField,
  ModalShell,
  PagerFooter,
  SearchField,
  FAMILY_LABEL,
  StockChip,
  StorePageShell,
  familyOfItem,
  csvOf,
  inputClass,
  type ItemFamily,
} from "@/components/fleetopsx/store-portal";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, formatNairaFull, inventoryService } from "@/lib/fleetopsx/services";
import type { InventoryItem } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/store/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // The store's own portal: Parts & Store and the Procurement buyer work it,
    // the STOREHOUSE desk may also read the shelf, and the Transport Manager /
    // Platform Admin audit it. Engineering keeps its own pages for raising
    // requests — the old shared /parts board was never the store's to own.
    const allowed = [
      "Parts & Store",
      "Parts and Store",
      "Procurement",
      "Inventory",
      "Transport Manager",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: StoreInventoryPage,
});

const PAGE_SIZE = 12;

/** The stock-level buckets the design's filter names, honest to the shelf. */
const STOCK_OPTIONS = ["All Stock Levels", "Low Stock Alert", "Normal Buffer", "Zero Stock"];

function matchesStock(item: InventoryItem, option: string) {
  switch (option) {
    case "Low Stock Alert":
      return item.stock > 0 && item.status === "Low Stock";
    case "Normal Buffer":
      return item.status !== "Out of Stock" && item.stock > 0 && item.status !== "Low Stock";
    case "Zero Stock":
      return item.stock <= 0 || item.status === "Out of Stock";
    default:
      return true;
  }
}

/** The categories the manual-import form offers per family (design §import). */
const IMPORT_CATEGORIES: Record<ItemFamily, string[]> = {
  parts: [
    "Brake",
    "Engine & Injection",
    "Suspension",
    "Electrical",
    "Body & Chassis",
    "Transmission",
    "General",
  ],
  lubricants: [
    "Engine Oil",
    "Gear Oil & Transmission",
    "Grease",
    "Hydraulic Fluid",
    "Coolant",
    "Fuel",
  ],
  tyres: ["Tyre", "Tube & Flap"],
  rims: ["Rim", "Hub & Stud"],
  batteries: ["Battery", "Terminal & Charger"],
};

const currentUserName = () =>
  authService.getCurrentUser()?.name?.trim() ||
  (typeof window !== "undefined" ? localStorage.getItem("fleetopsx_user_name") || "" : "") ||
  "";

function StoreInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All Categories");
  const [stockLevel, setStockLevel] = useState<string>(STOCK_OPTIONS[0] ?? "All Stock Levels");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [restockFor, setRestockFor] = useState<InventoryItem | null>(null);
  const [modifyFor, setModifyFor] = useState<InventoryItem | null>(null);
  const [procurementState, setProcurementState] = useState<{ open: boolean; itemId?: string }>({
    open: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await inventoryService.list();
      setItems(rows);
    } catch {
      toast.error("Could not reach the shelf. Retry in a moment.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The row menu closes when the pointer goes anywhere else on the page.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  /** The shelf's own category list, straight from the rows. */
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.category) set.add(item.category);
    return ["All Categories", ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (category === "All Categories" || item.category === category) &&
        matchesStock(item, stockLevel) &&
        (!q ||
          `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(q)),
    );
  }, [items, category, stockLevel, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const exportCsv = () => {
    const rows: string[][] = [
      ["Code", "Description", "Category", "Family", "Quantity", "Status", "Unit Cost"],
      ...filtered.map((i) => [
        i.sku,
        i.name,
        i.category,
        FAMILY_LABEL[familyOfItem(i)],
        String(i.stock),
        i.status,
        String(i.unitCost ?? 0),
      ]),
    ];
    downloadCsvBlob(csvOf(rows), "store-inventory-listing");
  };

  return (
    <>
      <StorePageShell
        title="Store Inventory"
        subtitle="Upload and monitor stock level and unit pricing of spare parts, lubricants, tires, rims, and batteries."
        actions={
          <>
            <button
              type="button"
              onClick={() => setFileOpen(true)}
              className="flex h-[40px] items-center gap-2 rounded-[8px] bg-[#1B2432] px-4 text-[13.5px] font-medium text-white hover:bg-[#2A3849]"
            >
              <Download className="size-4" />
              Import Inventory
            </button>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("store-inventory-listing")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="h-[40px] rounded-[8px] border border-[#E2E5E9] bg-white px-4 text-[13.5px] text-[#9AA2AC] hover:text-[#1B2432]"
            >
              View Inventory Listing
            </button>
            <button
              type="button"
              onClick={() => setProcurementState({ open: true })}
              className="h-[40px] rounded-[8px] bg-[#ED351D] px-4 text-[13.5px] font-medium text-white hover:bg-[#d92f18]"
            >
              Request Procurement
            </button>
          </>
        }
      >
        <div id="store-inventory-listing">
          <CardShell className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  Inventory Listing
                </h2>
                <CountBadge value={filtered.length} />
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                <Dropdown
                  value={category}
                  options={categoryOptions}
                  onChange={setCategory}
                  className="w-[176px]"
                />
                <Dropdown
                  value={stockLevel}
                  options={STOCK_OPTIONS}
                  onChange={setStockLevel}
                  className="w-[150px]"
                />
                <SearchField value={query} onChange={setQuery} />
              </div>
            </div>

            {loading ? (
              <FigmaLoadingState label="Loading the shelf…" />
            ) : filtered.length === 0 ? (
              <div className="py-10">
                <FigmaEmptyState
                  title="No stock on the shelf yet"
                  body={
                    items.length === 0
                      ? "The shelf is empty — Import Inventory fills it from the ledger, and a manual line can be registered there too."
                      : "Nothing matches this filter. Loosen the filters, or import the line with Import Inventory."
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => setFileOpen(true)}
                      className="h-[38px] rounded-[8px] bg-[#1B2432] px-4 text-[13.5px] font-medium text-white hover:bg-[#2A3849]"
                    >
                      Import Inventory
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="text-left text-[12px] font-semibold uppercase tracking-[0.5px] text-[#5C6470]">
                      <th className="py-3 pr-4">Code</th>
                      <th className="py-3 pr-4">Description</th>
                      <th className="py-3 pr-4">Category</th>
                      <th className="py-3 pr-4">Quantity</th>
                      <th className="py-3 pr-4">Unit Cost</th>
                      <th className="py-3 pr-2">Status</th>
                      <th className="w-10 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((item) => (
                      <tr key={item.id} className="border-t border-[#EFF1F4]">
                        <td className="py-3 pr-4 text-[13px] font-semibold text-[#1B2432]">
                          {item.sku}
                        </td>
                        <td className="py-3 pr-4 text-[12.5px] leading-[17px] text-[#5C6470]">
                          <span className="line-clamp-2 max-w-[360px]">{item.name}</span>
                        </td>
                        <td className="py-3 pr-4 text-[12.5px] text-[#5C6470]">{item.category}</td>
                        <td className="py-3 pr-4 text-[13px] text-[#1B2432]">
                          {item.stock.toLocaleString("en-NG")}
                        </td>
                        <td className="py-3 pr-4 text-[13px] text-[#1B2432]">
                          {item.unitCost > 0 ? formatNairaFull(item.unitCost) : ""}
                        </td>
                        <td className="py-3 pr-2">
                          <StockChip
                            status={
                              item.stock <= 0 || item.status === "Out of Stock"
                                ? "Out of Stock"
                                : item.status === "Low Stock"
                                  ? "Low Stock"
                                  : "In Stock"
                            }
                          />
                        </td>
                        <td className="relative py-3 text-right">
                          <RowMenuKebab
                            onRestock={() => setRestockFor(item)}
                            onProcure={() =>
                              setProcurementState({ open: true, itemId: item.id })
                            }
                            onModify={() => setModifyFor(item)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="mt-4 -mx-5">
                <PagerFooter
                  shownFrom={safePage * PAGE_SIZE + 1}
                  shownTo={Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)}
                  total={filtered.length}
                  page={safePage}
                  pageCount={pageCount}
                  onPage={setPage}
                  onExport={exportCsv}
                  exportLabel="Export"
                />
              </div>
            )}
          </CardShell>
        </div>
      </StorePageShell>

      {/* Hide the kebab menus on every modal open/unmount cycle above. */}
      {manualOpen && (
        <ManuallyImportInventoryModal
          onClose={() => setManualOpen(false)}
          onDone={async () => {
            setManualOpen(false);
            toast.success("The line is on the shelf.");
            await load();
          }}
        />
      )}
      {fileOpen && (
        <ImportInventoryFromFileModal
          onClose={() => setFileOpen(false)}
          onSwitchManual={() => {
            setFileOpen(false);
            setManualOpen(true);
          }}
          onDone={async (summary) => {
            setFileOpen(false);
            toast.success(summary);
            await load();
          }}
        />
      )}
      {restockFor && (
        <RestockPartInventoryModal
          item={restockFor}
          onClose={() => setRestockFor(null)}
          onDone={async () => {
            setRestockFor(null);
            toast.success("Shelf updated — the stock movement is on the ledger.");
            await load();
          }}
        />
      )}
      {modifyFor && (
        <ModifyInventoryModal
          item={modifyFor}
          onClose={() => setModifyFor(null)}
          onDone={async () => {
            setModifyFor(null);
            toast.success("The shelf line is updated.");
            await load();
          }}
        />
      )}
      {procurementState.open && (
        <RequestProcurementModal
          items={items}
          initialItemId={procurementState.itemId}
          onClose={() => setProcurementState({ open: false })}
          onDone={async () => {
            setProcurementState({ open: false });
            toast.success("The buy is on Procurement's desk.");
          }}
        />
      )}
    </>
  );
}

/* --------------------------------------------------- the row's kebab menu § */

/**
 * The design's three-action row menu: Restock (red filled), Procure Request
 * (red text) and Modify (plain) — the emphasis levels the approved frame
 * shows.
 */
function RowMenuKebab({
  onRestock,
  onProcure,
  onModify,
}: {
  onRestock: () => void;
  onProcure: () => void;
  onModify: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Row actions"
        onClick={() => setOpen((v) => !v)}
        className="grid size-8 place-items-center rounded-[6px] text-[#1B2432] hover:bg-[#F7F8FA]"
      >
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-[176px] overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white py-1.5 shadow-[0px_8px_24px_rgba(27,36,50,0.18)]">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRestock();
            }}
            className="mx-2 mb-1 flex h-[36px] w-[calc(100%-16px)] items-center justify-center rounded-[8px] bg-[#ED351D] text-[13px] font-medium text-white hover:bg-[#d92f18]"
          >
            Restock
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onProcure();
            }}
            className="block w-full px-3.5 py-2 text-left text-[13px] font-medium text-[#ED351D] hover:bg-[#FDF2F1]"
          >
            Procure Request
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onModify();
            }}
            className="block w-full px-3.5 py-2 text-left text-[13px] text-[#1B2432] hover:bg-[#F7F8FA]"
          >
            Modify
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- manual import (design §) */

function ManuallyImportInventoryModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [tab, setTab] = useState<ItemFamily>("parts");
  const [partNumber, setPartNumber] = useState("");
  const [partName, setPartName] = useState("");
  const [category, setCategory] = useState("Select");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setCategory("Select"), [tab]);

  const total = (Number(quantity) || 0) * (Number(unitCost) || 0);

  const submit = async () => {
    if (!partNumber.trim() || !partName.trim() || category === "Select" || !quantity) {
      toast.error("Part number, part name, category and quantity are required.");
      return;
    }
    setBusy(true);
    try {
      await inventoryService.createItem({
        sku: partNumber.trim(),
        name: partName.trim(),
        category,
        stock: Number(quantity) || 0,
        unitCost: Number(unitCost) || 0,
        location: "Main Store",
      });
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the line.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Add Inventory"
      subtitle="Step-by-step upload of inventory list"
      onClose={onClose}
    >
      <div className="flex items-center gap-2">
        {(
          ["parts", "lubricants", "tyres", "rims", "batteries"] as ItemFamily[]
        ).map((t) => (
          <label
            key={t}
            className={cn(
              "flex h-[38px] cursor-pointer items-center gap-2 rounded-[8px] border px-3 text-[12.5px]",
              tab === t
                ? "border-[#E2E5E9] bg-white shadow-[0px_1px_2px_rgba(27,36,50,0.08)]"
                : "border-[#E9ECF0] bg-white text-[#5C6470]",
            )}
          >
            <input
              type="radio"
              name="import-family"
              checked={tab === t}
              onChange={() => setTab(t)}
              className="accent-[#ED351D]"
            />
            {FAMILY_LABEL[t]}
          </label>
        ))}
      </div>

      <div className="mt-4 space-y-3.5">
        <ModalField label="Part Number:" required>
          <input
            className={inputClass}
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
          />
        </ModalField>
        <ModalField label="Part Name:" required>
          <input
            className={inputClass}
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
          />
        </ModalField>
        <div>
          <label className="mb-1.5 block text-[13.5px] font-medium text-[#1B2432]">
            Select Category
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={cn(inputClass, "appearance-none pr-9")}
            >
              <option disabled>Select</option>
              {IMPORT_CATEGORIES[tab].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6470]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ModalField label="Quantity:" required>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </ModalField>
          <ModalField label="Unit Cost:" required>
            <input
              className={inputClass}
              placeholder="e.g ₦12,345,678"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </ModalField>
        </div>
        <div className="flex items-center justify-between rounded-[8px] bg-[#EAF7F3] px-4 py-3">
          <span className="text-[13.5px] font-semibold text-[#1B2432]">Total Stock Value:</span>
          <span className="text-[13.5px] font-medium text-[#7C8794]">
            {total > 0 ? formatNairaFull(total) : "e.g ₦12,345,678"}
          </span>
        </div>
      </div>

      <ModalActions
        onCancel={onClose}
        submitLabel="Save and Upload to List"
        busy={busy}
        onAction={submit}
      />
    </ModalShell>
  );
}

/* ------------------------------------------------------ import from file § */

interface PendingFile {
  name: string;
  size: number;
  rows?: Array<Record<string, unknown>>;
}

function ImportInventoryFromFileModal({
  onClose,
  onSwitchManual,
  onDone,
}: {
  onClose: () => void;
  onSwitchManual: () => void;
  onDone: (summary: string) => Promise<void>;
}) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const takeFiles = async (list: FileList | null) => {
    if (!list) return;
    const added: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (!/\.xlsx?$/i.test(file.name)) {
        toast.error(`"${file.name}" is not a .XLS sheet. Only .XLS files can be read.`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`"${file.name}" is over the 50mb limit.`);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        const sheet = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
        const rows = sheet
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
          : [];
        added.push({ name: file.name, size: file.size, rows });
      } catch {
        toast.error(`Could not read "${file.name}". Is it a valid Excel sheet?`);
      }
    }
    if (added.length) setFiles((prev) => [...prev, ...added]);
  };

  const confirm = async () => {
    if (files.length === 0) {
      toast.error("Attach at least one inventory sheet first.");
      return;
    }
    setBusy(true);
    let created = 0;
    let updated = 0;
    try {
      for (const file of files) {
        const items = (file.rows ?? [])
          .map((r) => ({
            sku: String(r["Part Number"] ?? r["SKU"] ?? r.sku ?? "").trim(),
            name: String(r["Part Name"] ?? r["Name"] ?? r.name ?? "").trim(),
            category: String(r["Category"] ?? r.category ?? "General").trim() || "General",
            stock: Number(r["Unit Quantity"] ?? r["Quantity"] ?? r.stock ?? 0) || 0,
            unitCost: Number(r["Unit Cost"] ?? r["Cost"] ?? r.unitCost ?? 0) || 0,
            location: "Main Store",
          }))
          .filter((i) => i.sku && i.name);
        if (!items.length) continue;
        const res = await inventoryService.importItems(items);
        created += Number((res as { created?: number }).created ?? 0);
        updated += Number((res as { updated?: number }).updated ?? 0);
      }
      if (created + updated === 0) {
        toast.error(
          "No readable rows found. The sheet needs 'Part Number', 'Part Name', 'Category', 'Unit Quantity' and 'Unit Cost' columns.",
        );
        setBusy(false);
        return;
      }
      await onDone(`${created} line(s) added, ${updated} updated from the upload.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The upload did not land.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Import Inventory from File"
      subtitle="Upload inventory list document"
      onClose={onClose}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void takeFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-[10px] border-2 border-dashed px-5 py-8 text-center",
          dragging ? "border-[#ED351D] bg-[#FDF2F1]" : "border-[#E2E5E9] bg-white",
        )}
      >
        <div className="grid size-10 place-items-center rounded-full border border-[#E2E5E9] text-[#1B2432]">
          <Download className="size-4" />
        </div>
        <p className="text-[13.5px] text-[#1B2432]">Drag &amp; Drop your Inventory file here</p>
        <div className="flex items-center gap-3 text-[11.5px] text-[#9AA2AC]">
          <span className="h-px w-16 bg-[#E9ECF0]" />
          OR
          <span className="h-px w-16 bg-[#E9ECF0]" />
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-[36px] rounded-[8px] bg-[#1B2432] px-4 text-[13px] font-medium text-white hover:bg-[#2A3849]"
        >
          Browse File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          multiple
          hidden
          onChange={(e) => {
            void takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-[12.5px] text-[#5C6470]">
          Only support .XLS .XLSX format (max. size 50mb)
        </p>
      </div>

      {files.map((f, idx) => (
        <div
          key={`${f.name}-${idx}`}
          className="mt-3 flex items-center gap-3 rounded-[8px] border border-[#E2E5E9] px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-[#1B2432]">{f.name}</p>
            <p className="text-[11.5px] text-[#9AA2AC]">
              {(f.size / 1024 / 1024).toFixed(2)}mb{f.rows ? ` · ${f.rows.length} row(s)` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
            className="rounded p-1 text-[#ED351D] hover:bg-[#FDF2F1]"
          >
            ✕
          </button>
        </div>
      ))}

      {/* The design's manual-import sheet is reachable from here too — one row
          of work should never force a second upload round-trip. */}
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={onSwitchManual}
          className="text-[13px] font-medium text-[#5C6470] underline-offset-2 hover:text-[#1B2432] hover:underline"
        >
          Or register a single line manually →
        </button>
      </div>

      <div className="mt-4">
        <ModalActions
          onCancel={onClose}
          submitLabel="Confirm Upload"
          busy={busy}
          onAction={confirm}
        />
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------ restock § */

function RestockPartInventoryModal({
  item,
  onClose,
  onDone,
}: {
  item: InventoryItem;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(item.unitCost ? String(item.unitCost) : "");
  const [loggedBy, setLoggedBy] = useState(currentUserName());
  const [busy, setBusy] = useState(false);

  const qty = Number(quantity) || 0;
  const price = Number(unitCost) || 0;
  const newTotal = item.stock + qty;
  const newValuation = newTotal * price;

  const confirm = async () => {
    if (qty <= 0) {
      toast.error("How many units arrived?");
      return;
    }
    if (price <= 0) {
      toast.error("What was paid per unit?");
      return;
    }
    setBusy(true);
    try {
      await inventoryService.purchase(item.id, {
        qty,
        unitPrice: price,
        vendor: item.supplier || undefined,
        note: `Restock logged by ${loggedBy || "store"}`,
        reference: loggedBy || "store desk",
      });
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The restock did not post.");
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Restock Part Inventory" onClose={onClose} width="max-w-[520px]">
      <div className="rounded-[8px] bg-[#F7F8FA] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1B2432]">{item.sku}</span>
          <span className="inline-flex items-center rounded-[6px] border border-[#E2E5E9] bg-white px-1.5 py-[2px] text-[10.5px] font-medium uppercase leading-none text-[#5C6470]">
            {item.category}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-[#5C6470]">{item.name}</p>
        <p className="mt-2 text-[13.5px] text-[#1B2432]">
          Current stock:&nbsp;
          <span className="inline-block rounded-[6px] border border-[#E2E5E9] bg-white px-2 py-[2px] text-[12.5px] font-semibold">
            {item.stock.toLocaleString("en-NG")}
          </span>
        </p>
      </div>

      <div className="mt-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <ModalField label="Requested Quantity:" required>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </ModalField>
          <ModalField label="Unit Cost:" required>
            <input
              className={inputClass}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </ModalField>
        </div>
        <div className="rounded-[8px] bg-[#EAF7F3] px-4 py-3">
          <p className="text-[13.5px] font-semibold text-[#1B2432]">
            New Total Stock:&nbsp;
            <span className="inline-block rounded-[6px] border border-[#D7EFE7] bg-white px-2 py-[2px] text-[12.5px]">
              {newTotal.toLocaleString("en-NG")}
            </span>
          </p>
          <p className="mt-1 text-[13.5px] text-[#1B2432]">
            Updated Cost Valuation:&nbsp;{formatNairaFull(newValuation)}
          </p>
        </div>
        <ModalField label="Logged by:" required>
          <input
            className={inputClass}
            placeholder="e.g David Doe"
            value={loggedBy}
            onChange={(e) => setLoggedBy(e.target.value)}
          />
        </ModalField>
      </div>

      <div className="mt-4">
        <ModalActions
          onCancel={onClose}
          submitLabel="Confirm Restock"
          busy={busy}
          onAction={confirm}
        />
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------ modify § */

/** The row menu's Modify: patch the shelf line's own columns on the spot. */
function ModifyInventoryModal({
  item,
  onClose,
  onDone,
}: {
  item: InventoryItem;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [unitCost, setUnitCost] = useState(item.unitCost ? String(item.unitCost) : "");
  const [stock, setStock] = useState(String(item.stock));
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!name.trim()) {
      toast.error("What is the line called?");
      return;
    }
    if (!category.trim()) {
      toast.error("Which shelf does it sit on?");
      return;
    }
    setBusy(true);
    try {
      await inventoryService.updateItem(item.id, {
        name: name.trim(),
        category: category.trim(),
        unitCost: Math.max(0, Number(unitCost) || 0),
        stock: Math.max(0, Math.trunc(Number(stock) || 0)),
      });
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The change did not save.");
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Modify Inventory" onClose={onClose} width="max-w-[520px]">
      <div className="rounded-[8px] bg-[#F7F8FA] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1B2432]">{item.sku}</span>
          <span className="inline-flex items-center rounded-[6px] border border-[#E2E5E9] bg-white px-1.5 py-[2px] text-[10.5px] font-medium uppercase leading-none text-[#5C6470]">
            {item.category}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <ModalField label="Part Name:" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </ModalField>
        <ModalField label="Category:" required>
          {/* A datalist keeps the shelf's existing categories first without
              blocking a brand-new one. */}
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="modify-category-options"
          />
          <datalist id="modify-category-options">
            <option value="Brake" />
            <option value="Engine & Injection" />
            <option value="Suspension" />
            <option value="Electrical" />
            <option value="Body & Chassis" />
            <option value="Transmission" />
            <option value="General" />
            <option value="Engine Oil" />
            <option value="Gear Oil & Transmission" />
            <option value="Grease" />
            <option value="Hydraulic Fluid" />
            <option value="Coolant" />
            <option value="Tyre" />
            <option value="Rim" />
            <option value="Tube & Flap" />
          </datalist>
        </ModalField>
        <div className="grid grid-cols-2 gap-3">
          <ModalField label="Quantity:" required>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </ModalField>
          <ModalField label="Unit Cost:" required>
            <input
              className={inputClass}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </ModalField>
        </div>
      </div>

      <div className="mt-4">
        <ModalActions onCancel={onClose} submitLabel="Save Changes" busy={busy} onAction={confirm} />
      </div>
    </ModalShell>
  );
}
