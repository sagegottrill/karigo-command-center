import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, formatNairaFull, inventoryService, procurementService } from "@/lib/fleetopsx/services";
import type { InventoryItem, ProcurementRequest, TruckHead } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";

/**
 * The Transport Manager's Part Inventory:
 *
 *  - "Part Inventory" — the procurement queue awaiting his authorisation
 *    (review and approve / reject, each decision wired to the procurement
 *    ledger and back to the requisition it grew out of).
 *  - "Parts Inventory Listing" — the store shelf as card tiles: quantity,
 *    unit price, stock band filter (All / Low / Out), a category sort, and
 *    pages with an export at the foot — the same read the department works,
 *    minus the pen.
 *
 * The TM authorises the buys; the store keeps the shelf. Two views, one page.
 */
export const Route = createFileRoute("/workspace/app/part-inventory")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // The Transport Manager's Part Inventory desk; Platform Admin has the same
    // authority (the role pair everywhere the TM decides is enforced).
    if (!authService.getRoles().some((r: string) => ["Transport Manager", "Platform Admin"].includes(r))) {
      window.location.assign("/workspace/app/unauthorized");
    }
  },
  component: PartInventoryPage,
});

/** A PO row the design reads, with the truck line it was raised against. */
type ProcurementRow = ProcurementRequest & { truckReg?: string | null; vendor?: string | null; unitPrice?: number | null };

const PART_PAGE_SIZE = 12;
const PO_PAGE_SIZE = 9;

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

function PartInventoryPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"procurement" | "listing">("procurement");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<ProcurementRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Listing view state
  const [query, setQuery] = useState("");
  const [stockTab, setStockTab] = useState<"All" | "Low Stock" | "Out of Stock">("All");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);

  // Procurement view state
  const [poQuery, setPoQuery] = useState("");
  const [poPage, setPoPage] = useState(0);

  const load = useCallback(async () => {
    const [store, poes] = await Promise.all([
      inventoryService.list().catch(() => [] as InventoryItem[]),
      (async () => {
        const rows = await procurementService.list().catch(() => [] as ProcurementRequest[]);
        return Array.isArray(rows) ? rows : (rows as any)?.data ?? [];
      })(),
    ]);
    setItems(store);
    setOrders(((poes as ProcurementRow[]) || []).filter((p) => p?.kind !== "Fuel"));
  }, []);

  useEffect(() => {
    void load()
      .catch(() => toast.error("Failed to load the inventory"))
      .finally(() => setLoading(false));
  }, [load]);

  /* --------------------------------------------------------- LISTING VIEW */

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category).filter(Boolean));
    return ["", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const stockCounts = useMemo(
    () => ({
      All: items.length,
      "Low Stock": items.filter((i) => i.status === "Low Stock").length,
      "Out of Stock": items.filter((i) => i.status === "Out of Stock").length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => stockTab === "All" || i.status === stockTab)
      .filter((i) => !category || i.category === category)
      .filter((i) => !q || `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(q));
  }, [items, query, stockTab, category]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PART_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredItems.slice(currentPage * PART_PAGE_SIZE, currentPage * PART_PAGE_SIZE + PART_PAGE_SIZE);

  const exportListing = () =>
    downloadCsv(
      "parts_inventory_listing.csv",
      [
        ["Part", "SKU", "Category", "Quantity", "Unit Price", "Status"],
        ...filteredItems.map((i) => [i.name, i.sku, i.category, String(i.stock), String(i.unitCost), i.status]),
      ],
    );

  /* ---------------------------------------------------- PROCUREMENT VIEW */

  const pendingOrders = useMemo(() => {
    const q = poQuery.trim().toLowerCase();
    return orders
      .filter((p) => ["Requested", "Sourcing"].includes(String(p.status)))
      .filter((p) => !q || `${p.partName} ${p.truckReg ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [orders, poQuery]);

  const poPageCount = Math.max(1, Math.ceil(pendingOrders.length / PO_PAGE_SIZE));
  const poCurrent = Math.min(poPage, poPageCount - 1);
  const poRows = pendingOrders.slice(poCurrent * PO_PAGE_SIZE, poCurrent * PO_PAGE_SIZE + PO_PAGE_SIZE);

  const exportPoes = () =>
    downloadCsv(
      "parts_procurement_requests.csv",
      [
        ["Date", "PO", "Part", "Qty", "Unit Price", "Linked to", "Status"],
        ...pendingOrders.map((p) => [
          String(p.date).slice(0, 10),
          `PO-${p.id.slice(0, 6).toUpperCase()}`,
          p.partName,
          String(p.quantity),
          String(p.unitPrice ?? ""),
          p.linkedId,
          p.status,
        ]),
      ],
    );

  const decidePo = async (order: ProcurementRow, approve: boolean) => {
    if (!approve) {
      const reason = (window.prompt(`Why is PO-${order.id.slice(0, 6).toUpperCase()} for ${order.partName} rejected? Attached to the record.`) ?? "").trim();
      if (!reason) return;
      setSavingId(order.id);
      try {
        // Rejected PO frees the requisition line it grew from so the workshop
        // sees its ask was refused, with the reason the TM gave.
        await procurementService.update(order.id, { status: "Rejected", vendor: reason });
        toast.success(`PO-${order.id.slice(0, 6).toUpperCase()} rejected.`);
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
      toast.success(`PO-${order.id.slice(0, 6).toUpperCase()} approved — procurement is now sourcing it.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The approval was not saved.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-[#F1F2F4] p-[30px]">
        <FigmaLoadingState label="Loading part inventory…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:p-[30px] md:pb-[30px]">
      {view === "procurement" ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Part Inventory</h2>
              <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
                Review and authorize parts procurement request from inventory department.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView("listing")}
              className="h-10 rounded border border-[#E2E5E9] bg-white px-4 text-[14px] font-medium tracking-[0.4px] text-[#8E95A1] hover:text-[#1B2432]"
            >
              Parts Inventory Listing
            </button>
          </div>

          <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E5E9] pb-5">
              <div className="flex items-center gap-3">
                <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                  Parts Procurement Requests
                </h3>
                <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
                  {pendingOrders.length}
                </span>
              </div>
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
            </div>

            {poRows.length === 0 ? (
              <FigmaEmptyState
                title="No procurement request awaits your approval"
                body="When the store cannot cover a parts request, its PO lands here for your authorisation."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {poRows.map((order) => {
                  const lines = formatDateLines(order.date);
                  const po = `PO-${order.id.slice(0, 6).toUpperCase()}`;
                  const busy = savingId === order.id;
                  const decided = !["Requested", "Sourcing"].includes(String(order.status));
                  const unitPrice = Number(order.unitPrice ?? 0);
                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-[#FCFCFD] p-4",
                        busy && "opacity-60",
                      )}
                    >
                      <div>
                        <p className="flex items-center gap-2 text-[14px] font-medium text-[#1B2432]">
                          {lines.date} <span className="size-1.5 rounded-full bg-[#1B2432]" /> {po}
                        </p>
                        <p className="mt-1 text-[13px] text-[#5C6470]">
                          Requested by: <span className="text-[#344256]">{order.vendor || "Inventory"}</span>
                        </p>
                      </div>
                      <div className="rounded-[6px] border border-[#E2E5E9] bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                          Procurement note:
                        </p>
                        <p className="text-[13px] text-[#1B2432]">
                          {order.linkedId && order.truckReg
                            ? `${order.partName} — ${order.truckReg}`
                            : order.partName}
                        </p>
                      </div>
                      <div className="overflow-hidden rounded-[6px] border border-[#E2E5E9]">
                        <div className="grid grid-cols-[1fr_64px_90px] items-center bg-[#F7F8FA] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                          <span>Parts details</span>
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
                      <div className="mt-auto grid grid-cols-2 gap-2">
                        {decided ? (
                          <div className="col-span-2 rounded bg-[#F1F2F4] px-3 py-1.5 text-center text-[12px] font-medium text-[#5C6470]">
                            {order.status} — no action left on this desk
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePo(order, false)}
                              className="h-9 rounded bg-[#ED351D] text-[13px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void decidePo(order, true)}
                              className="h-9 rounded bg-[#2ECC71] text-[13px] font-medium text-white hover:bg-[#28b564] disabled:opacity-60"
                            >
                              Review and Approve
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
                {pendingOrders.length === 0 ? 0 : poCurrent * PO_PAGE_SIZE + 1} -{" "}
                {Math.min(pendingOrders.length, poCurrent * PO_PAGE_SIZE + poRows.length)} of{" "}
                {pendingOrders.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={poCurrent === 0}
                  onClick={() => setPoPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={poCurrent >= poPageCount - 1}
                  onClick={() => setPoPage((p) => Math.min(poPageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  onClick={exportPoes}
                  className="ml-2 flex h-10 items-center gap-2 rounded bg-[#1B2432] px-4 text-[13px] font-medium text-white hover:bg-[#2a3547]"
                >
                  <Download className="size-4" />
                  Export CVS
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex w-full items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/workspace/app/part-inventory" })}
              className="grid size-9 place-items-center rounded-full border border-transparent text-[#1B2432] hover:bg-[#E4E6EA]"
              aria-label="Back to procurement queue"
            >
              <ArrowLeft className="size-5" />
            </button>
          </div>

          <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E5E9] pb-5">
              <div className="flex items-center gap-3">
                <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                  Parts Inventory Listing
                </h3>
                <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(0);
                  }}
                  aria-label="Sort by category"
                  className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#1B2432]"
                >
                  <option value="">Sort by Category</option>
                  <option value="-">-</option>
                  {categories.slice(1).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[#F7F8FA] px-1">
                  {(["All", "Low Stock", "Out of Stock"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setStockTab(t);
                        setPage(0);
                      }}
                      className={cn(
                        "h-8 rounded px-3 text-[13px] font-medium",
                        stockTab === t ? "bg-white text-[#1B2432] shadow-sm" : "text-[#8E95A1] hover:text-[#344256]",
                      )}
                    >
                      {t} ({stockCounts[t]})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {pageRows.length === 0 ? (
              <FigmaEmptyState
                title={items.length === 0 ? "The store is empty" : "Nothing matches"}
                body={
                  items.length === 0
                    ? "Parts added at the store appear here as tiles."
                    : "No part matches this filter, category and search."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageRows.map((item) => {
                  const band =
                    item.status === "Out of Stock" ? "Out of Stock" : item.status === "Low Stock" ? "Low Stock" : null;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-[10px] border border-[#E2E5E9] bg-white p-3 shadow-[0px_1px_3px_rgba(12,12,13,0.04)]"
                    >
                      <div className="rounded-[6px] bg-[#F1F2F4] px-3 py-2.5">
                        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-[#1B2432]">
                          {item.sku}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-[#5C6470]">{item.name}</p>
                        {item.category ? (
                          <p className="mt-0.5 text-[11px] text-[#8E95A1]">{item.category}</p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 items-center rounded-[6px] border border-[#E2E5E9] px-3 py-2">
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
                            Quantity
                          </span>
                          <span
                            className={cn(
                              "w-fit rounded border px-2 font-semibold tabular-nums text-[13px]",
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
                        <span className="flex flex-col items-end gap-0.5 self-start">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
                            Unit Price
                          </span>
                          <span className="text-[13px] font-semibold text-[#1B2432]">
                            {formatNairaFull(item.unitCost)}
                          </span>
                          {band ? (
                            <span
                              className={cn(
                                "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                band === "Out of Stock"
                                  ? "bg-[#FFE9E6] text-[#ED351D]"
                                  : "bg-[#FFF4E0] text-[#B26A00]",
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
                {filteredItems.length === 0 ? 0 : currentPage * PART_PAGE_SIZE + 1} -{" "}
                {Math.min(filteredItems.length, currentPage * PART_PAGE_SIZE + pageRows.length)} of{" "}
                {filteredItems.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  onClick={exportListing}
                  className="ml-2 flex h-10 items-center gap-2 rounded bg-[#1B2432] px-4 text-[13px] font-medium text-white hover:bg-[#2a3547]"
                >
                  <Download className="size-4" />
                  Export CVS
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* hidden affordance: keyboard users jump straight to the listing */}
      <button
        type="button"
        onClick={() => setView(view === "listing" ? "procurement" : "listing")}
        className="sr-only"
        aria-label="Toggle between procurement and listing view"
      >
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
