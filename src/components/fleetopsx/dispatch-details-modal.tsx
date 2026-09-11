import type { Driver, Trip, TruckHead } from "@/lib/fleetopsx/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function ticketId(trip: Trip) {
  if (/^(REQ|DIS|TICKET)-/i.test(trip.id)) return trip.id;
  const digits = trip.id.replace(/\D/g, "").slice(-5) || trip.id.slice(-5);
  return `REQ-${digits.padStart(5, "0")}`;
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

function expenseTotal(trip: Trip) {
  if (typeof trip.totalCosts === "number") return trip.totalCosts;
  const costs = trip.directCosts;
  if (!costs) return undefined;
  return costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance;
}

export function DispatchDetailsModal({
  trip,
  driver,
  head,
  onClose,
  onApprove,
  onDecline,
}: {
  trip: Trip;
  driver?: Driver | undefined;
  head?: TruckHead | undefined;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
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
  const capNumber = head?.capNumber || head?.number || trip.headId;
  const plate = head?.registration || trip.truckReg;
  const tailAssigned = trip.tailType
    ? trip.tailNumber
      ? `${trip.tailType} (${trip.tailNumber})`
      : trip.tailType
    : trip.tailNumber;
  const driverName = trip.driverName || driver?.name;
  const driverLabel =
    driverName && driver?.employeeId ? `${driverName} (${driver.employeeId})` : driverName;
  const driverPhone = driver?.phone;
  const costs = trip.directCosts;
  const total = expenseTotal(trip);
  const hasCustomer = Boolean(customerName || trip.dropoff || sites.length > 0 || trip.pickup);
  const hasVehicle = Boolean(capNumber || plate || tailAssigned || driverLabel || driverPhone);
  const hasExpense = Boolean(costs || typeof total === "number");
  const canAct = trip.status === "Requested";

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
              <DetailRow label="Destination:" value={trip.dropoff} />
              {sites.length > 0 ? (
                <DetailRow label="Loading Site(s):" value={sites.join("\n")} multiline />
              ) : null}
            </div>
          </div>
        )}

        {hasVehicle && (
          <div className="flex w-full flex-col gap-6 rounded-[6px] bg-[#F1F2F4] p-2.5">
            <span className="text-[14px] font-bold text-[#1B2432]">Vehicle & Operator Details</span>
            <div className="flex w-full flex-col gap-[15px]">
              <DetailRow label="Truck Head (Cap Number):" value={capNumber} />
              <DetailRow label="Truck Head Plate Number:" value={plate} />
              <DetailRow label="Truck Tail assigned:" value={tailAssigned} />
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
                  <DetailRow label="Lubricant:" value={costs.lubricantType} />
                </>
              )}
              {typeof total === "number" && (
                <>
                  <div className="h-px w-full bg-[#E2E5E9]" />
                  <div className="flex w-full items-start justify-between gap-4 text-[14px] font-bold">
                    <span className="text-[#1B2432]">Total Configured Expense:</span>
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
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[14px] font-medium tracking-[0.4px] text-[#5C6470]"
          >
            Go Back
          </button>
          {canAct && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDecline}
                className="flex h-8 items-center rounded bg-[#ED351D] px-2.5 text-[12px] tracking-[0.4px] text-white"
              >
                Decline Request
              </button>
              <button
                type="button"
                onClick={onApprove}
                className="flex h-8 items-center rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white"
              >
                Approve Request
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
