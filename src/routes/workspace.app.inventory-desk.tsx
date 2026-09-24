import { createFileRoute, redirect } from "@tanstack/react-router";
import { ClipboardCheck, PackagePlus, Search, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { SignaturePad } from "@/components/fleetopsx/signature-pad";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import { ENGINEERING_ACCESS_ROLES, truckLabel } from "@/lib/fleetopsx/engineering-helpers";
import {
  authService,
  engineeringService,
  fleetService,
  formatNairaFull,
  inventoryService,
} from "@/lib/fleetopsx/services";
import type { InventoryItem, InventoryRequisition, TruckHead } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/inventory-desk")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // The STOREHOUSE's own desk — Inventory roles and the TM's audit view.
    // Engineering follows its parts on the Parts & Store board; the two
    // departments' doors stay separate.
    const allowed = [
      "Transport Manager",
      "Platform Admin",
      "Inventory",
      "Head of Inventory",
      "Store Floor Attendant",
      "Parts & Store",
      "Parts and Store",
    ];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: InventoryDesk,
});

/** The department's own roles, from the account the API issues. */
const isHead = () => {
  const roles = authService.getRoles();
  return roles.some((r: string) => /head of inventory|inventory manager/i.test(r));
};

const statusPill = (status: string) => {
  switch (status) {
    case "Awaiting Pickup":
      return "bg-[#1F7A33] text-white";
    case "Awaiting Procurement":
      return "bg-[#ED351D] text-white";
    case "Released":
      return "bg-[#34C759] text-white";
    default:
      return "bg-[#E2E5E9] text-[#5C6470]";
  }
};

/**
 * The Inventory department's desk: the physical half of the parts loop.
 *
 * Engineering asks, the Transport Manager approves, and THIS board finishes the
 * job — an attendant picks the part off the shelf, the mechanic signs for it,
 * and only then does stock move and money post to the truck. What the shelf
 * cannot cover is flagged to Procurement without leaving this page, and the
 * Head of Inventory logs inbound stock and files count variances here.
 */
function InventoryDesk() {
  const [handoffs, setHandoffs] = useState<InventoryRequisition[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [canWork, setCanWork] = useState(false);
  const [head, setHead] = useState(false);

  const [signing, setSigning] = useState<InventoryRequisition | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intake, setIntake] = useState<Record<string, string> | null>(null);
  const [reconFor, setReconFor] = useState<InventoryItem | null>(null);
  const [reconCount, setReconCount] = useState("");
  const [reconReason, setReconReason] = useState("");

  const load = useCallback(() => {
    return Promise.all([
      inventoryService.handoffs().catch(() => [] as InventoryRequisition[]),
      inventoryService.list().catch(() => [] as InventoryItem[]),
      fleetService.listHeads().catch(() => [] as TruckHead[]),
    ]).then(([queue, store, fleet]) => {
      setHandoffs(queue);
      setItems(store);
      setHeads(fleet);
    });
  }, []);

  useEffect(() => {
    const roles = authService.getRoles();
    setHead(isHead());
    // Engineering may read the queue to follow its parts; the store floor and
    // the Head of Inventory are the ones who work it.
    setCanWork(
      roles.some((r: string) => /inventory/i.test(r)) || roles.includes("Transport Manager"),
    );
    void load()
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load the desk"),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const truckOf = (reg: string) => {
    const want = String(reg ?? "")
      .trim()
      .toLowerCase();
    const found = heads.find(
      (h) =>
        h.registration.trim().toLowerCase() === want ||
        (displayHeadCap(h) || h.number).trim().toLowerCase() === want,
    );
    return found ? truckLabel(found) : reg || "—";
  };

  /** One readable line per truck — no "P062 (GGE98YK) · P062 (GGE98YK)". */
  const truckLine = (reg: string) => {
    const label = truckOf(reg);
    return label === reg ? label : `${label} · ${reg}`;
  };

  const queue = useMemo(() => {
    const q = query.trim().toLowerCase();
    return handoffs
      .filter((t) => !q || `${t.part} ${t.truckReg} ${t.mechanic}`.toLowerCase().includes(q))
      .sort((a, b) => {
        // Working order: the flags first (a truck is stopped on those), then
        // oldest approval first within each band.
        const band = (s: string) => (s === "Awaiting Procurement" ? 0 : 1);
        const byBand = band(a.status) - band(b.status);
        return byBand !== 0 ? byBand : a.date < b.date ? -1 : 1;
      });
  }, [handoffs, query]);

  const storeKpis = useMemo(() => {
    const value = items.reduce((total, i) => total + i.stock * i.unitCost, 0);
    const low = items.filter(
      (i) => i.status === "Low Stock" || (i.stock > 0 && i.stock <= i.reorderLevel),
    ).length;
    const out = items.filter((i) => i.status === "Out of Stock" || i.stock <= 0).length;
    return { value, low, out, lines: items.length };
  }, [items]);

  const completeSignoff = async () => {
    if (!signing || !signature) {
      toast.error("The mechanic must sign before the part leaves the store.");
      return;
    }
    try {
      const result = await inventoryService.completeHandoff(signing.id, signature);
      toast.success(
        `${signing.part} released to ${signing.truckReg} — ${formatNairaFull(result.releasedValue ?? 0)} posted to the truck.`,
      );
      setSigning(null);
      setSignature(null);
      void load().catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The handoff did not complete.");
    }
  };

  const flagOOS = async (ticket: InventoryRequisition) => {
    try {
      await inventoryService.pickHandoff(ticket.id, false);
      toast.success(
        `${ticket.part} flagged for procurement — the shelf's book was corrected and a task raised.`,
      );
      void load().catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The flag was not saved.");
    }
  };

  const submitIntake = async () => {
    if (!intake) return;
    const item = items.find((i) => i.id === intake.itemId);
    if (!item) {
      toast.error("Choose the part that arrived.");
      return;
    }
    const qty = Math.floor(Number(intake.qty) || 0);
    if (qty <= 0) {
      toast.error("A delivery needs a quantity.");
      return;
    }
    try {
      const updated = await inventoryService.purchase(item.id, {
        qty,
        unitPrice: Number(intake.unitPrice) || item.unitCost,
        vendor: (intake.vendor ?? "").trim(),
        reference: (intake.invoice ?? "").trim(),
        note: intake.note ?? "",
      });
      toast.success(
        `${qty} × ${updated.name} received — weighted-average cost now ${formatNairaFull(updated.unitCost)}.`,
      );
      setIntakeOpen(false);
      setIntake(null);
      void load().catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The delivery was not recorded.");
    }
  };

  const submitRecon = async () => {
    if (!reconFor) return;
    const observed = Math.trunc(Number(reconCount) || 0);
    if (observed < 0) {
      toast.error("A count cannot be negative.");
      return;
    }
    try {
      const updated = await inventoryService.reconcile(
        reconFor.id,
        observed,
        reconReason.trim() || "Physical count",
      );
      toast.success(`${updated.name}: book corrected to ${updated.stock}. Variance filed.`);
      setReconFor(null);
      setReconCount("");
      setReconReason("");
      void load().catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The variance was not filed.");
    }
  };

  const inputClass =
    "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";

  if (loading) {
    return (
      <>
        <DepartmentTabs department="inventory" />
        <div className="min-h-[60vh] bg-[#F1F2F4]">
          <FigmaLoadingState label="Loading the desk…" />
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
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Inventory Desk</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              the physical half of the parts loop — pick, sign, hand over; flag what the shelf
              cannot cover
            </p>
            {!canWork ? (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — the store floor and Head of Inventory work this board
              </span>
            ) : null}
          </div>
          {head && canWork ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIntake(
                    items[0]
                      ? {
                          itemId: items[0].id,
                          qty: "",
                          unitPrice: "",
                          vendor: "",
                          invoice: "",
                          note: "",
                        }
                      : null,
                  );
                  if (!items[0])
                    toast.error(
                      "Add the part to the store first — there is nothing to receive against.",
                    );
                  else setIntakeOpen(true);
                }}
                className="flex h-8 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
              >
                <PackagePlus className="size-4" />
                Inbound Stock
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: "Store Value",
              value: formatNairaFull(storeKpis.value),
              tone: "text-[#1B2432]",
            },
            {
              label: "Handoffs Waiting",
              value: queue.filter((t) => t.status === "Awaiting Pickup").length,
              tone: "text-[#1F7A33]",
            },
            {
              label: "Paused — Out of Stock",
              value: queue.filter((t) => t.status === "Awaiting Procurement").length,
              tone: "text-[#ED351D]",
            },
            {
              label: "Low / Out Lines",
              value: `${storeKpis.low} / ${storeKpis.out}`,
              tone: "text-[#B26A00]",
            },
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

        {/* --------------------------------------------- the handoff queue */}
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[16px] font-medium text-[#1B2432]">Pending handoffs</h3>
              <p className="text-[12px] text-[#5C6470]">
                Approved tickets in the order they were raised — a flag pauses the truck until
                procurement restocks
              </p>
            </div>
            <div className="relative ml-auto w-full max-w-[320px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                strokeWidth={1.5}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search part, truck, mechanic…"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
          </div>

          {queue.length === 0 ? (
            <FigmaEmptyState
              title="The floor is clear"
              body="When the Transport Manager approves a parts request it lands here for picking and sign-off."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {queue.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex flex-wrap items-center gap-4 rounded-[8px] border border-[#E2E5E9] px-4 py-3"
                >
                  <div className="flex min-w-[220px] flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[15px] font-medium text-[#1B2432]">
                      {ticket.part}
                      <span className="text-[12px] text-[#5C6470]">×{ticket.quantity}</span>
                    </span>
                    <span className="text-[12px] text-[#5C6470]">{truckLine(ticket.truckReg)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-[13px] text-[#344256]">
                    <span>{ticket.mechanic || "Mechanic unassigned"}</span>
                    <span className="text-[11px] text-[#5C6470]">
                      approved {formatDateLines(ticket.date).date}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                      statusPill(ticket.status),
                    )}
                  >
                    {ticket.status}
                  </span>
                  {canWork ? (
                    <div className="ml-auto flex items-center gap-2">
                      {ticket.status === "Awaiting Pickup" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSigning(ticket);
                              setSignature(null);
                            }}
                            className="flex h-8 items-center gap-1.5 rounded bg-[#1F7A33] px-3 text-[13px] font-medium text-white"
                          >
                            <ClipboardCheck className="size-4" />
                            Picked — Sign off
                          </button>
                          <button
                            type="button"
                            onClick={() => void flagOOS(ticket)}
                            className="flex h-8 items-center gap-1.5 rounded border border-[#ED351D] px-3 text-[13px] font-medium text-[#ED351D]"
                          >
                            <TriangleAlert className="size-4" />
                            Flag out of stock
                          </button>
                        </>
                      ) : (
                        <span className="text-[12px] text-[#5C6470]">
                          waiting on procurement — resumes automatically when stock arrives
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------------------- the shelf again */}
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[16px] font-medium text-[#1B2432]">Shelf & variances</h3>
              <p className="text-[12px] text-[#5C6470]">
                {head
                  ? "Count a line when the shelf disagrees with the book — the variance is flagged to you and the Transport Manager"
                  : "Read-only here — the Head of Inventory files count variances"}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1fr_150px_110px_110px_1fr_150px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {["Part", "SKU", "Stock", "Reorder At", "Compatibility", ""].map((heading) => (
                  <span
                    key={heading}
                    className="text-[13px] font-medium uppercase tracking-[0.4px] text-[#5C6470]"
                  >
                    {heading}
                  </span>
                ))}
              </div>
              {items.length === 0 ? (
                <FigmaEmptyState
                  title="The store is empty"
                  body="Add parts on the Parts & Store board, then log inbound stock here as deliveries arrive."
                />
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_150px_110px_110px_1fr_150px] items-center gap-4 border-b border-[#E2E5E9] py-[13px] last:border-b-0"
                  >
                    <span className="text-[14px] text-[#344256]">{item.name}</span>
                    <span className="text-[13px] text-[#5C6470]">{item.sku}</span>
                    <span
                      className={cn(
                        "text-[14px]",
                        item.stock <= 0
                          ? "text-[#ED351D]"
                          : item.stock <= item.reorderLevel
                            ? "text-[#B26A00]"
                            : "text-[#344256]",
                      )}
                    >
                      {item.stock}
                    </span>
                    <span className="text-[13px] text-[#5C6470]">{item.reorderLevel}</span>
                    <span className="truncate text-[13px] text-[#5C6470]">
                      {item.vehicleCompatibility || "—"}
                    </span>
                    {head && canWork ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReconFor(item);
                          setReconCount(String(item.stock));
                          setReconReason("");
                        }}
                        className="h-8 w-fit rounded border border-[#1B2432] px-3 text-[13px] font-medium text-[#1B2432]"
                      >
                        Count stock
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ the sign-off pad */}
      {signing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Mechanic sign-off"
          onClick={() => setSigning(null)}
        >
          <div
            className="flex max-h-[90vh] w-[620px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                Handoff — {signing.part} ×{signing.quantity}
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                {truckLine(signing.truckReg)} · mechanic {signing.mechanic || "unassigned"}. On
                Complete Handoff the stock is deducted at weighted-average cost and the value posts
                to this truck's maintenance file.
              </p>
            </div>
            <SignaturePad onChange={setSignature} />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSigning(null)}
                className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void completeSignoff()}
                className="h-9 rounded bg-[#1F7A33] px-4 text-[14px] font-medium tracking-[0.4px] text-white"
              >
                Complete Handoff
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------- inbound intake */}
      {intakeOpen && intake ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Inbound stock"
          onClick={() => setIntakeOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-[560px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                Inbound stock — goods receipt
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                Receiving stock re-prices the line at weighted average — never at the last price —
                and resumes any handoff the delivery covers.
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Part received <span className="text-[#ED351D]">*</span>
              </span>
              <select
                value={intake.itemId ?? ""}
                onChange={(event) => setIntake({ ...intake, itemId: event.target.value })}
                className={inputClass}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku}) — on shelf {item.stock}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Quantity received <span className="text-[#ED351D]">*</span>
                </span>
                <input
                  type="number"
                  min="1"
                  value={intake.qty ?? ""}
                  onChange={(event) => setIntake({ ...intake, qty: event.target.value })}
                  placeholder="eg: 10"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Unit purchase value (₦)
                </span>
                <input
                  type="number"
                  min="0"
                  value={intake.unitPrice ?? ""}
                  onChange={(event) => setIntake({ ...intake, unitPrice: event.target.value })}
                  placeholder="0"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Vendor
                </span>
                <input
                  value={intake.vendor ?? ""}
                  onChange={(event) => setIntake({ ...intake, vendor: event.target.value })}
                  placeholder="eg: Nibo Metals Ltd"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Invoice / waybill no.
                </span>
                <input
                  value={intake.invoice ?? ""}
                  onChange={(event) => setIntake({ ...intake, invoice: event.target.value })}
                  placeholder="eg: INV-4471"
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIntakeOpen(false)}
                className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitIntake()}
                className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-white"
              >
                Commit Stock to System
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------- the count variance */}
      {reconFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Count stock"
          onClick={() => setReconFor(null)}
        >
          <div
            className="flex max-h-[90vh] w-[480px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                Count — {reconFor.name}
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                Book says {reconFor.stock}. A disagreement is filed as a variance flag to you and
                the Transport Manager — it cannot be quietly absorbed.
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Physical count observed <span className="text-[#ED351D]">*</span>
              </span>
              <input
                type="number"
                min="0"
                value={reconCount}
                onChange={(event) => setReconCount(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Reason
              </span>
              <input
                value={reconReason}
                onChange={(event) => setReconReason(event.target.value)}
                placeholder="Damaged / Missing / Scrapped / recount"
                className={inputClass}
              />
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setReconFor(null)}
                className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRecon()}
                className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-white"
              >
                File Variance
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
