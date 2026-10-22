import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Droplet,
  Package,
  Printer,
  Search,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  authService,
  formatNairaFull,
  inventoryService,
  procurementService,
} from "@/lib/fleetopsx/services";
import { asList, mapProcurement } from "@/lib/fleetopsx/live-api";import type { InventoryItem, ProcurementRequest } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * The Transport Manager's Store Inventory — the approved Figma design:
 *
 *  - "Store Inventory" (default) — the Requests Listing: every procurement
 *    request awaiting his authorisation, tabbed by what the buy is for
 *    (Parts / Lubricants / Tyre & Rims), each card carrying its procurement
 *    note, quantity, price and the Reject Request / Authorize Approval
 *    actions — plus a per-PO print sheet.
 *  - "Parts Inventory Listing" — the store shelf as card tiles under the same
 *    three families, with the All Categories and All Stock Levels filters.
 *
 * Both views carry the four valuation tiles (Total Store Valuation,
 * Lubricants & Oils, Spare Parts, Tyres & Rims) — PRD §4's "exact financial
 * value tied up in the yard" on one strip.
 *
 * The three families are derived from the store, not typed by hand: a PO is
 * Lubricants when it is a tank-restock fuel PO, and otherwise inherits the
 * family of the store line it names (tyre/rim → Tyre & Rims, lubricant
 * product — OIL-GRS-206, greases, coolants — → Lubricants, the rest → Parts).
 * The same rule sorts the shelf, so the tabs stay honest as intake arrives.
 */
export const Route = createFileRoute("/workspace/app/part-inventory")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // The Transport Manager's Store Inventory desk; Platform Admin has the same
    // authority (the role pair everywhere the TM decides is enforced).
    if (!authService.getRoles().some((r: string) => ["Transport Manager", "Platform Admin"].includes(r))) {
      window.location.assign("/workspace/app/unauthorized");
    }
  },
  component: PartInventoryPage,
});

/** A PO row the design reads, plus the fields the backend writes beside it. */
type ProcurementRow = ProcurementRequest & {
  truckReg?: string | null;
  vendor?: string | null;
};

/** The three families the Figma tabs name. */
type Tab = "parts" | "lubricants" | "tyres";

const TAB_LABEL: Record<Tab, string> = {
  parts: "Parts",
  lubricants: "Lubricants",
  tyres: "Tyre & Rims",
};

const LISTING_TAB_LABEL: Record<Tab, string> = {
  parts: "Spare Parts",
  lubricants: "Lubricants",
  tyres: "Tyres & Rims",
};

/** The details-table caption inside one request card, per tab. */
const DETAILS_LABEL: Record<Tab, string> = {
  parts: "Parts details",
  lubricants: "Lubricant details",
  tyres: "Tyre & Rims details",
};

/* ------------------------------------------------------------ classification */

const TYRE_RX = /tyre|tire|\brim/i;
const LUBE_SKU_RX = /^(oil|grs|grease|lub|lube|hyd|coolant|atf|ep2|ep 2|2t|4t|sae)/i;
const LUBE_TEXT_RX = /lubricant|grease|coolant|hydraulic|engine oil|gear oil|transmission oil|brake oil/i;

/** The family a shelf line belongs to — it decides both tab and tile. */
function classOfItem(item: { sku: string; name: string; category: string }): Tab {
  const haystack = `${item.category} ${item.name} ${item.sku}`;
  if (TYRE_RX.test(haystack)) return "tyres";
  if (LUBE_SKU_RX.test(item.sku) || LUBE_TEXT_RX.test(`${item.category} ${item.name}`)) return "lubricants";
  return "parts";
}

/** The store line a PO names — exact SKU, exact name, then containment. */
function itemOfPo(po: ProcurementRow, items: InventoryItem[]): InventoryItem | undefined {
  const name = (po.partName ?? "").trim().toLowerCase();
  if (!name) return undefined;
  return (
    items.find((i) => i.sku && name === i.sku.toLowerCase()) ??
    items.find((i) => name === i.name.trim().toLowerCase()) ??
    items.find((i) => i.sku && name.includes(i.sku.toLowerCase())) ??
    items.find((i) => {
      const n = i.name.trim().toLowerCase();
      return n.length > 3 && (name.includes(n) || n.includes(name));
    })
  );
}

function classOfPo(po: ProcurementRow, items: InventoryItem[]): Tab {
  // Fuel POs are the tank's restock buys — diesel and gas are the lubricant
  // module's own stock, so they bill under Lubricants like the design's tab.
  if (po.kind === "Fuel") return "lubricants";
  const item = itemOfPo(po, items);
  return item ? classOfItem(item) : "parts";
}

const REQ_PAGE_SIZE = 9;
const LIST_PAGE_SIZE = 12;

function toCsv(rows: string[][]) {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** One metric tile of the strip both views share. */
function MetricTile({
  label,
  value,
  caption,
  tone,
  icon,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "green" | "orange" | "blue" | "slate";
  icon: ReactNode;
}) {
  const chip =
    tone === "green"
      ? "bg-[#E8F6EC] text-[#2ECC71]"
      : tone === "orange"
        ? "bg-[#FFF2E2] text-[#F99E1F]"
        : tone === "blue"
          ? "bg-[#E7EDFB] text-[#2F6BD8]"
          : "bg-[#EDEFF2] text-[#627084]";
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#E2E5E9] bg-white px-4 py-3.5 shadow-[0px_1px_2px_rgba(12,12,13,0.03)]">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">{label}</p>
        <p className="mt-1 truncate text-[20px] font-semibold leading-7 text-[#1B2432]">{value}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#8E95A1]">{caption}</p>
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-[8px]", chip)}>{icon}</span>
    </div>
  );
}

function quantityWord(n: number) {
  return n.toLocaleString("en-NG");
}

function PartInventoryPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"procurement" | "listing">("procurement");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<ProcurementRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Requests view state
  const [reqTab, setReqTab] = useState<Tab>("parts");
  const [poQuery, setPoQuery] = useState("");
  const [poPage, setPoPage] = useState(0);

  // Listing view state
  const [listTab, setListTab] = useState<Tab>("parts");
  const [category, setCategory] = useState("");
  const [stockLevel, setStockLevel] = useState<"all" | "low" | "normal" | "zero">("all");
  const [page, setPage] = useState(0);

  const load = async () => {
    const [store, rawPoes] = await Promise.all([
      inventoryService.list().catch(() => [] as InventoryItem[]),
      procurementService
        .list()
        .then((res) => asList(res) as Record<string, unknown>[])
        .catch(() => []),
    ]);
    setItems(store);
    // Normalised rows keep the review fields the API writes beside a PO:
    // vendor (also the rejection reason), kind and the agreed unit price.
    const rows: ProcurementRow[] = rawPoes.map((r) => ({
      ...mapProcurement(r),
      vendor: r.vendor ? String(r.vendor) : null,
      kind: r.kind === "Fuel" ? "Fuel" : "Part",
      unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
    }));
    setOrders(rows.filter((p) => ["Part", "Fuel"].includes(String(p.kind))));
  };

  useEffect(() => {
    void load()
      .catch(() => toast.error("Failed to load the inventory"))
      .finally(() => setLoading(false));
  }, []);

  /* ------------------------------------------------------- shared metrics */

  const metrics = useMemo(() => {
    const pick = (t: Tab) => items.filter((i) => classOfItem(i) === t);
    const value = (list: InventoryItem[]) => list.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.unitCost ?? 0), 0);
    const units = (list: InventoryItem[]) => list.reduce((s, i) => s + Number(i.stock ?? 0), 0);
    const lube = pick("lubricants");
    const tyres = pick("tyres");
    const parts = pick("parts");
    return {
      total: value(items),
      lines: items.length,
      lube: {
        units: units(lube),
        value: value(lube),
        categories: new Set(lube.map((i) => i.category).filter(Boolean)).size,
      },
      parts: {
        units: units(parts),
        categories: new Set(parts.map((i) => i.category).filter(Boolean)).size,
      },
      tyres: { units: units(tyres), value: value(tyres) },
    };
  }, [items]);

  /* ----------------------------------------------------- REQUESTS LISTING */

  const isOpen = (p: ProcurementRow) => !["Sourcing", "Procured", "Rejected"].includes(String(p.status));

  const ordersByTab = useMemo(() => {
    const grouped: Record<Tab, ProcurementRow[]> = { parts: [], lubricants: [], tyres: [] };
    for (const p of orders) grouped[classOfPo(p, items)].push(p);
    return grouped;
  }, [orders, items]);

  const pendingOrders = useMemo(() => {
    const q = poQuery.trim().toLowerCase();
    return ordersByTab[reqTab]
      .filter(isOpen)
      .filter((p) => !q || `${p.partName} ${p.truckReg ?? ""} ${p.vendor ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersByTab, reqTab, poQuery]);

  const openCounts = useMemo(
    () => ({
      parts: ordersByTab.parts.filter(isOpen).length,
      lubricants: ordersByTab.lubricants.filter(isOpen).length,
      tyres: ordersByTab.tyres.filter(isOpen).length,
    }),
    [ordersByTab],
  );

  const poPageCount = Math.max(1, Math.ceil(pendingOrders.length / REQ_PAGE_SIZE));
  const poCurrent = Math.min(poPage, poPageCount - 1);
  const poRows = pendingOrders.slice(poCurrent * REQ_PAGE_SIZE, poCurrent * REQ_PAGE_SIZE + REQ_PAGE_SIZE);

  const poesCsv = () =>
    toCsv([
      ["Date", "PO", "Family", "Requested by", "Part", "Qty", "Unit Price", "Status"],
      ...pendingOrders.map((p) => [
        String(p.date).slice(0, 10),
        `PO-${p.id.slice(0, 6).toUpperCase()}`,
        TAB_LABEL[classOfPo(p, items)],
        p.vendor || "Inventory",
        p.partName,
        String(p.quantity),
        String(p.unitPrice ?? ""),
        p.status,
      ]),
    ]);

  /** One PO's printable sheet — the printer button on the card. */
  const printPo = (order: ProcurementRow) => {
    const win = window.open("", "_blank", "width=760,height=680");
    if (!win) {
      toast.error("The print sheet could not be opened — allow pop-ups.");
      return;
    }
    const po = `PO-${order.id.slice(0, 6).toUpperCase()}`;
    win.document.write(`<!doctype html><html><head><title>${po}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1B2432}
      h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
      td,th{border:1px solid #E2E5E9;padding:8px;text-align:left;font-size:14px}th{background:#F7F8FA}</style>
      </head><body><h1>${po} — ${TAB_LABEL[classOfPo(order, items)]}</h1>
      <p>Raised ${String(order.date).slice(0, 10)} &middot; requested by ${order.vendor || "Inventory"}</p>
      <table><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Status</th></tr>
      <tr><td>${order.partName}${order.truckReg ? ` — ${order.truckReg}` : ""}</td>
      <td>${order.quantity}</td><td>${order.unitPrice ? formatNairaFull(Number(order.unitPrice)) : "&mdash;"}</td><td>${order.status}</td></tr></table>
      <p><small>Transport Manager's review sheet &mdash; FleetOpsX</small></p>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const decidePo = async (order: ProcurementRow, approve: boolean) => {
    const po = `PO-${order.id.slice(0, 6).toUpperCase()}`;
    if (!approve) {
      const reason = (window.prompt(`Why is ${po} for ${order.partName} rejected? Attached to the record.`) ?? "").trim();
      if (!reason) return;
      setSavingId(order.id);
      try {
        // Rejected PO frees the requisition line it grew from so the workshop
        // sees its ask was refused, with the reason the TM gave.
        await procurementService.update(order.id, { status: "Rejected", vendor: reason });
        toast.success(`${po} rejected.`);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The rejection was not saved.");
      } finally {
        setSavingId(null);
      }
      return;
    }
    setSavingId(order.id);
    try {
      await procurementService.update(order.id, { status: "Sourcing" });
      toast.success(`${po} approved — procurement is now sourcing it.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The approval was not saved.");
    } finally {
      setSavingId(null);
    }
  };

  /* ------------------------------------------------- PARTS INVENTORY LIST */

  const listingItems = useMemo(() => items.filter((i) => classOfItem(i) === listTab), [items, listTab]);

  const categories = useMemo(
    () => Array.from(new Set(listingItems.map((i) => i.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [listingItems],
  );

  const listingCounts = useMemo(
    () => ({
      parts: items.filter((i) => classOfItem(i) === "parts").length,
      lubricants: items.filter((i) => classOfItem(i) === "lubricants").length,
      tyres: items.filter((i) => classOfItem(i) === "tyres").length,
    }),
    [items],
  );

  const filteredItems = useMemo(
    () =>
      listingItems
        .filter(
          (i) =>
            stockLevel === "all" ||
            (stockLevel === "low" && i.status === "Low Stock") ||
            (stockLevel === "normal" && i.status === "In Stock") ||
            (stockLevel === "zero" && i.status === "Out of Stock"),
        )
        .filter((i) => !category || i.category === category),
    [listingItems, stockLevel, category],
  );

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / LIST_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredItems.slice(currentPage * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE);

  /** The complete stock filter as the PRD export engine reads it. */
  const listingCsv = () =>
    toCsv([
      ["Part", "SKU", "Family", "Category", "Quantity", "Unit Price", "Total Value", "Status"],
      ...filteredItems.map((i) => [
        i.name,
        i.sku,
        LISTING_TAB_LABEL[classOfItem(i)],
        i.category,
        String(i.stock),
        String(i.unitCost),
        String(Number(i.stock) * Number(i.unitCost)),
        i.status,
      ]),
    ]);

  const listingXlsx = () => ({
    headers: ["Part", "SKU", "Family", "Category", "Quantity", "Unit Price (\u20A6)", "Total Value (\u20A6)", "Status"],
    rows: filteredItems.map((i) => [
      i.name,
      i.sku,
      LISTING_TAB_LABEL[classOfItem(i)],
      i.category,
      i.stock,
      i.unitCost,
      Number(i.stock) * Number(i.unitCost),
      i.status,
    ]),
    sheet: "Store Inventory Listing",
  });

  // A tab switch resets its filters and pages — each family stands alone.
  useEffect(() => {
    setCategory("");
    setStockLevel("all");
    setPage(0);
  }, [listTab, reqTab]);

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-[#F1F2F4] p-[30px]">
        <FigmaLoadingState label="Loading store inventory…" />
      </div>
    );
  }

  /* The valuation strip both screens share — PRD §4's exact numbers above
     every read of the store. */
  const tiles = [
    {
      label: "Total Store Valuation",
      value: formatNairaFull(metrics.total),
      caption: `Across ${metrics.lines} stock line${metrics.lines === 1 ? "" : "s"}`,
      tone: "green" as const,
      icon: <CircleDollarSign className="size-4" strokeWidth={2} />,
    },
    {
      label: "Lubricants & Oils",
      value: `${quantityWord(metrics.lube.units)} Units`,
      caption: `${formatNairaFull(metrics.lube.value)} across ${metrics.lube.categories || 0} categories`,
      tone: "orange" as const,
      icon: <Droplet className="size-4" strokeWidth={2} />,
    },
    {
      label: "Spare Parts",
      value: `${quantityWord(metrics.parts.units)} Units`,
      caption: `${metrics.parts.categories} SKU categories`,
      tone: "blue" as const,
      icon: <Package className="size-4" strokeWidth={2} />,
    },
    {
      label: "Tyres & Rims",
      value: `${quantityWord(metrics.tyres.units)} Units`,
      caption: `${formatNairaFull(metrics.tyres.value)} cost valuation`,
      tone: "slate" as const,
      icon: <Truck className="size-4" strokeWidth={2} />,
    },
  ];

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:p-[30px] md:pb-[30px]">
      {view === "listing" ? (
        <div className="flex w-full items-center">
          <button
            type="button"
            onClick={() => setView("procurement")}
            className="grid size-9 place-items-center rounded text-[#1B2432] hover:bg-[#E4E6EA]"
            aria-label="Back to requests listing"
          >
            <ArrowLeft className="size-5" />
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <MetricTile key={t.label} {...t} />
        ))}
      </div>

      {view === "procurement" ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Store Inventory</h2>
              <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
                Review and authorize procurement request from inventory department.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView("listing")}
              className="h-10 rounded border border-[#E2E5E9] bg-white px-4 text-[14px] font-medium tracking-[0.4px] text-[#8E95A1] hover:text-[#1B2432]"
            >
              View Inventory Listing
            </button>
          </div>

          <div className="w-full rounded-xl border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5E9] pb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Requests Listing</h3>
                <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
                  {pendingOrders.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-[340px]">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
                  <input
                    value={poQuery}
                    onChange={(e) => {
                      setPoQuery(e.target.value);
                      setPoPage(0);
                    }}
                    placeholder="Search"
                    className="h-10 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
                  />
                </div>
                <div className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[#F7F8FA] px-1">
                  {(["parts", "lubricants", "tyres"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setReqTab(t);
                        setPoPage(0);
                      }}
                      className={cn(
                        "h-8 rounded px-3 text-[13px] font-medium",
                        reqTab === t ? "bg-white text-[#1B2432] shadow-sm" : "text-[#8E95A1] hover:text-[#344256]",
                      )}
                    >
                      {TAB_LABEL[t]} ({openCounts[t]})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {poRows.length === 0 ? (
              <FigmaEmptyState
                title={`No ${TAB_LABEL[reqTab] === "Tyre & Rims" ? "tyre & rim" : TAB_LABEL[reqTab].toLowerCase()} request awaits your approval`}
                body="When a parts request cannot be covered in store, its PO lands here for your authorisation."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {poRows.map((order) => {
                  const po = `PO-${order.id.slice(0, 6).toUpperCase()}`;
                  const busy = savingId === order.id;
                  const open = isOpen(order);
                  const unitPrice = Number(order.unitPrice ?? 0);
                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-xl border border-[#E2E5E9] bg-white p-4 shadow-[0px_1px_3px_rgba(12,12,13,0.04)]",
                        busy && "opacity-60",
                      )}
                    >
                      <div>
                        <p className="flex items-center gap-2 text-[14px] font-medium text-[#1B2432]">
                          {String(order.date).slice(0, 10)} <span className="size-1.5 rounded-full bg-[#1B2432]" /> {po}
                        </p>
                        <p className="mt-1 text-[13px] text-[#5C6470]">
                          Requested by: <span className="text-[#344256]">{order.vendor || "Inventory"}</span>
                        </p>
                      </div>
                      <div className="rounded-[6px] border border-[#E2E5E9] bg-[#FCFCFD] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">Procurement note:</p>
                        <p className="text-[13px] text-[#1B2432]">
                          {order.truckReg ? `${order.partName} — ${order.truckReg}` : order.partName}
                        </p>
                      </div>
                      <div className="overflow-hidden rounded-[6px] border border-[#E2E5E9]">
                        <div className="grid grid-cols-[1fr_64px_90px] items-center bg-[#F7F8FA] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                          <span>{DETAILS_LABEL[classOfPo(order, items)]}</span>
                          <span>Quantity</span>
                          <span className="text-right">Price</span>
                        </div>
                        <div className="grid grid-cols-[1fr_64px_90px] items-center border-t border-[#E2E5E9] px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-[#1B2432]">{order.partName}</span>
                            <span className="block text-[11.5px] text-[#8E95A1]">{order.truckReg || "\u2014"}</span>
                          </span>
                          <span className="grid h-7 place-items-center rounded border border-[#E2E5E9] bg-[#F1F2F4] text-[13px] font-semibold tabular-nums">
                            {order.quantity}
                          </span>
                          <span className="text-right text-[13px] font-semibold text-[#1B2432]">
                            {unitPrice ? formatNairaFull(unitPrice) : "\u2014"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center gap-2">
                        {open ? (
                          <>
                            <button
                              type="button"
                              onClick={() => printPo(order)}
                              className="grid size-9 shrink-0 place-items-center rounded border border-[#E2E5E9] text-[#627084] hover:text-[#1B2432] disabled:opacity-60"
                              disabled={busy}
                              aria-label={`Print ${po}`}
                            >
                              <Printer className="size-4" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePo(order, false)}
                              className="h-9 flex-1 rounded border border-[#ED351D] bg-white text-[13px] font-medium text-[#ED351D] hover:bg-[#FFE9E6] disabled:opacity-60"
                            >
                              Reject Request
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePo(order, true)}
                              className="h-9 flex-[2] rounded bg-[#2ECC71] text-[13px] font-medium text-white hover:bg-[#28b564] disabled:opacity-60"
                            >
                              Authorize Approval
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => printPo(order)}
                              className="grid size-9 shrink-0 place-items-center rounded border border-[#E2E5E9] text-[#627084] hover:text-[#1B2432]"
                              aria-label={`Print ${po}`}
                            >
                              <Printer className="size-4" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              disabled
                              className="h-9 flex-1 rounded bg-[#F1F2F4] text-[13px] font-medium text-[#8E95A1]"
                            >
                              Authorize Approval
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E5E9] pt-4">
              <span className="text-[13px] text-[#5C6470]">
                {pendingOrders.length === 0 ? 0 : poCurrent * REQ_PAGE_SIZE + 1} -{" "}
                {Math.min(pendingOrders.length, poCurrent * REQ_PAGE_SIZE + poRows.length)} of {pendingOrders.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={poCurrent === 0}
                  onClick={() => setPoPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={poCurrent >= poPageCount - 1}
                  onClick={() => setPoPage((p) => Math.min(poPageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
                <ExportMenu
                  label="Export CSV"
                  rows={pendingOrders.length}
                  title="Requests Listing"
                  fileNameBase="store_requests_listing"
                  csv={poesCsv}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="w-full rounded-xl border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5E9] pb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Parts Inventory Listing</h3>
              <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
                {listingItems.length}
              </span>
            </div>
            <div className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[#F7F8FA] px-1">
              {(["parts", "lubricants", "tyres"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setListTab(t)}
                  className={cn(
                    "h-8 rounded px-3 text-[13px] font-medium",
                    listTab === t ? "bg-white text-[#1B2432] shadow-sm" : "text-[#8E95A1] hover:text-[#344256]",
                  )}
                >
                  {LISTING_TAB_LABEL[t]} ({listingCounts[t]})
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5 flex max-w-fit gap-2">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
              aria-label="All Categories"
              className="h-10 min-w-[180px] rounded-lg border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium text-[#1B2432] outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={stockLevel}
              onChange={(e) => {
                setStockLevel(e.target.value as typeof stockLevel);
                setPage(0);
              }}
              aria-label="All Stock Levels"
              className="h-10 min-w-[180px] rounded-lg border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium text-[#1B2432] outline-none"
            >
              <option value="all">All Stock Levels</option>
              <option value="low">Low Stock Alert</option>
              <option value="normal">Normal Buffer</option>
              <option value="zero">Zero Stock</option>
            </select>
          </div>

          {pageRows.length === 0 ? (
            <FigmaEmptyState
              title={listingItems.length === 0 ? `No ${LISTING_TAB_LABEL[listTab].toLowerCase()} on the shelf` : "Nothing matches"}
              body={
                listingItems.length === 0
                  ? "Store intake lands here as tiles — imported ledgers and manual entries alike."
                  : "No line matches this family, category and stock level."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageRows.map((item) => {
                const band = item.status === "Out of Stock" ? "Out of Stock" : item.status === "Low Stock" ? "Low Stock" : null;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "grid gap-3 rounded-xl border bg-white p-3 shadow-[0px_1px_3px_rgba(12,12,13,0.04)]",
                      band === "Out of Stock" ? "border-[#F3A69A]" : band === "Low Stock" ? "border-[#F8CE8C]" : "border-[#E2E5E9]",
                    )}
                  >
                    <div className="rounded-[8px] border border-[#E2E5E9] bg-[#F7F8FA] px-3 py-2.5">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold tracking-[0.4px] text-[#1B2432]">{item.sku}</span>
                        <span className="rounded border border-[#D7DBE1] bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#627084]">
                          {item.category || "General"}
                        </span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-4 text-[#5C6470]">{item.name}</p>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-[8px] border border-[#E2E5E9] px-3 py-2.5">
                      <span className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">Unit Quantity</span>
                        <span
                          className={cn(
                            "w-fit rounded border bg-white px-2 py-0.5 text-[13px] font-semibold tabular-nums",
                            item.status === "Out of Stock"
                              ? "border-[#F3A69A] text-[#ED351D]"
                              : item.status === "Low Stock"
                                ? "border-[#F99E1F] text-[#B26A00]"
                                : "border-[#E2E5E9] text-[#1B2432]",
                          )}
                        >
                          {item.stock}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">Unit Cost</span>
                        <span className="text-[13.5px] font-semibold text-[#1B2432]">{formatNairaFull(item.unitCost)}</span>
                        {band ? (
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              band === "Out of Stock" ? "bg-[#FFE9E6] text-[#ED351D]" : "bg-[#FFF4E0] text-[#B26A00]",
                            )}
                          >
                            {band}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E5E9] pt-4">
            <span className="text-[13px] text-[#5C6470]">
              {filteredItems.length === 0 ? 0 : currentPage * LIST_PAGE_SIZE + 1} -{" "}
              {Math.min(filteredItems.length, currentPage * LIST_PAGE_SIZE + pageRows.length)} of {filteredItems.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="grid size-8 place-items-center rounded border border-[#627084] disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-[18px] text-[#627084]" />
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="grid size-8 place-items-center rounded border border-[#627084] disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="size-[18px] text-[#627084]" />
              </button>
              <ExportMenu
                label="Export CSV"
                rows={filteredItems.length}
                title="Parts Inventory Listing"
                fileNameBase="store_inventory_listing"
                csv={listingCsv}
                xlsx={listingXlsx}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
