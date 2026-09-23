import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Package, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RaisePartsRequestModal } from "@/components/fleetopsx/raise-parts-request-modal";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import {
  ENGINEERING_ACCESS_ROLES,
  rolesCanWorkOnTrucks,
  truckLabel,
} from "@/lib/fleetopsx/engineering-helpers";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  authService,
  engineeringService,
  fleetService,
  formatNairaFull,
  inventoryService,
} from "@/lib/fleetopsx/services";
import type {
  InventoryItem,
  InventoryMovement,
  InventoryRequisition,
  TruckHead,
  WorkOrder,
} from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/parts")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: PartsAndStore,
});

const STOCK_FILTERS = ["All", "In Stock", "Low Stock", "Out of Stock"] as const;
const REQUEST_FILTERS = ["All", "Pending", "Released", "Rejected"] as const;

const statusPill = (status: string) => {
  switch (status) {
    case "Out of Stock":
      return "bg-[#ED351D] text-white";
    case "Low Stock":
      return "bg-[#F99E1F] text-white";
    case "Pending":
      return "bg-[#F99E1F] text-white";
    case "Released":
      return "bg-[#34C759] text-white";
    case "Rejected":
      return "bg-[#E2E5E9] text-[#5C6470]";
    default:
      return "bg-[#34C759] text-white";
  }
};

/**
 * The store, and the parts the workshop has asked it for.
 *
 * Two halves of one loop: the request queue the Transport Manager decides on his
 * dashboard, and the shelf those requests are drawn from. The department
 * maintains the shelf and raises requests; the approval is not its to give, so
 * nothing on this page decides a request — that is what makes the TM's queue an
 * approval rather than a notification.
 */
function PartsAndStore() {
  const navigate = useNavigate();
  const [canEdit, setCanEdit] = useState(false);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [requests, setRequests] = useState<InventoryRequisition[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<(typeof STOCK_FILTERS)[number]>("All");
  const [requestFilter, setRequestFilter] = useState<(typeof REQUEST_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseJob, setRaiseJob] = useState<WorkOrder | null>(null);
  /**
   * Buying stock, and reading a line's story.
   *
   * A purchase is the only honest way stock enters the store: it moves the
   * number, re-prices the line at what was actually paid, names the vendor, and
   * writes the ledger row the Transport Manager's dashboard is built from. The
   * history is that ledger read back for one line — where every unit came from
   * and which truck took it out.
   */
  const [purchasing, setPurchasing] = useState<InventoryItem | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<Record<string, string> | null>(null);
  const [historyFor, setHistoryFor] = useState<InventoryItem | null>(null);
  const [historyRows, setHistoryRows] = useState<InventoryMovement[] | null>(null);

  useEffect(() => {
    const roles = authService.getRoles();
    setCanEdit(rolesCanWorkOnTrucks());
    if (!roles.some((r: string) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
    }
  }, [navigate]);

  const load = useCallback(() => {
    return Promise.all([
      inventoryService.list().catch(() => [] as InventoryItem[]),
      inventoryService.requisitions().catch(() => [] as InventoryRequisition[]),
      engineeringService.listWorkOrders().catch(() => [] as WorkOrder[]),
      fleetService.listHeads().catch(() => [] as TruckHead[]),
    ]).then(([store, reqs, wos, fleet]) => {
      setItems(store);
      setRequests(reqs);
      setOrders(wos);
      setHeads(fleet);
    });
  }, []);

  useEffect(() => {
    void load()
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load the store"),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const truckOf = (reg: string) => {
    const want = String(reg ?? "")
      .trim()
      .toLowerCase();
    const head = heads.find(
      (h) =>
        h.registration.trim().toLowerCase() === want ||
        (displayHeadCap(h) || h.number).trim().toLowerCase() === want,
    );
    return head ? truckLabel(head) : reg || "—";
  };

  const openJobs = useMemo(
    () => orders.filter((o) => o.status !== "Completed" && o.status !== "Cancelled"),
    [orders],
  );

  const counts = useMemo(() => {
    const outOfStock = items.filter((i) => i.status === "Out of Stock" || i.stock <= 0).length;
    const low = items.filter((i) => i.stock > 0 && i.stock <= i.reorderLevel).length;
    const value = items.reduce((total, i) => total + i.stock * i.unitCost, 0);
    const pending = requests.filter((r) => r.status === "Pending");
    return {
      lines: items.length,
      outOfStock,
      low,
      value,
      pending: pending.length,
      pendingValue: pending.reduce((total, r) => total + r.quantity * r.unitCost, 0),
    };
  }, [items, requests]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => stockFilter === "All" || i.status === stockFilter)
      .filter(
        (i) => !q || `${i.name} ${i.sku} ${i.category} ${i.location}`.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const rank = (i: InventoryItem) =>
          i.status === "Out of Stock" ? 0 : i.status === "Low Stock" ? 1 : 2;
        const byRank = rank(a) - rank(b);
        return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
      });
  }, [items, query, stockFilter]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => requestFilter === "All" || r.status === requestFilter)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [requests, requestFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredItems.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  const emptyDraft = () => ({
    name: "",
    sku: "",
    category: "General",
    unitCost: "",
    stock: "",
    reorderLevel: "",
    location: "Main Store",
    supplier: "",
  });

  const emptyPurchaseDraft = (item: InventoryItem) => ({
    qty: "",
    unitPrice: String(item.unitCost || ""),
    vendor: item.supplier || "",
    reference: "",
    note: "",
  });

  const savePurchase = async () => {
    if (!purchasing || !purchaseDraft) return;
    const qty = Math.floor(Number(purchaseDraft.qty) || 0);
    if (qty <= 0) {
      toast.error("A purchase needs a quantity.");
      return;
    }
    try {
      const updated = await inventoryService.purchase(purchasing.id, {
        qty,
        unitPrice: Number(purchaseDraft.unitPrice) || purchasing.unitCost,
        vendor: (purchaseDraft.vendor ?? "").trim(),
        reference: (purchaseDraft.reference ?? "").trim(),
        note: (purchaseDraft.note ?? "").trim(),
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      toast.success(
        `${qty} × ${updated.name} received — stock now ${updated.stock}, priced at ${formatNairaFull(updated.unitCost)}.`,
      );
      setPurchasing(null);
      setPurchaseDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The purchase was not recorded.");
    }
  };

  const openHistory = async (item: InventoryItem) => {
    setHistoryFor(item);
    setHistoryRows(null);
    try {
      const rows = await inventoryService.movements(item.id);
      setHistoryRows(rows);
    } catch {
      setHistoryRows([]);
      toast.error("The movement history could not be read.");
    }
  };

  const savePart = async () => {
    if (!draft) return;
    const part = {
      name: (draft.name ?? "").trim(),
      sku: (draft.sku ?? "").trim(),
      category: (draft.category ?? "").trim() || "General",
      unitCost: Number(draft.unitCost) || 0,
      stock: Number(draft.stock) || 0,
      reorderLevel: Number(draft.reorderLevel) || 0,
      location: (draft.location ?? "").trim() || "Main Store",
    };
    if (!part.name || !part.sku) {
      toast.error("A part needs a name and a SKU.");
      return;
    }
    try {
      if (editing) {
        const updated = await inventoryService.updateItem(editing.id, part);
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        toast.success(`${updated.name} updated.`);
      } else {
        const created = await inventoryService.createItem(part);
        setItems((prev) => [...prev, created]);
        toast.success(`${created.name} added to the store.`);
      }
      setDraft(null);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The part was not saved.");
    }
  };

  const inputClass =
    "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";

  const cell = "text-[14px] text-[#344256]";
  const quiet = "text-[14px] text-[#5C6470]";

  if (loading) {
    return (
      <>
        <DepartmentTabs department="engineering" />
        <div className="min-h-[60vh] bg-[#F1F2F4]">
          <FigmaLoadingState label="Loading the store…" />
        </div>
      </>
    );
  }

  return (
    <>
      <DepartmentTabs department="engineering" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Parts &amp; Store</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              the shelf the workshop draws from, and every part it has asked the Transport Manager
              to approve
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — Engineering &amp; Maintenance maintains the store
              </span>
            )}
          </div>
          <div className={cn("flex items-center gap-2", !canEdit && "hidden")}>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(emptyDraft());
              }}
              className="flex h-8 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              <Package className="size-4" strokeWidth={1.75} />
              Add Part
            </button>
            <button
              type="button"
              onClick={() => {
                setRaiseJob(null);
                setRaiseOpen(true);
              }}
              className="flex h-8 items-center gap-1.5 rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19]"
            >
              <Plus className="size-4" />
              Request Parts
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            { label: "Store Lines", value: counts.lines, tone: "text-[#1B2432]" },
            { label: "Out of Stock", value: counts.outOfStock, tone: "text-[#ED351D]" },
            { label: "Low Stock", value: counts.low, tone: "text-[#B26A00]" },
            { label: "Store Value", value: formatNairaFull(counts.value), tone: "text-[#1B2432]" },
            { label: "Awaiting Approval", value: counts.pending, tone: "text-[#B26A00]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                {stat.label}
              </span>
              <span className={cn("text-[20px] font-semibold leading-7", stat.tone)}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* ------------------------------------------- what the shop asked for */}
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[16px] font-medium text-[#1B2432]">Parts requested</h3>
              <p className="text-[12px] text-[#5C6470]">
                {counts.pending} awaiting the Transport Manager ·{" "}
                {formatNairaFull(counts.pendingValue)} in pending requests
              </p>
            </div>
            <div className="ml-auto">
              <FilterButton
                options={REQUEST_FILTERS}
                value={requestFilter}
                onChange={setRequestFilter}
                allLabel="All Statuses"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-[130px_180px_1fr_70px_110px_120px_140px_120px_90px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {[
                  "Date",
                  "Truck Head",
                  "Part",
                  "Qty",
                  "Unit Price",
                  "Value",
                  "Mechanic",
                  "Status",
                  "Request",
                ].map((heading) => (
                  <span
                    key={heading}
                    className="text-[13px] font-medium uppercase tracking-[0.4px] text-[#5C6470]"
                  >
                    {heading}
                  </span>
                ))}
              </div>

              {filteredRequests.length === 0 ? (
                <FigmaEmptyState
                  title="No parts request yet"
                  body={
                    canEdit
                      ? "When a job needs a part, raise it from the job on Work Orders — the Transport Manager approves it before the store releases it."
                      : "The workshop has not asked the store for a part yet."
                  }
                />
              ) : (
                filteredRequests.map((request, index) => {
                  const lines = formatDateLines(request.date);
                  const machine = displayHeadCap(
                    heads.find(
                      (h) =>
                        h.registration.trim().toLowerCase() ===
                          String(request.truckReg ?? "")
                            .trim()
                            .toLowerCase() ||
                        (displayHeadCap(h) || h.number).trim().toLowerCase() ===
                          String(request.truckReg ?? "")
                            .trim()
                            .toLowerCase(),
                    ) ?? ({} as TruckHead),
                  );
                  return (
                    <div
                      key={request.id}
                      className={cn(
                        "grid grid-cols-[130px_180px_1fr_70px_110px_120px_140px_120px_90px] items-center gap-4 py-[13px]",
                        index < filteredRequests.length - 1 && "border-b border-[#E2E5E9]",
                      )}
                    >
                      <span className="flex flex-col gap-0.5 text-[13px] leading-tight text-[#5C6470]">
                        <span>{lines.date}</span>
                        {lines.time ? <span className="text-[11px]">{lines.time}</span> : null}
                      </span>
                      <span className="flex flex-col gap-0.5 text-[14px] text-[#344256]">
                        <span>{machine || truckOf(request.truckReg)}</span>
                        <span className="text-[11px] text-[#5C6470]">
                          {request.truckReg || "—"}
                        </span>
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[14px] text-[#344256]">{request.part}</span>
                        {request.reason ? (
                          <span className="text-[11px] text-[#5C6470]">{request.reason}</span>
                        ) : null}
                      </span>
                      <span className={cell}>{request.quantity}</span>
                      <span className={quiet}>
                        {request.unitCost ? formatNairaFull(request.unitCost) : "—"}
                      </span>
                      <span className={cell}>
                        {request.quantity * request.unitCost
                          ? formatNairaFull(request.quantity * request.unitCost)
                          : "—"}
                      </span>
                      <span className={quiet}>{request.mechanic || "Unassigned"}</span>
                      <span
                        className={cn(
                          "inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                          statusPill(request.status),
                        )}
                      >
                        {request.status}
                      </span>
                      <span className="text-[12px] text-[#5C6470]">
                        {request.id.slice(0, 6).toUpperCase()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- the shelf --- */}
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                strokeWidth={1.5}
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder="Search part, SKU, category…"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={STOCK_FILTERS}
              value={stockFilter}
              onChange={(value) => {
                setStockFilter(value);
                setPage(0);
              }}
              allLabel="All Stock"
            />
            <span className="ml-auto text-[13px] text-[#5C6470]">
              {filteredItems.length} of {items.length} line{items.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-[1fr_140px_150px_120px_110px_120px_130px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {["Part", "SKU", "Category", "Unit Cost", "Stock", "Reorder At", "Status", ""].map(
                  (heading, i) => (
                    <span
                      key={`${heading}-${i}`}
                      className="text-[13px] font-medium uppercase tracking-[0.4px] text-[#5C6470]"
                    >
                      {heading}
                    </span>
                  ),
                )}
              </div>

              {pageRows.length === 0 ? (
                <FigmaEmptyState
                  title={items.length === 0 ? "The store is empty" : "Nothing matches"}
                  body={
                    items.length === 0
                      ? "Add the parts the workshop draws on most — brake pads, filters, lubricants — so a request can be priced and released against real stock."
                      : "No part matches this search and filter."
                  }
                />
              ) : (
                pageRows.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      "grid grid-cols-[1fr_140px_150px_120px_110px_120px_130px_44px] items-center gap-4 py-[13px]",
                      index < pageRows.length - 1 && "border-b border-[#E2E5E9]",
                    )}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[14px] text-[#344256]">{item.name}</span>
                      <span className="text-[11px] text-[#5C6470]">{item.location}</span>
                    </span>
                    <span className={quiet}>{item.sku}</span>
                    <span className={quiet}>{item.category}</span>
                    <span className={cell}>{formatNairaFull(item.unitCost)}</span>
                    <span className={cn(cell, item.stock <= item.reorderLevel && "text-[#B26A00]")}>
                      {item.stock}
                    </span>
                    <span className={quiet}>{item.reorderLevel}</span>
                    <span
                      className={cn(
                        "inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                        statusPill(item.status),
                      )}
                    >
                      {item.status}
                    </span>
                    {canEdit ? (
                      <RowActionMenu
                        items={[
                          {
                            label: "Edit part",
                            onSelect: () => {
                              setEditing(item);
                              setDraft({
                                name: item.name,
                                sku: item.sku,
                                category: item.category,
                                unitCost: String(item.unitCost ?? ""),
                                stock: String(item.stock ?? ""),
                                reorderLevel: String(item.reorderLevel ?? ""),
                                location: item.location,
                                supplier: item.supplier ?? "",
                              });
                            },
                          },
                          {
                            label: "Record purchase",
                            onSelect: () => {
                              setPurchasing(item);
                              setPurchaseDraft(emptyPurchaseDraft(item));
                            },
                          },
                          {
                            label: "Movement history",
                            onSelect: () => {
                              void openHistory(item);
                            },
                          },
                          {
                            label: "Request more of this",
                            onSelect: () => {
                              setRaiseJob(openJobs[0] ?? null);
                              setRaiseOpen(true);
                            },
                          },
                        ]}
                        open={menuFor === item.id}
                        onOpenChange={(open) => setMenuFor(open ? item.id : null)}
                        label={`Options for ${item.name}`}
                      />
                    ) : (
                      <span />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-[#E2E5E9] pt-4">
              <span className="text-[13px] text-[#5C6470]">
                {currentPage * PAGE_SIZE + 1} -{" "}
                {Math.min((currentPage + 1) * PAGE_SIZE, filteredItems.length)} of{" "}
                {filteredItems.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page of parts"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page of parts"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------- add / edit a part */}
      {draft ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Edit part" : "Add part"}
          onClick={() => {
            setDraft(null);
            setEditing(null);
          }}
        >
          <div
            className="flex max-h-[90vh] w-[560px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                {editing ? "Edit part" : "Add a part to the store"}
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                The unit cost prices every request raised against this line, and the stock is what
                approval draws down.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Part name", "eg: Brake pads", true],
                  ["sku", "SKU", "eg: BRK-014", true],
                  ["category", "Category", "eg: Brakes", false],
                  ["unitCost", "Unit cost (₦)", "0", false],
                  ["stock", "Stock on hand", "0", false],
                  ["reorderLevel", "Reorder at", "0", false],
                  ["location", "Store location", "Main Store", false],
                  ["supplier", "Supplier", "eg: Nibo Metals", false],
                ] as const
              ).map(([key, label, placeholder, required]) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                    {label}
                    {required ? <span className="text-[#ED351D]"> *</span> : null}
                  </span>
                  <input
                    value={draft[key] ?? ""}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    placeholder={placeholder}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditing(null);
                }}
                className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePart()}
                className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-white"
              >
                {editing ? "Save part" : "Add to store"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ----------------------------------------------- record a purchase */}
      {purchasing && purchaseDraft ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record purchase"
          onClick={() => {
            setPurchasing(null);
            setPurchaseDraft(null);
          }}
        >
          <div
            className="flex max-h-[90vh] w-[520px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                Record purchase — {purchasing.name}
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                Stock in from a vendor. The price you enter becomes the line's unit cost, and the
                vendor is remembered for the next reorder.
              </p>
            </div>

            <div className="flex items-center justify-between rounded bg-[#F1F2F4] px-3 py-2 text-[13px] text-[#5C6470]">
              <span>
                On shelf now: <strong className="text-[#1B2432]">{purchasing.stock}</strong>
              </span>
              <span>
                Reorder at: <strong className="text-[#1B2432]">{purchasing.reorderLevel}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Quantity received <span className="text-[#ED351D]">*</span>
                </span>
                <input
                  type="number"
                  min="1"
                  value={purchaseDraft.qty}
                  onChange={(event) =>
                    setPurchaseDraft({ ...purchaseDraft, qty: event.target.value })
                  }
                  placeholder="eg: 10"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Unit price paid (₦)
                </span>
                <input
                  type="number"
                  min="0"
                  value={purchaseDraft.unitPrice}
                  onChange={(event) =>
                    setPurchaseDraft({ ...purchaseDraft, unitPrice: event.target.value })
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Vendor
                </span>
                <input
                  value={purchaseDraft.vendor}
                  onChange={(event) =>
                    setPurchaseDraft({ ...purchaseDraft, vendor: event.target.value })
                  }
                  placeholder="eg: Nibo Metals Ltd"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Reference
                </span>
                <input
                  value={purchaseDraft.reference}
                  onChange={(event) =>
                    setPurchaseDraft({ ...purchaseDraft, reference: event.target.value })
                  }
                  placeholder="eg: PO-2214 / delivery note"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Note
                </span>
                <input
                  value={purchaseDraft.note}
                  onChange={(event) =>
                    setPurchaseDraft({ ...purchaseDraft, note: event.target.value })
                  }
                  placeholder="anything the record should carry"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPurchasing(null);
                  setPurchaseDraft(null);
                }}
                className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePurchase()}
                className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-white"
              >
                Record purchase
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------- a line's movement history */}
      {historyFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Movement history"
          onClick={() => setHistoryFor(null)}
        >
          <div
            className="flex max-h-[85vh] w-[760px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                {historyFor.name} — movement history
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                Every recorded movement of this line: where each unit came from, what was paid for
                it, and which truck drew it out.
              </p>
            </div>

            {historyRows === null ? (
              <p className="py-6 text-center text-[13px] text-[#8E95A1]">Reading the ledger…</p>
            ) : historyRows.length === 0 ? (
              <FigmaEmptyState
                title="No movement recorded"
                body="This line has no ledger history yet — record a purchase, or issue it against a requisition, and every movement will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-[120px_90px_70px_110px_110px_1fr_130px] items-center gap-3 border-b border-[#E2E5E9] py-2">
                    {[
                      "When",
                      "Kind",
                      "Qty",
                      "Unit",
                      "Value",
                      "Truck / Vendor · note",
                      "Recorded by",
                    ].map((heading) => (
                      <span
                        key={heading}
                        className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]"
                      >
                        {heading}
                      </span>
                    ))}
                  </div>
                  {historyRows.map((row, index) => (
                    <div
                      key={row.id}
                      className={cn(
                        "grid grid-cols-[120px_90px_70px_110px_110px_1fr_130px] items-center gap-3 py-2 text-[13px]",
                        index < historyRows.length - 1 && "border-b border-[#E2E5E9]",
                      )}
                    >
                      <span className="text-[#5C6470]">{formatDateLines(row.actedAt).date}</span>
                      <span
                        className={cn(
                          "font-medium",
                          row.kind === "Purchase"
                            ? "text-[#1F7A33]"
                            : row.kind === "Issue"
                              ? "text-[#1B5FBF]"
                              : row.kind === "Write-off"
                                ? "text-[#D0331B]"
                                : "text-[#5C6470]",
                        )}
                      >
                        {row.kind}
                      </span>
                      <span className="font-semibold text-[#1B2432]">{row.quantity}</span>
                      <span className="text-[#5C6470]">
                        {row.unitCost === null ? "—" : formatNairaFull(row.unitCost)}
                      </span>
                      <span className="text-[#344256]">
                        {row.value === null ? "—" : formatNairaFull(row.value)}
                      </span>
                      <span className="truncate text-[#5C6470]">
                        {[row.truckReg || row.vendor || "—", row.note].filter(Boolean).join(" · ")}
                      </span>
                      <span className="truncate text-[#5C6470]">{row.actedBy || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setHistoryFor(null)}
                className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RaisePartsRequestModal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        jobs={openJobs}
        heads={heads}
        items={items}
        initialJob={raiseJob}
        onCreated={() => {
          void load().catch(() => {});
        }}
      />
    </>
  );
}
