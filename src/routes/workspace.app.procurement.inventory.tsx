import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDown, ArrowUp, FileSpreadsheet, Plus } from "lucide-react";
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

type SortKey = "sku" | "name" | "category" | "stock" | "unitCost" | "value" | "status";
type SortState = { key: SortKey; dir: "asc" | "desc" };

const STATUS_RANK: Record<string, number> = { "Out of Stock": 0, "Low Stock": 1, "In Stock": 2 };

const statusOf = (item: InventoryItem) =>
  Number(item.stock) <= 0 ? "Out of Stock" : item.status === "Low Stock" ? "Low Stock" : "In Stock";

/**
 * The desks type these columns in every spelling there is — "Part No",
 * "PartNumber", "Part Number" — so headers are matched on their letters alone.
 */
const normHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const SHEET_FIELDS = {
  sku: ["Part Number", "Part No", "PartNumber", "SKU", "Code", "Item Code", "Stock Code"],
  name: ["Part Name", "PartName", "Name", "Description", "Item Description", "Item"],
  category: ["Category", "Group", "Type"],
  stock: ["Unit Quantity", "Quantity", "Qty", "Stock", "Balance", "Units"],
  unitCost: ["Cost", "Unit Cost", "Unit Price", "Price", "Rate"],
  unit: ["Unit", "UOM"],
  reorderLevel: ["Reorder Level", "Reorder", "Minimum", "Min Qty"],
};

const normName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** "₦1,234.50" and "2142.857142857143" both have to land as numbers. */
const numCell = (value: unknown) => {
  const cleaned = String(value ?? "").replace(/[^0-9.\-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

type SheetLine = {
  sku: string;
  name: string;
  category: string;
  stock: number;
  unitCost: number;
  unit: string;
  reorderLevel: number | null;
};

/**
 * Read the first sheet into shelf lines, skipping any title rows above the real
 * header. Returns the header's own truth too (does it carry a quantity column?)
 * so the upload can refuse a sheet that would zero out the shelf.
 */
const readSheetLines = (sheet: XLSX.WorkSheet) => {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const headerIndex = aoa.findIndex((row) =>
    row.some((cell) => /part\s*(number|no)|sku|item\s*code/i.test(String(cell ?? ""))),
  );
  const headerRow = (headerIndex >= 0 ? aoa[headerIndex] : aoa[0]) ?? [];
  const body = aoa.slice((headerIndex >= 0 ? headerIndex : 0) + 1);
  const hasHeader = (names: readonly string[]) =>
    headerRow.some((cell) => names.some((name) => normHeader(String(cell ?? "")) === normHeader(name)));
  const read = (row: unknown[], names: readonly string[]) => {
    for (const name of names) {
      const at = headerRow.findIndex((cell) => normHeader(String(cell ?? "")) === normHeader(name));
      if (at >= 0) return row[at];
    }
    return "";
  };
  const lines: SheetLine[] = body
    .map((row) => ({
      sku: String(read(row, SHEET_FIELDS.sku) ?? "").trim(),
      name: String(read(row, SHEET_FIELDS.name) ?? "").trim(),
      category: String(read(row, SHEET_FIELDS.category) ?? "").trim() || "General",
      stock: Math.max(0, Math.trunc(numCell(read(row, SHEET_FIELDS.stock)))),
      unitCost: Math.max(0, Math.round(numCell(read(row, SHEET_FIELDS.unitCost)) * 100) / 100),
      unit: String(read(row, SHEET_FIELDS.unit) ?? "").trim(),
      reorderLevel: hasHeader(SHEET_FIELDS.reorderLevel)
        ? Math.trunc(numCell(read(row, SHEET_FIELDS.reorderLevel))) || 0
        : null,
    }))
    .filter((line) => line.sku && line.name);
  return { lines, hasQuantityColumn: hasHeader(SHEET_FIELDS.stock) };
};

function ProcurementInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "sku", dir: "asc" });

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

  /** Click a header to sort by it; click it again to turn the order around. */
  const toggleSort = (key: SortKey) =>
    setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));

  const sorted = useMemo(() => {
    const list = [...filtered];
    const direction = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sort.key) {
        case "stock":
          return (Number(a.stock) - Number(b.stock)) * direction;
        case "unitCost":
          return (Number(a.unitCost ?? 0) - Number(b.unitCost ?? 0)) * direction;
        case "value":
          return (valueOf(a) - valueOf(b)) * direction;
        case "status":
          return ((STATUS_RANK[statusOf(a)] ?? 3) - (STATUS_RANK[statusOf(b)] ?? 3)) * direction;
        default:
          return String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), "en", {
            numeric: true,
            sensitivity: "base",
          }) * direction;
      }
    });
    return list;
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
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
            The same shelf the store works, with the money on it — in the stock sheet's
            own words: Part Number, Part Name, Category, Unit Quantity and Cost. Cost is what
            one unit costs; Stock Value is the quantity times that cost. Import the .xlsx
            to fill all of it in one go, or set a line's cost by hand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-[8px] border border-[#E2E5E9] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1B2432] hover:bg-[#F7F8FA]"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import from Excel
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-2 rounded-[8px] bg-[#1B2432] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#2A3547]"
          >
            <Plus className="h-4 w-4" /> Input New Inventory
          </button>
        </div>
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
            placeholder="Search code, name or category"
            className="w-[260px] rounded-[8px] border border-[#E2E5E9] bg-white px-3 py-2 text-[13px] text-[#1B2432] outline-none focus:border-[#C9CFD8]"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[#5C6470]">
                <SortHeader label="Part Number" sortKey="sku" sort={sort} onSort={toggleSort} className="py-3 pl-4 pr-3" />
                <SortHeader label="Part Name" sortKey="name" sort={sort} onSort={toggleSort} className="py-3 pr-3" />
                <SortHeader label="Category" sortKey="category" sort={sort} onSort={toggleSort} className="py-3 pr-3" />
                <SortHeader label="Unit Quantity" sortKey="stock" sort={sort} onSort={toggleSort} className="py-3 pr-3" align="right" />
                <SortHeader label="Cost" sortKey="unitCost" sort={sort} onSort={toggleSort} className="py-3 pr-3" align="right" />
                <SortHeader label="Stock Value" sortKey="value" sort={sort} onSort={toggleSort} className="py-3 pr-3" align="right" />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="py-3 pr-3" />
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
                      title="Set or change this line's cost — the sheet's Cost column"
                      className={`rounded-[5px] px-1 py-0.5 text-[12.5px] font-semibold underline decoration-dotted decoration-[#C9CFD8] underline-offset-2 hover:bg-[#F7F8FA] ${
                        Number(item.unitCost ?? 0) > 0 ? "text-[#1B2432]" : "text-[#8A94A3]"
                      }`}
                    >
                      {Number(item.unitCost ?? 0) > 0
                        ? formatNairaFull(Number(item.unitCost))
                        : "Set cost"}
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-right text-[12.5px] font-medium text-[#1B2432]">
                    {valueOf(item) > 0 ? formatNairaFull(valueOf(item)) : "—"}
                  </td>
                  <td className="py-3 pr-3">
                    <StockChip status={statusOf(item)} />
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

      {importOpen && (
        <ImportInventoryModal
          current={items}
          onClose={() => setImportOpen(false)}
          onDone={async (summary) => {
            setImportOpen(false);
            await load();
            toast.success(summary);
          }}
        />
      )}
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
        <ModalField label="Category:">
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Spare Parts"
          />
        </ModalField>
        <ModalField label="Unit Quantity:">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </ModalField>
        <ModalField label="Cost per unit:" required>
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

      <div className="mt-3 flex items-center justify-between rounded-[8px] bg-[#EAF7F3] px-4 py-3">          <span className="text-[13px] font-semibold text-[#1B2432]">Stock value of this line:</span>
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

/** A column heading that sorts the shelf: one click for direction, again to reverse. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`${className ?? ""} ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.5px] transition-colors hover:text-[#1B2432] ${
          active ? "text-[#1B2432]" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-30"}`} />
      </button>
    </th>
  );
}

/**
 * IMPORT FROM EXCEL — the buying desk's whole ledger, uploaded.
 *
 * The store's sheet (Part Number, Part Name, Unit, Currency, Unit Quantity,
 * Cost, Category) is the one this maps. Quantity and unit price are read from
 * the sheet, so pricing a 2,000-line shelf no longer means 2,000 clicks. A
 * sheet without a quantity column is refused outright: importing it would set
 * every line to zero.
 */
function ImportInventoryModal({
  current,
  onClose,
  onDone,
}: {
  current: InventoryItem[];
  onClose: () => void;
  onDone: (summary: string) => Promise<void>;
}) {
  const [parsed, setParsed] = useState<
    { name: string; size: number; lines: SheetLine[]; hasQuantityColumn: boolean } | null
  >(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const bySku = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of current) map.set(item.sku.trim().toUpperCase(), item);
    return map;
  }, [current]);

  const duplicateNameCount = useMemo(() => {
    if (!parsed) return 0;
    const seen = new Set<string>();
    let duplicates = 0;
    for (const line of parsed.lines) {
      const key = normName(line.name);
      if (seen.has(key)) duplicates += 1;
      else seen.add(key);
    }
    return duplicates;
  }, [parsed]);

  const take = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error(`"${file.name}" is not a sheet. Upload an .xlsx, .xls or .csv file.`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`"${file.name}" is over the 20mb limit.`);
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error("empty workbook");
      const { lines, hasQuantityColumn } = readSheetLines(sheet);
      if (!lines.length) {
        toast.error(
          "No readable rows. The sheet needs a 'Part Number' and a 'Part Name' column.",
        );
        return;
      }
      setParsed({ name: file.name, size: file.size, lines, hasQuantityColumn });
      if (!hasQuantityColumn) {
        toast.error(
          "This sheet has no quantity column — add 'Unit Quantity' so the upload cannot zero the shelf.",
        );
      }
    } catch {
      toast.error(`Could not read "${file.name}". Is it a valid Excel sheet?`);
    }
  };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Part Number", "Part Name", "Unit", "Currency", "Unit Quantity", "Cost", "Category"],
      ["SP0001", "Air System Regulator", "PCS", "NGN", 0, 0, "SPARE PARTS"],
      ["SP0003", "17mm Compressor Bolt", "PCS", "NGN", 7, 2142.86, "SPARE PARTS"],
    ]);
    sheet["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Inventory");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fleetopsx-inventory-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded — fill it and upload it back here.");
  };

  const commit = async () => {
    if (!parsed) {
      toast.error("Attach the Excel sheet first.");
      return;
    }
    if (!parsed.hasQuantityColumn) {
      toast.error("Add a 'Unit Quantity' column to the sheet before importing.");
      return;
    }
    setBusy(true);
    // NO SECOND LINE FOR THE SAME PART: a sheet that lists one part under two
    // Part Numbers (SP1015 and SP01015 both read "V Arm Kit") is folded into
    // the line the shelf already knows, with the quantities added. Only a part
    // the shelf has never held gets created, under its own number.
    const byName = new Map<string, InventoryItem>();
    for (const item of current) byName.set(normName(item.name), item);
    // A part the shelf has never held still has to be grouped by name, so the
    // first number the sheet uses becomes the line and the rest fold into it.
    const chosenCode = new Map<string, string>();
    const grouped = new Map<
      string,
      {
        sku: string;
        name: string;
        category: string;
        stock: number;
        unitCost: number;
        reorderLevel: number;
      }
    >();
    for (const line of parsed.lines) {
      const byCode = bySku.get(line.sku.toUpperCase());
      const nameKey = normName(line.name);
      const bySameName = byName.get(nameKey);
      const target = byCode ?? bySameName;
      const firstCode = chosenCode.get(nameKey);
      if (!firstCode) chosenCode.set(nameKey, target?.sku ?? line.sku);
      const key = (target?.sku ?? firstCode ?? line.sku).toUpperCase();
      const current_ = grouped.get(key);
      if (current_) {
        current_.stock += line.stock;
        current_.unitCost = Math.max(current_.unitCost, line.unitCost);
        continue;
      }
      grouped.set(key, {
        sku: target?.sku ?? line.sku,
        name: target?.name ?? line.name,
        category: line.category || target?.category || "General",
        stock: line.stock,
        unitCost: line.unitCost,
        reorderLevel: line.reorderLevel ?? target?.reorderLevel ?? 5,
      });
    }
    const payload = [...grouped.values()];
    const folded = parsed.lines.length - payload.length;
    let created = 0;
    let updated = 0;
    try {
      for (let at = 0; at < payload.length; at += 200) {
        const result = await inventoryService.importItems(payload.slice(at, at + 200));
        created += Number(result.created ?? 0);
        updated += Number(result.updated ?? 0);
      }
      await onDone(
        `${created.toLocaleString("en-NG")} line(s) added, ${updated.toLocaleString("en-NG")} updated${
          folded > 0 ? `, ${folded.toLocaleString("en-NG")} duplicate name(s) folded into one line` : ""
        } from ${parsed.name}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The upload did not land.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Import Inventory from Excel"
      subtitle="Quantity and unit price per line, straight from the stock sheet"
      onClose={onClose}
      width="max-w-[720px]"
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
          void take(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-[10px] border-2 border-dashed px-5 py-7 text-center ${
          dragging ? "border-[#C6432A] bg-[#FDF2F1]" : "border-[#E2E5E9] bg-white"
        }`}
      >
        <div className="grid size-10 place-items-center rounded-full border border-[#E2E5E9] text-[#1B2432]">
          <FileSpreadsheet className="size-4" />
        </div>
        <p className="text-[13.5px] text-[#1B2432]">Drag &amp; drop the stock sheet here</p>
        <div className="flex items-center gap-3 text-[11.5px] text-[#9AA2AC]">
          <span className="h-px w-16 bg-[#E9ECF0]" /> OR <span className="h-px w-16 bg-[#E9ECF0]" />
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
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            void take(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-[12px] text-[#8A94A3]">
          Columns matched: Part Number · Part Name · Unit · Currency · Unit Quantity · Cost · Category
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-[12px] font-semibold text-[#C6432A] underline decoration-dotted underline-offset-2"
        >
          Download the template
        </button>
      </div>

      {parsed && (
        <div className="mt-3 overflow-hidden rounded-[8px] border border-[#E2E5E9]">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F7F8FA] px-4 py-2.5">
            <p className="min-w-0 truncate text-[13px] font-medium text-[#1B2432]">{parsed.name}</p>
            <p className="text-[11.5px] text-[#5C6470]">
              {(parsed.size / 1024).toFixed(0)} KB · {parsed.lines.length.toLocaleString("en-NG")} line(s)
              {duplicateNameCount > 0
                ? ` · ${duplicateNameCount.toLocaleString("en-NG")} duplicate name(s) will fold into one line`
                : ""}
            </p>
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.4px] text-[#7C8794]">
                <th className="px-4 py-2">Part Number</th>
                <th className="px-2 py-2">Part Name</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2 text-right">Unit Quantity</th>
                <th className="px-4 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {parsed.lines.slice(0, 5).map((line) => (
                <tr key={line.sku} className="border-t border-[#EFF1F4]">
                  <td className="px-4 py-2 font-semibold text-[#1B2432]">{line.sku}</td>
                  <td className="max-w-[220px] truncate px-2 py-2 text-[#5C6470]">{line.name}</td>
                  <td className="px-2 py-2 text-[#5C6470]">{line.category}</td>
                  <td className="px-2 py-2 text-right text-[#1B2432]">
                    {line.stock.toLocaleString("en-NG")}
                  </td>
                  <td className="px-4 py-2 text-right text-[#1B2432]">
                    {line.unitCost > 0 ? formatNairaFull(line.unitCost) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[#EFF1F4] bg-[#FFF8E6] px-4 py-2 text-[11.5px] text-[#7A5B12]">
            {parsed.lines.length > 5
              ? `+ ${(parsed.lines.length - 5).toLocaleString("en-NG")} more line(s). `
              : ""}
            Lines already on the shelf are matched by Part Number — the sheet's quantity and unit price
            replace what is there.
          </p>
        </div>
      )}

      <div className="mt-4">
        <ModalActions
          onCancel={onClose}
          submitLabel={
            parsed
              ? `Import ${(parsed.lines.length - duplicateNameCount).toLocaleString("en-NG")} line(s)`
              : "Import"
          }
          busy={busy}
          onAction={commit}
        />
      </div>
    </ModalShell>
  );
}
