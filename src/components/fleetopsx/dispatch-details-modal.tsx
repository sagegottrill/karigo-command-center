import type { Driver, Trip, TruckHead } from "@/lib/fleetopsx/types";
import {
  displayDriverAssigned,
  displayHeadCap,
  displayRequestedTruckType,
  humanCode,
  looksLikeUuid,
} from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { formatDateLines, formatDateTimeStamp } from "@/lib/fleetopsx/display-dates";
import { canSeeTmPricing } from "@/lib/fleetopsx/active-role";
import { authService } from "@/lib/fleetopsx/services";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function ticketId(trip: Trip) {
  return displayRequestId(trip);
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string | undefined;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex w-full items-start justify-between gap-4 text-[13px]">
      <span className="shrink-0 text-[#5C6470]">{label}</span>
      <span
        className={`max-w-[58%] text-right font-semibold text-[#1B2432] ${multiline ? "whitespace-pre-line" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Sum of the allowances the operator typed themselves (excludes lubricant).
 * This is the only total Fleet Operations may see — lubricant cost is priced
 * from the Transport Manager's rate card.
 */
function allowanceTotal(trip: Trip) {
  const costs = trip.directCosts;
  if (!costs) return undefined;
  return (
    costs.tripAllowance +
    costs.returnWaybill +
    costs.motorBoy +
    costs.ticket +
    costs.extraAllowance +
    (costs.bonus ?? 0)
  );
}

/**
 * The grand total as it will be recorded (includes TM-priced lubricant) — or,
 * for Fleet Operations, only the allowances they entered.
 */
function expenseTotal(trip: Trip, hideTmPricing = false) {
  if (hideTmPricing) {
    const own = allowanceTotal(trip);
    if (typeof own === "number") return own;
  }
  if (typeof trip.totalCosts === "number") return trip.totalCosts;
  // The API has no total column, so this total is derived from the rows shown
  // right above it. It must therefore INCLUDE the priced fuel — otherwise the
  // TM's document reads a total smaller than its own line items.
  const own = allowanceTotal(trip);
  if (typeof own !== "number") return undefined;
  return own + (trip.directCosts?.lubricantCost ?? 0);
}

export function dispatchFields(
  trip: Trip,
  driver: Driver | undefined,
  head: TruckHead | undefined,
  hideTmPricing = false,
) {
  const customerName = trip.customerConsignee;
  const partner =
    trip.customer && trip.customer !== "Customer Portal" ? trip.customer.toUpperCase() : undefined;
  const sitesRaw = trip.loadingSite?.filter(Boolean) ?? [];
  const sites =
    sitesRaw.length > 0
      ? sitesRaw.flatMap((s) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean))
      : (trip.pickup ?? "")
          .split(/[;,]/)
          .map((x) => x.trim())
          .filter(Boolean);
  const capNumber = displayHeadCap(head, trip.headId);
  // truckReg can be "PLATE / TAIL" (gate departure writes both) — the plate row
  // must show the CAP/PLATE only, never the tail code.
  const plateRaw = head?.registration || (trip.truckReg || "").split("/")[0]?.trim() || "";
  const plate = plateRaw && !looksLikeUuid(plateRaw) ? plateRaw : head?.registration || undefined;
  // Cap and plate are one husband-and-wife unit — always shown side by side.
  const capPlate = [capNumber, plate].filter(Boolean).join(" · ") || undefined;
  const tailAssigned = humanCode(trip.tailNumber, trip.tailType)
    ? trip.tailType && trip.tailNumber && trip.tailType !== trip.tailNumber
      ? `${trip.tailType} (${trip.tailNumber})`
      : humanCode(trip.tailNumber, trip.tailType)
    : undefined;
  const driverLabel = displayDriverAssigned(driver, trip.driverName || driver?.name);
  const costs = trip.directCosts;
  const total = expenseTotal(trip, hideTmPricing);
  const money = (n: number) => formatMoney(n);
  return {
    ticket: ticketId(trip),
    partner,
    status: trip.status,
    dateRequested: formatDateTimeStamp(trip.createdAt),
    dateApproved: formatDateTimeStamp(trip.dispatchedAt),
    customer: [
      { label: "Customer Name", value: customerName },
      { label: "Drop-off Location", value: trip.dropoff },
      // Optional on the request — only shown once the partner gave one, so the
      // driver's sheet never carries an empty "Address" line.
      ...(trip.dropoffAddress?.trim()
        ? [{ label: "Destination Address", value: trip.dropoffAddress }]
        : []),
      ...sites.map((s, i) => ({
        label: sites.length === 1 ? "Loading Site" : `Loading Site ${i + 1}`,
        value: s,
      })),
    ] as { label: string; value?: string | undefined }[],
    vehicle: [
      // The body the partner asked for, right above what was actually hitched —
      // so a Full Sided request on a Flatbed Tail is visible at a glance.
      { label: "Truck Type requested", value: displayRequestedTruckType(trip) || undefined },
      { label: "Truck Head (Cap Number / Plate)", value: capPlate },
      { label: "Truck Tail assigned", value: tailAssigned },
      { label: "Truck Body (Tail Type)", value: trip.tailType || undefined },
      { label: "Driver Assigned", value: driverLabel },
      { label: "Driver Contact Phone", value: driver?.phone },
    ] as { label: string; value?: string | undefined }[],
    expense: costs
      ? ([
          { label: "Trip Allowance", value: money(costs.tripAllowance) },
          { label: "Return Waybill", value: money(costs.returnWaybill) },
          { label: "Motor Boy Allowance", value: money(costs.motorBoy) },
          { label: "Transit Road Tickets", value: money(costs.ticket) },
          { label: "Extra Contingency", value: money(costs.extraAllowance) },
          { label: "Bonus", value: money(costs.bonus ?? 0) },
          { label: "Lubricant", value: costs.lubricantType },
          // TM printout must show the priced fuel: litres and its cost.
          ...(typeof costs.lubricantQuantity === "number" && costs.lubricantQuantity > 0
            ? [{ label: "Lubricant Quantity", value: `${costs.lubricantQuantity} Litres` }]
            : []),
          ...(!hideTmPricing && typeof costs.lubricantCost === "number" && costs.lubricantCost > 0
            ? [{ label: `${costs.lubricantType || "Lubricant"} Cost`, value: money(costs.lubricantCost) }]
            : []),
          ...(typeof total === "number"
            ? [
                {
                  label: hideTmPricing
                    ? "Total Configured Expense (excl. fuel rate)"
                    : "Total Configured Expense",
                  value: money(total),
                },
              ]
            : []),
        ] as { label: string; value?: string | undefined }[])
      : [],
  };
}

/** Download the dispatch details as a spreadsheet-friendly CSV. */
function exportCsv(fields: ReturnType<typeof dispatchFields>) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows: string[] = [
    esc("Petroline Transport Ltd — Dispatch Details"),
    esc(`Ticket ${fields.ticket}${fields.partner ? ` • ${fields.partner}` : ""}`),
    esc(`Status: ${fields.status}`),
    esc(`Date Requested: ${fields.dateRequested}`),
    esc(`Date Approved: ${fields.dateApproved}`),
    "",
    esc("Section"),
    esc("Field"),
    esc("Value"),
  ];
  for (const [section, items] of [
    ["Customer Details", fields.customer],
    ["Vehicle & Operator Details", fields.vehicle],
    ["Expense Configuration Breakdown", fields.expense],
  ] as const) {
    if (items.length === 0) continue;
    for (const item of items) {
      if (!item.value) continue;
      rows.push([esc(section), esc(item.label), esc(item.value)].join(","));
    }
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dispatch_${fields.ticket}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Dispatch details exported.");
}

/** Open a clean print sheet with just the dispatch details. (Shared with the Tracking Operations detail page.) */
export function printDispatch(fields: ReturnType<typeof dispatchFields>) {
  const section = (title: string, items: { label: string; value?: string | undefined }[]) =>
    items.length === 0
      ? ""
      : `<h2>${title}</h2><table>${items
          .filter((i) => i.value)
          .map((i) => `<tr><td class="l">${i.label}:</td><td>${i.value}</td></tr>`)
          .join("")}</table>`;
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) {
    toast.error("Allow pop-ups for this site to print.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${fields.ticket} — Dispatch Details</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #1B2432; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #5C6470; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; margin-bottom: 4px; }
    .stamp { color: #5C6470; font-size: 10px; margin-bottom: 18px; }
    h2 { font-size: 14px; margin: 20px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #E2E5E9; }
    td.l { color: #5C6470; width: 45%; }
    .total td { font-weight: bold; color: #ED351D; }
    @media print { body { margin: 12mm; } }
  </style></head><body>
    <h1>Dispatch Details</h1>
    <div class="meta">Ticket ${fields.ticket}${fields.partner ? ` &bull; ${fields.partner}` : ""}</div>
    <div class="stamp">Status: ${fields.status} &nbsp;|&nbsp; Requested: ${fields.dateRequested} &nbsp;|&nbsp; Approved: ${fields.dateApproved} &nbsp;|&nbsp; Printed: ${formatDateLines(new Date().toISOString()).date} ${formatDateLines(new Date().toISOString()).time}</div>
    ${section("Customer Details", fields.customer)}
    ${section("Vehicle & Operator Details", fields.vehicle)}
    ${section("Expense Configuration Breakdown", fields.expense)}
    <script>window.onload = function () { window.print(); };</script>
  </body></html>`);
  w.document.close();
  w.focus();
}

export function DispatchDetailsModal({
  trip,
  driver,
  head,
  onClose,
  onApprove,
  onDecline,
  declineLabel,
  onEdit,
}: {
  trip: Trip;
  driver?: Driver | undefined;
  head?: TruckHead | undefined;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
  /**
   * What the red action is called for this role. On the Transport Manager's
   * dispatch list it is "Send Back to Fleet Ops" — a rejection there is an
   * internal correction, never a customer-visible decline.
   */
  declineLabel?: string;
  /** TM-only: open the Modify Assignment editor for FO-configured dispatches. */
  onEdit?: () => void;
}) {
  const customerName = trip.customerConsignee;
  const partner =
    trip.customer && trip.customer !== "Customer Portal" ? trip.customer.toUpperCase() : undefined;
  const sitesRaw = trip.loadingSite?.filter(Boolean) ?? [];
  const sites =
    sitesRaw.length > 0
      ? sitesRaw.flatMap((s) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean))
      : (trip.pickup ?? "")
          .split(/[;,]/)
          .map((x) => x.trim())
          .filter(Boolean);
  const capNumber = displayHeadCap(head, trip.headId);
  // truckReg can be "PLATE / TAIL" (gate departure writes both) — the plate row
  // must show the CAP/PLATE only, never the tail code.
  const plateRaw = head?.registration || (trip.truckReg || "").split("/")[0]?.trim() || "";
  const plate = plateRaw && !looksLikeUuid(plateRaw) ? plateRaw : head?.registration || undefined;
  // Cap and plate are one husband-and-wife unit — always shown side by side.
  const capPlate = [capNumber, plate].filter(Boolean).join(" · ") || undefined;
  const tailAssigned = humanCode(trip.tailNumber, trip.tailType)
    ? trip.tailType && trip.tailNumber && trip.tailType !== trip.tailNumber
      ? `${trip.tailType} (${trip.tailNumber})`
      : humanCode(trip.tailNumber, trip.tailType)
    : undefined;
  const driverName = trip.driverName || driver?.name;
  const driverLabel = displayDriverAssigned(driver, driverName);
  const driverPhone = driver?.phone;
  // Fleet Ops enters litres; the TM prices them. Hide every rate-derived number.
  const hideTmPricing = !canSeeTmPricing(authService.getRoles());
  const costs = trip.directCosts;
  const total = expenseTotal(trip, hideTmPricing);
  const hasCustomer = Boolean(customerName || trip.dropoff || sites.length > 0 || trip.pickup);
  const hasVehicle = Boolean(
    capNumber || plate || tailAssigned || driverLabel || driverPhone || displayRequestedTruckType(trip),
  );
  const hasExpense = Boolean(costs || typeof total === "number");
  const canAct = trip.status === "Requested";
  // TM can modify what FO configured while the dispatch is still pre-road.
  const canEdit =
    Boolean(onEdit) &&
    (trip.status === "Awaiting Approval" || trip.status === "Approved" || trip.status === "Scheduled");
  const fields = dispatchFields(trip, driver, head, hideTmPricing);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
      <div className="flex max-h-[90vh] w-[406px] max-w-full flex-col gap-4 overflow-auto rounded-[10px] border border-[#E2E5E9] bg-white p-[15px] shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
        <div className="rounded border-b border-[#E2E5E9] px-2.5 py-2 shadow-[0px_1px_4px_rgba(12,12,13,0.1)]">
          <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Dispatch Details</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span className="text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
              Ticket {ticketId(trip)}
            </span>
            {partner && (
              <>
                <span className="inline-block size-1.5 rounded-full bg-[#5C6470]" aria-hidden />
                <span className="text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">{partner}</span>
              </>
            )}
          </div>
        </div>

        {hasCustomer && (
          <div className="flex w-full flex-col gap-6 rounded-[6px] bg-[#F1F2F4] p-2.5">
            <span className="text-[14px] font-bold text-[#1B2432]">Customer Details</span>
            <div className="flex w-full flex-col gap-[15px]">
              <DetailRow label="Customer Name:" value={customerName} />
              <DetailRow label="Drop-off Location:" value={trip.dropoff} />
              {trip.dropoffAddress?.trim() ? (
                <DetailRow label="Destination Address:" value={trip.dropoffAddress} />
              ) : null}
              {sites.length > 0
                ? sites.map((site, i) => (
                    <DetailRow
                      key={`${site}-${i}`}
                      label={sites.length === 1 ? "Loading Site:" : `Loading Site ${i + 1}:`}
                      value={site}
                    />
                  ))
                : null}
            </div>
          </div>
        )}

        {hasVehicle && (
          <div className="flex w-full flex-col gap-6 rounded-[6px] bg-[#F1F2F4] p-2.5">
            <span className="text-[14px] font-bold text-[#1B2432]">Vehicle & Operator Details</span>
            <div className="flex w-full flex-col gap-[15px]">
              <DetailRow label="Truck Type requested:" value={displayRequestedTruckType(trip)} />
              <DetailRow label="Truck Head (Cap Number / Plate):" value={capPlate} />
              <DetailRow label="Truck Tail assigned:" value={tailAssigned} />
              <DetailRow label="Truck Body (Tail Type):" value={trip.tailType} />
              <DetailRow label="Driver Assigned:" value={driverLabel} />
              <DetailRow label="Driver Contact Phone:" value={driverPhone} />
            </div>
          </div>
        )}

        {hasExpense && (
          <div className="flex w-full flex-col gap-4 rounded-[6px] bg-[#F1F2F4] p-4">
            <span className="text-[14px] font-bold text-[#1B2432]">Expense Configuration Breakdown</span>
            <div className="flex w-full flex-col gap-2.5">
              {costs && (
                <>
                  <DetailRow label="Trip Allowance:" value={formatMoney(costs.tripAllowance)} />
                  <DetailRow label="Return Waybill:" value={formatMoney(costs.returnWaybill)} />
                  <DetailRow label="Motor Boy Allowance:" value={formatMoney(costs.motorBoy)} />
                  <DetailRow label="Transit Road Tickets:" value={formatMoney(costs.ticket)} />
                  <DetailRow label="Extra Contingency:" value={formatMoney(costs.extraAllowance)} />
                  <DetailRow label="Bonus:" value={formatMoney(costs.bonus ?? 0)} />
                  <DetailRow label="Lubricant:" value={costs.lubricantType} />
                  {typeof costs.lubricantQuantity === "number" && costs.lubricantQuantity > 0 && (
                    <DetailRow label="Lubricant Quantity:" value={`${costs.lubricantQuantity} Litres`} />
                  )}
                  {!hideTmPricing && typeof costs.lubricantCost === "number" && costs.lubricantCost > 0 && (
                    <DetailRow label={`${costs.lubricantType || "Lubricant"} Cost:`} value={formatMoney(costs.lubricantCost)} />
                  )}
                </>
              )}
              {hideTmPricing ? (
                <p className="text-[11px] tracking-[0.4px] text-[#5C6470]">
                  Fuel cost is applied on approval by the Transport Manager&apos;s rate card.
                </p>
              ) : null}
              {typeof total === "number" && (
                <>
                  <div className="h-px w-full bg-[#E2E5E9]" />
                  <div className="flex w-full items-start justify-between gap-4 text-[14px] font-bold">
                    <span className="text-[#1B2432]">
                      Total Configured Expense{hideTmPricing ? " (excl. fuel)" : ":"}
                    </span>
                    <span className="text-[#ED351D]">{formatMoney(total)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!hasCustomer && !hasVehicle && !hasExpense && (
          <p className="px-1 text-[13px] tracking-[0.4px] text-[#5C6470]">
            No extra dispatch fields on this trip yet.
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => printDispatch(fields)}
              className="flex h-8 items-center gap-1.5 rounded border border-[#E2E5E9] px-2.5 text-[12px] tracking-[0.4px] text-[#344256] hover:bg-[#F1F2F4]"
            >
              <Printer className="size-4" strokeWidth={1.75} />
              Print
            </button>
            <button
              type="button"
              onClick={() => exportCsv(fields)}
              className="flex h-8 items-center gap-1.5 rounded border border-[#E2E5E9] px-2.5 text-[12px] tracking-[0.4px] text-[#344256] hover:bg-[#F1F2F4]"
            >
              <Download className="size-4" strokeWidth={1.75} />
              Export CSV
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-[14px] font-medium tracking-[0.4px] text-[#5C6470]"
            >
              Go Back
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex h-8 items-center rounded border border-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-[#1B2432]"
              >
                Edit Assignment
              </button>
            )}
            {canAct && (
              <>
                <button
                  type="button"
                  onClick={onDecline}
                  className="flex h-8 items-center rounded bg-[#ED351D] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  {declineLabel ?? "Decline Request"}
                </button>
                <button
                  type="button"
                  onClick={onApprove}
                  className="flex h-8 items-center rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  Approve Request
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
