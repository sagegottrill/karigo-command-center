import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, ArrowDownToLine, ChevronLeft, ChevronRight, Fuel, Search } from "lucide-react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { SignaturePad } from "@/components/fleetopsx/signature-pad";
import { adminService, driverService, lubricantService } from "@/lib/fleetopsx/services";
import {
  driverLabel,
  formatMoney,
  formatQuantity,
  jobLocation,
  lubricantUnit,
  resolveVehicle,
  type LubricantDisbursalRow,
  type LubricantFuel,
  type LubricantRequestRow,
  type LubricantStock,
  type LubricantVehicle,
} from "@/lib/fleetopsx/lubricant";
import { cn } from "@/lib/utils";

export function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "success"
      ? "bg-emerald-500"
      : severity === "warning"
        ? "bg-amber-500"
        : severity === "error"
          ? "bg-[#ED351D]"
          : "bg-[#2F80ED]";
  return <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", color)} aria-hidden />;
}

/**
 * A tank: what is in it, what it is measured in, and how close it is to the
 * department's minimum. The bar is the whole point — 16,855 L and 210 L look
 * identical as two numbers on a phone.
 */
export function TankCard({ stock, onClick }: { stock: LubricantStock; onClick?: () => void }) {
  const min = Number(stock.minLevel || 0);
  // Scale the bar against the minimum (the level that matters), never above full.
  const ceiling = Math.max(min * 2, Number(stock.quantity) || 0, 1);
  const percent = Math.max(0, Math.min(100, (Number(stock.quantity) || 0) / ceiling * 100));
  const isDiesel = stock.fuelType === "Diesel";
  return (
    <div className="flex w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[16px] font-medium tracking-[0.4px] text-[#1B2432]">
          Bulk {stock.fuelType} Storage
        </span>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-lg",
            isDiesel ? "bg-emerald-50" : "bg-[#ED351D]/10",
          )}
        >
          <Fuel className={cn("size-[18px]", isDiesel ? "text-emerald-600" : "text-[#ED351D]")} strokeWidth={1.5} />
        </span>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-[32px] font-semibold leading-none tracking-[0.4px] text-[#141A1F] tabular-nums">
          {formatQuantity(stock.quantity)}
        </span>
        <span className="pb-1 text-[13px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
          {lubricantUnit(stock.fuelType)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E5E9]">
          <div
            className={cn("h-full rounded-full", stock.low ? "bg-[#ED351D]" : isDiesel ? "bg-emerald-500" : "bg-[#ED351D]")}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className={cn("text-[11px] tracking-[0.4px]", stock.low ? "text-[#ED351D]" : "text-[#627084]")}>
            {stock.low ? "Below minimum" : "Healthy"}
          </span>
          <span className="text-[11px] tracking-[0.4px] text-[#627084]">
            Min: {formatQuantity(stock.minLevel)} {lubricantUnit(stock.fuelType).toLowerCase()}
          </span>
        </div>
      </div>

      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="flex h-9 w-full items-center justify-center rounded border border-[#E2E5E9] text-[13px] font-medium tracking-[0.4px] text-[#1B2432] hover:border-[#1B2432]"
        >
          Restock {stock.fuelType}
        </button>
      )}
    </div>
  );
}

/**
 * The staff list behind every "Logged by" / "Dispensed by" picker.
 *
 * The department types these names daily and two spellings of one person is how
 * a record ends up looking like two different people, so the field is a list,
 * never free text.
 */
export function useStaffOptions() {
  const [staff, setStaff] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const names = new Set<string>();
      try {
        const users: any[] = await adminService.users();
        for (const u of users ?? []) {
          const name = String(u?.name ?? "").trim();
          const status = String(u?.status ?? "Active");
          if (name && status !== "Suspended" && status !== "Deleted") names.add(name);
        }
      } catch {
        /* fall through to drivers */
      }
      try {
        const drivers: any[] = await driverService.list();
        for (const d of drivers ?? []) {
          const name = String(d?.name ?? "").trim();
          if (name) names.add(name);
        }
      } catch {
        /* the picker still works with users only */
      }
      if (live) setStaff(Array.from(names).sort((a, b) => a.localeCompare(b)));
    })();
    return () => {
      live = false;
    };
  }, []);

  return staff;
}

export function StaffSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Select who logged this",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium tracking-[0.4px] text-[#141A1F]">
        {label} {required && <span className="text-[#ED351D]">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
      >
        <option value="">{placeholder}</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Yes/no dialog — the last thing before a disbursal or a restock is written. */
export function ConfirmDialog({
  open,
  message,
  confirmLabel = "Confirm",
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#141A1F]/60 p-4">
      <div className="flex w-[364px] max-w-full flex-col gap-5 rounded-[10px] bg-white p-6 text-center shadow-[0px_4px_16px_rgba(12,12,13,0.2)]">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#ED351D]/10">
          <AlertOctagon className="size-6 text-[#ED351D]" strokeWidth={1.5} />
        </span>
        <p className="text-[14px] leading-5 text-[#5C6470]">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded px-5 text-[14px] font-medium text-[#ED351D] hover:bg-[#ED351D]/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-10 rounded bg-[#ED351D] px-5 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-50"
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Restock a tank: how much went in, and who logged it. It can only ever ADD —
 * a mistake is corrected with another entry, never by editing the tank's level.
 */
export function RestockModal({
  open,
  stocks,
  initialFuel,
  onClose,
  onDone,
}: {
  open: boolean;
  stocks: LubricantStock[];
  initialFuel?: LubricantFuel;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [fuelType, setFuelType] = useState<LubricantFuel>(initialFuel ?? "Diesel");
  const [quantity, setQuantity] = useState("");
  const [loggedBy, setLoggedBy] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const staff = useStaffOptions();

  useEffect(() => {
    if (open) {
      setFuelType(initialFuel ?? "Diesel");
      setQuantity("");
      setLoggedBy("");
      setConfirming(false);
    }
  }, [open, initialFuel]);

  if (!open) return null;

  const amount = Number(quantity);
  const valid = Number.isFinite(amount) && amount > 0 && loggedBy.trim().length > 0;
  const stockOf = (t: LubricantFuel) => stocks.find((s) => s.fuelType === t);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await lubricantService.restock({ fuelType, quantity: amount, loggedBy: loggedBy.trim() });
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      onDone(`${res?.reference ?? "Restock"} logged — ${formatQuantity(amount)} ${lubricantUnit(fuelType)} of ${fuelType} added to the tank.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The restock did not save.");
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4">
      <div className="flex w-[420px] max-w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.15)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E5E9] pb-3">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">
            <ArrowDownToLine className="size-[18px] text-[#ED351D]" strokeWidth={1.75} />
            Restock Lubricant
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded text-[18px] leading-none text-[#5C6470] hover:bg-[#F1F2F4]"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-[#1B2432] text-white">
          {(["Diesel", "Gas"] as const).map((t) => (
            <div key={t} className="flex flex-col gap-1 bg-[#1B2432] px-4 py-3">
              <span className="text-[10.5px] uppercase tracking-[0.4px] text-white/60">Available {t}</span>
              <span className="flex items-end gap-1.5">
                <span className="text-[20px] font-semibold leading-6 tabular-nums">
                  {formatQuantity(stockOf(t)?.quantity ?? 0)}
                </span>
                <span className="pb-0.5 text-[10px] uppercase tracking-[0.4px] text-white/60">
                  {lubricantUnit(t)}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium tracking-[0.4px] text-[#141A1F]">Select Lubricant to Restock</span>
          <div className="flex flex-wrap items-center gap-4">
            {(["Diesel", "Gas"] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#141A1F]">
                <input
                  type="radio"
                  name="restock-fuel"
                  checked={fuelType === t}
                  onChange={() => setFuelType(t)}
                  className="size-4 accent-[#ED351D]"
                />
                {t}
              </label>
            ))}
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              aria-label="Quantity"
              className="h-11 min-w-[140px] flex-1 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
            />
          </div>
        </div>

        <StaffSelect
          label="Logged by"
          required
          value={loggedBy}
          onChange={setLoggedBy}
          options={staff}
          placeholder="example: J.Doe"
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded px-4 text-[14px] font-medium text-[#ED351D] hover:bg-[#ED351D]/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => setConfirming(true)}
            className="h-10 rounded bg-[#ED351D] px-5 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-40"
          >
            Confirm Restock
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        busy={saving}
        message={`Are you sure you want to add ${formatQuantity(amount)} ${lubricantUnit(fuelType)} of ${fuelType} to the tank?`}
        confirmLabel="Confirm"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
      />
    </div>
  );
}

/** The read-only block at the top of the disbursal dialog. */
function VehicleDetails({ vehicle, row }: { vehicle: LubricantVehicle; row: LubricantRequestRow | LubricantDisbursalRow }) {
  const lines: Array<[string, string]> = [
    ["Truck Head (Cap Number)", vehicle.capNumber],
    ["Truck Head Plate Number", vehicle.plate],
    ["Truck Body Type assigned", vehicle.bodyType],
    ["Driver Assigned", driverLabel(vehicle)],
    ["Driver Contact Phone", vehicle.driverPhone],
    ["Destination", row.dropoff?.trim() || "—"],
  ];
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-[#F1F2F4] p-4">
      <span className="text-[13px] font-semibold tracking-[0.4px] text-[#1B2432]">Vehicle &amp; Operator Details</span>
      <div className="flex flex-col gap-1.5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4">
            <span className="text-[12.5px] text-[#5C6470]">{label}:</span>
            <span className="text-right text-[12.5px] font-medium text-[#141A1F]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dispense against one dispatch.
 *
 * The dispatcher picks WHICH lubricant and HOW MUCH — nothing else. The amount
 * is priced by the server from the Transport Manager's rate, and the row is
 * refused if the tank cannot cover it or if this dispatch was already dispensed
 * for, so a double entry cannot cost the company twice.
 */
export function DispatchDetailsModal({
  open,
  row,
  stocks,
  prices,
  onClose,
  onDone,
}: {
  open: boolean;
  row: LubricantRequestRow | LubricantDisbursalRow | null;
  stocks: LubricantStock[];
  prices: Record<string, number>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const requested = (row as LubricantRequestRow | null)?.request;
  const [fuelType, setFuelType] = useState<LubricantFuel>("Diesel");
  const [quantity, setQuantity] = useState("");
  const [dispensedBy, setDispensedBy] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const staff = useStaffOptions();

  useEffect(() => {
    if (open && row) {
      setFuelType(requested?.fuelType ?? "Diesel");
      setQuantity(requested?.quantity ? String(requested.quantity) : "");
      setDispensedBy("");
      setSignature(null);
      setConfirming(false);
    }
  }, [open, row, requested?.fuelType, requested?.quantity]);

  const vehicle = useMemo(() => resolveVehicle(row), [row]);
  if (!open || !row) return null;

  const amount = Number(quantity);
  const rate = prices[fuelType] ?? 0;
  const cost = Number.isFinite(amount) && amount > 0 ? amount * rate : 0;
  const inTank = stocks.find((s) => s.fuelType === fuelType)?.quantity ?? 0;
  const tooMuch = Number.isFinite(amount) && amount > inTank;
  const valid = Number.isFinite(amount) && amount > 0 && dispensedBy.trim().length > 0 && rate > 0 && !tooMuch;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await lubricantService.disburse({
        tripId: row.id,
        fuelType,
        quantity: amount,
        dispensedBy: dispensedBy.trim(),
        signature: signature ?? undefined,
      });
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      onDone(
        `${formatQuantity(res?.quantity ?? amount)} ${lubricantUnit(fuelType)} of ${fuelType} dispensed for ${row.reference ?? "the dispatch"} — ${formatMoney(res?.amount ?? cost)} charged at the set rate.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The disbursal did not save.");
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4">
      <div className="flex max-h-[92vh] w-[440px] max-w-full flex-col gap-4 overflow-auto rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.15)]">
        <div className="flex flex-col gap-1 border-b border-[#E2E5E9] pb-3">
          <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Dispatch Details</h3>
          <span className="text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
            Ticket {row.reference ?? "—"} • {jobLocation(row)}
          </span>
        </div>

        <VehicleDetails vehicle={vehicle} row={row} />

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium tracking-[0.4px] text-[#141A1F]">
            Select Lubricant to Dispense <span className="text-[#ED351D]">*</span>
          </span>
          <div className="flex flex-wrap items-center gap-4">
            {(["Diesel", "Gas"] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#141A1F]">
                <input
                  type="radio"
                  name="disburse-fuel"
                  checked={fuelType === t}
                  onChange={() => setFuelType(t)}
                  className="size-4 accent-[#ED351D]"
                />
                {t}
              </label>
            ))}
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              aria-label="Quantity dispensed"
              className="h-11 min-w-[130px] flex-1 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] tracking-[0.4px]">
            <span className={cn(tooMuch ? "text-[#ED351D]" : "text-[#627084]")}>
              In tank: {formatQuantity(inTank)} {lubricantUnit(fuelType).toLowerCase()}
            </span>
            <span className="text-[#627084]">
              {rate > 0
                ? `${formatQuantity(amount || 0)} × ₦${rate.toLocaleString()} = ${formatMoney(cost)} (set by the Transport Manager)`
                : `${fuelType} rate not set by the Transport Manager yet`}
            </span>
          </div>
        </div>

        <StaffSelect
          label="Dispensed by"
          required
          value={dispensedBy}
          onChange={setDispensedBy}
          options={staff}
          placeholder="Select who dispensed"
        />

        {/*
          The receiving driver signs for the exact quantity — the same
          accountability the spec asks of the parts store, applied to fuel. The
          signature rides onto the dispense record and surfaces in history.
        */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-[#141A1F]">
            Driver signature <span className="font-normal text-[#5C6470]">(receiving driver signs for the quantity)</span>
          </p>
          <SignaturePad onChange={setSignature} />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded px-4 text-[14px] font-medium text-[#ED351D] hover:bg-[#ED351D]/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => setConfirming(true)}
            className="h-10 rounded bg-[#ED351D] px-5 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-40"
          >
            Confirm Disbursal
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        busy={saving}
        message={`Are you sure you want to disburse this lubricant? ${formatQuantity(amount)} ${lubricantUnit(fuelType)} of ${fuelType} will be taken off the tank for ${row.reference ?? "this dispatch"}.`}
        confirmLabel="Confirm"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
      />
    </div>
  );
}

/**
 * What was dispensed for one dispatch, read-only.
 *
 * The history row is a record, not a form: it opens the same detail block the
 * dispenser saw, and states what actually came off the tank and who signed for
 * it — it can never be re-dispensed from here (the server refuses a second
 * disbursal for one dispatch).
 */
export function DisbursalViewModal({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: LubricantDisbursalRow | null;
  onClose: () => void;
}) {
  const vehicle = useMemo(() => resolveVehicle(row), [row]);
  if (!open || !row) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4">
      <div className="flex max-h-[92vh] w-[440px] max-w-full flex-col gap-4 overflow-auto rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.15)]">
        <div className="flex flex-col gap-1 border-b border-[#E2E5E9] pb-3">
          <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Dispatch Details</h3>
          <span className="text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
            Ticket {row.reference} • {relativeTime(row.createdAt)}
          </span>
        </div>

        <VehicleDetails vehicle={vehicle} row={row} />

        <div className="flex flex-col gap-2.5 rounded-lg border border-[#E2E5E9] p-4">
          <span className="text-[13px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispensed</span>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12.5px] text-[#5C6470]">{row.fuelType}</span>
            <span className="text-[12.5px] font-medium tabular-nums text-[#141A1F]">
              {formatQuantity(row.quantity)} {lubricantUnit(row.fuelType)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12.5px] text-[#5C6470]">Dispensed by</span>
            <span className="text-[12.5px] font-medium text-[#141A1F]">{row.dispensedBy}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded bg-[#1B2432] px-5 text-[14px] font-medium text-white hover:bg-[#141A1F]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Search field shared by the lubricant tables. */
export function LubricantSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full md:w-[320px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded border border-[#E2E5E9] bg-white pl-9 pr-3 text-[13.5px] text-[#141A1F] outline-none focus:border-[#1B2432]"
      />
    </div>
  );
}

/** CSV that matches the table on screen, row for row. */
export function exportCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The one footer every lubricant table shares: where you are, and get it out. */
export function LubricantTableFooter({
  from,
  to,
  total,
  page,
  pageCount,
  onPrev,
  onNext,
  onExport,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onExport: () => void;
}) {
  if (total === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
      <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[16px]">
        {from} - {to}
      </span>
      <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[16px]">of {total}</span>
      <div className="ml-2 flex items-center gap-2.5">
        <button
          type="button"
          disabled={page === 0}
          onClick={onPrev}
          className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-[18px] text-[#627084]" />
        </button>
        <button
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={onNext}
          className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="size-[18px] text-[#627084]" />
        </button>
        <ExportMenu
          csvAction={onExport}
          rows={total}
          title={`${from}–${to} of ${total}`}
          fileNameBase="lubricant"
        />
      </div>
    </div>
  );
}

/** Relative age for the notification feed ("10 minutes ago"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "Just now";
  const diff = Math.max(0, Date.now() - at);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
