import { displayCapPlateFromTrip } from "./display-ids";
import { formatMoney } from "./lubricant";
import type { Trip } from "./types";

/**
 * The direct-cost vocabulary, shared by the two sides of the same money.
 *
 * A dispatch's direct costs are committed by Fleet Ops when the trip is
 * configured, endorsed by the Transport Manager, and paid by the Accounts desk.
 * Three desks read the same six figures off the same dispatch, so the labels,
 * the order they are read in, and the way a total is worked out live here once —
 * otherwise the same truck shows two different figures on two boards and neither
 * desk can tell which is right.
 */

export type DirectCostKey =
  | "tripAllowance"
  | "returnWaybill"
  | "motorBoy"
  | "ticket"
  | "extraAllowance"
  | "bonus";

export type DirectCostItem = { label: string; key: DirectCostKey };

/** The six commitments, in the order the banner numbers them. */
export const DIRECT_COST_CATEGORIES: DirectCostItem[] = [
  { label: "Trip Allowance", key: "tripAllowance" },
  { label: "Return Waybill", key: "returnWaybill" },
  { label: "Motor Boy", key: "motorBoy" },
  { label: "Road Tickets", key: "ticket" },
  { label: "Contingency", key: "extraAllowance" },
  { label: "Trip Bonus", key: "bonus" },
];

/**
 * The table cell reads DOWN each column: the driver's own allowances on the
 * left, what the road costs on the right.
 */
export const COST_COLUMNS: DirectCostItem[][] = [
  [
    { label: "Trip Allowance", key: "tripAllowance" },
    { label: "Motor Boy", key: "motorBoy" },
    { label: "Contingency", key: "extraAllowance" },
  ],
  [
    { label: "Waybill", key: "returnWaybill" },
    { label: "Road Tickets", key: "ticket" },
    { label: "Bonus", key: "bonus" },
  ],
];

/** The previews read ACROSS, row by row. */
export const COST_PAIRS: DirectCostItem[][] = [
  [
    { label: "Trip Allowance", key: "tripAllowance" },
    { label: "Motor Boy Allowance", key: "motorBoy" },
  ],
  [
    { label: "Road Tickets", key: "ticket" },
    { label: "Return Waybill", key: "returnWaybill" },
  ],
  [
    { label: "Extra Contingency", key: "extraAllowance" },
    { label: "Bonus Allowance", key: "bonus" },
  ],
];

/** A cost line the Accounts desk added on top of the six committed categories. */
export type ExtraCost = { label: string; amount: number; at?: string; by?: string };

/** What the Accounts desk records when the money actually leaves. */
export type Disbursement = {
  paymentMethod?: string;
  bankRef?: string;
  officer?: string;
  status?: string;
  at?: string;
  by?: string;
};

/** The Transport Manager's endorsement of the cost sheet. */
export type VoucherDecision = {
  status?: string;
  by?: string;
  at?: string;
  note?: string | null;
};

/**
 * One dispatch's cost sheet.
 *
 * It lives on the trip's own `directCosts` JSON beside the fuel release and the
 * voucher decision, so nothing here can drift from the dispatch it describes.
 */
export type CostSheet = Partial<Record<DirectCostKey, number>> & {
  extras?: ExtraCost[];
  voucher?: VoucherDecision;
  disbursement?: Disbursement;
};

/** How the money can leave the office. The board prints these as "VIA …". */
export const PAYMENT_METHODS = ["Electronic Bank Transfer", "Petty Cash"] as const;

/** What the desk may record the payment as. */
export const DISBURSEMENT_STATUSES = [
  "Disbursed (Funds Released to Driver)",
  "Reconciled (Journey Concluded)",
] as const;

/** A dispatch nobody has paid yet. */
export const PENDING_DISBURSAL = "Pending Disbursal";

/**
 * The banner's one-liner on the Accounts side: what its six figures add up.
 *
 * The manager's banner totals the day he is authorising; the desk's totals every
 * dispatch carrying a sheet, which is the money it still owes.
 */
export const COST_SUBTITLE_ALL =
  "Aggregate across all dispatch: Trip Allowance, Return Waybill, motor boy, transit tickets, contingency and bonus.";

export const sheetOf = (trip: Trip): CostSheet => (trip.directCosts ?? {}) as CostSheet;

export const money = (value?: number) => formatMoney(Number(value ?? 0));

export const extrasOf = (sheet: CostSheet): ExtraCost[] =>
  Array.isArray(sheet.extras) ? sheet.extras : [];

/** Everything the dispatch is owed: the six commitments plus any added line. */
export const costTotal = (sheet: CostSheet) =>
  DIRECT_COST_CATEGORIES.reduce((total, c) => total + Number(sheet[c.key] ?? 0), 0) +
  extrasOf(sheet).reduce((total, line) => total + Number(line.amount ?? 0), 0);

/** `VD-99E3B8` — the voucher a dispatch is known by once it carries a cost sheet. */
export const voucherRef = (trip: Trip) =>
  `VD-${String(trip.id).replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export const dayLabel = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

/** `02 Sept 2026` — the date as the Accounts board writes it. */
export const longDay = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * The truck as the gate, the workshop and the manager read it off the vehicle:
 * the cap painted on the cab, its plate in brackets. Resolved through the app's
 * one roster pairing, so a truck is never labelled two ways on two boards.
 */
export const truckDetails = (trip: Trip) => {
  const label = displayCapPlateFromTrip(trip);
  if (label) return label;
  const plate = String(trip.truckReg ?? "").split("/")[0]?.trim() ?? "";
  return plate && !/^unassigned$/i.test(plate) ? plate : "—";
};

export const driverOf = (trip: Trip) => trip.driverName?.trim() || "—";

/** The board's second line under the total: how the money left the office. */
export function paymentMethodShort(method?: string) {
  const value = String(method ?? "").trim();
  if (!value) return "";
  if (/petty\s*cash/i.test(value)) return "VIA PETTY CASH";
  if (/transfer/i.test(value)) return "VIA BANK TRANSFER";
  if (/cheque|check/i.test(value)) return "VIA CHEQUE";
  return `VIA ${value.toUpperCase()}`;
}

/** Where a dispatch's money stands, as the board's pills say it. */
export function disbursalState(sheet: CostSheet): "Pending Disbursal" | "Disbursed" | "Reconciled" {
  const status = String(sheet.disbursement?.status ?? "");
  if (/reconcil/i.test(status)) return "Reconciled";
  if (/disburs|released|paid/i.test(status)) return "Disbursed";
  return PENDING_DISBURSAL;
}

/** A dispatch the Accounts desk has paid — i.e. one a voucher exists for. */
export const isDisbursed = (sheet: CostSheet) => disbursalState(sheet) !== PENDING_DISBURSAL;
