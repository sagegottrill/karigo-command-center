import { inPeriod, type PeriodRange } from "./period";
import type { DeptTone } from "./dashboard-departments";
import type { InventoryItem, InventoryMovement, WorkOrder } from "./types";

/**
 * The Transport Manager's parts & inventory view: what the store is worth, what
 * is moving and what is not, which trucks the parts money follows, and what has
 * to be bought before the workshop stops.
 *
 * The store's story lives in its ledger (`InventoryMovement`), and every tile
 * here is a read of that ledger rather than a second copy of the stock figures:
 *
 *  - **Valuation** prices the shelf at each line's last purchase price — the
 *    same rule the diesel tank uses. Lines never purchased are counted at their
 *    book price and named separately, so "₦4.1m in stock" never quietly blends
 *    "paid" with "typed in".
 *  - **Idle capital** is the part of the valuation in lines that have issued
 *    nothing in the window — money on a shelf.
 *  - **Consumption** is the Issue stream, grouped by part and by truck: what the
 *    workshop draws, and which vehicles it draws for.
 *  - **Vendor spend** is the Purchase stream, grouped by vendor: who the parts
 *    money actually goes to.
 *  - **The reorder list** is the stock table's own reorder levels against what
 *    is on the shelf, addressed to each line's supplier where one is known.
 *
 * A store with no ledger yet reports honestly: tiles read "—" and the board
 * says what would make each figure computable, instead of a confident zero.
 */

export type MovementRow = {
  id: string;
  item: string;
  sku: string;
  itemId: string;
  kind: InventoryMovement["kind"];
  quantity: number;
  unitCost: number | null;
  value: number | null;
  vendor: string;
  truckReg: string;
  note: string;
  actedBy: string;
  actedAt: string;
  tone: DeptTone;
};

export type StoreLineRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  reorderLevel: number;
  unitCost: number;
  location: string;
  supplier: string;
  status: InventoryItem["status"];
  /** stock × unit cost — what this line contributes to the shelf's value. */
  value: number;
  /** Issued in the window: units and their cost at issue time. */
  issuedUnits: number;
  issuedValue: number;
  /** Purchased in the window: units and their cost at purchase time. */
  purchasedUnits: number;
  purchasedValue: number;
  /** Has any movement ever been recorded for this line. */
  hasLedger: boolean;
  tone: DeptTone;
};

export type ReorderRow = {
  id: string;
  item: string;
  sku: string;
  stock: number;
  reorderLevel: number;
  toBuy: number;
  unitCost: number;
  estimatedCost: number;
  supplier: string;
  status: InventoryItem["status"];
};

export type PartsOversight = {
  read: boolean;
  valuation: {
    /** stock × last purchase price (book price where never purchased). */
    total: number;
    /** The part of `total` priced from actual purchases. */
    priced: number;
    /** Lines whose value rests on a typed-in price, not a purchase. */
    unpricedLines: StoreLineRow[];
    lines: number;
    units: number;
  };
  idle: {
    /** Value sitting in lines that issued nothing in the window. */
    value: number;
    lines: number;
    list: StoreLineRow[];
  };
  consumption: {
    units: number;
    value: number;
    /** Issues in the window. */
    events: number;
    /** The trucks the parts went to, costliest first. */
    byTruck: { truck: string; units: number; value: number }[];
    /** The parts drawn, costliest first. */
    byPart: { part: string; units: number; value: number }[];
    list: MovementRow[];
  };
  purchases: {
    units: number;
    value: number;
    events: number;
    byVendor: { vendor: string; units: number; value: number; lines: number }[];
    list: MovementRow[];
  };
  health: {
    ok: number;
    low: number;
    out: number;
  };
  reorder: {
    count: number;
    /** Estimated cost of covering every shortfall to its reorder level. */
    estimatedCost: number;
    /** How many of the lines to buy can be addressed to a named supplier. */
    addressed: number;
    list: ReorderRow[];
  };
  /** Open jobs that name an item the store cannot cover — what stops the shop. */
  stops: {
    count: number;
    list: { job: string; truck: string; defect: string; status: string }[];
  };
};

/** `P073 (APP857YL) / B039` and `p073` are the same truck. */
function truckKey(value: unknown): string {
  return (
    String(value ?? "")
      .split("/")[0]
      ?.replace(/[^0-9a-z]/gi, "")
      .toUpperCase() ?? ""
  );
}

const movementTone = (kind: InventoryMovement["kind"]): DeptTone => {
  switch (kind) {
    case "Purchase":
      return "green";
    case "Issue":
      return "blue";
    case "Write-off":
      return "red";
    default:
      return "grey";
  }
};

export function buildPartsOversight(input: {
  items: InventoryItem[];
  movements: InventoryMovement[];
  openJobs: WorkOrder[];
  range: PeriodRange;
  now: Date;
}): PartsOversight {
  const { items, movements, openJobs, range } = input;

  const readRow = (m: InventoryMovement): MovementRow => ({
    id: m.id,
    item: m.itemName,
    sku: m.sku,
    itemId: m.itemId,
    kind: m.kind,
    quantity: m.quantity,
    unitCost: m.unitCost,
    value: m.value,
    vendor: m.vendor,
    truckReg: m.truckReg,
    note: m.note,
    actedBy: m.actedBy,
    actedAt: m.actedAt,
    tone: movementTone(m.kind),
  });

  const issues = movements.filter((m) => m.kind === "Issue" && inPeriod(m.actedAt, range));
  const purchases = movements.filter((m) => m.kind === "Purchase" && inPeriod(m.actedAt, range));

  /* -------------------------------------------------------- the shelf ----- */

  const issuedByItem = new Map<string, { units: number; value: number }>();
  for (const m of issues) {
    const entry = issuedByItem.get(m.itemId) ?? { units: 0, value: 0 };
    entry.units += Math.abs(m.quantity);
    entry.value += Math.abs(m.value ?? 0);
    issuedByItem.set(m.itemId, entry);
  }
  const purchasedByItem = new Map<string, { units: number; value: number }>();
  for (const m of purchases) {
    const entry = purchasedByItem.get(m.itemId) ?? { units: 0, value: 0 };
    entry.units += m.quantity;
    entry.value += m.value ?? 0;
    purchasedByItem.set(m.itemId, entry);
  }

  const itemsWithLedger = new Set(movements.map((m) => m.itemId));

  const lines: StoreLineRow[] = items.map((item) => {
    const issued = issuedByItem.get(item.id) ?? { units: 0, value: 0 };
    const purchased = purchasedByItem.get(item.id) ?? { units: 0, value: 0 };
    const tone: DeptTone =
      item.status === "Out of Stock" || item.stock <= 0
        ? "red"
        : item.status === "Low Stock" || item.stock <= item.reorderLevel
          ? "amber"
          : "green";
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      category: item.category,
      stock: item.stock,
      reorderLevel: item.reorderLevel,
      unitCost: item.unitCost,
      location: item.location,
      supplier: item.supplier,
      status: item.status,
      value: item.stock * item.unitCost,
      issuedUnits: issued.units,
      issuedValue: issued.value,
      purchasedUnits: purchased.units,
      purchasedValue: purchased.value,
      hasLedger: itemsWithLedger.has(item.id),
      tone,
    };
  });

  const totalValue = lines.reduce((total, line) => total + line.value, 0);
  const pricedValue = lines
    .filter((line) => line.hasLedger || line.purchasedValue > 0)
    .reduce((total, line) => total + line.value, 0);
  const unpricedLines = lines
    .filter((line) => !line.hasLedger && line.value > 0)
    .sort((a, b) => b.value - a.value);

  /* ---------------------------------------------------- idle capital ------ */

  /**
   * A line is idle when it issued nothing in the window. With no ledger at all
   * nothing can be called idle — an empty report is not evidence of idleness.
   */
  const idleLines =
    movements.length === 0
      ? []
      : lines
          .filter((line) => line.issuedUnits === 0 && line.value > 0)
          .sort((a, b) => b.value - a.value);
  const idleValue = idleLines.reduce((total, line) => total + line.value, 0);

  /* ------------------------------------------------------ consumption ----- */

  const groupMovement = <K extends string | null>(
    rows: InventoryMovement[],
    keyOf: (m: InventoryMovement) => K | null,
  ) => {
    const groups = new Map<string, { label: K; units: number; value: number }>();
    for (const m of rows) {
      const label = keyOf(m);
      if (!label) continue;
      const entry = groups.get(label) ?? { label, units: 0, value: 0 };
      entry.units += Math.abs(m.quantity);
      entry.value += Math.abs(m.value ?? 0);
      groups.set(label, entry);
    }
    return [...groups.values()]
      .map((g) => ({ ...g, value: Math.round(g.value) }))
      .sort((a, b) => b.value - a.value);
  };

  const byTruck = groupMovement(issues, (m) => {
    const key = truckKey(m.truckReg);
    return key || null;
  }).map((g) => ({ truck: g.label, units: g.units, value: g.value }));

  const byPart = groupMovement(issues, (m) => m.itemName || m.sku || null).map((g) => ({
    part: g.label,
    units: g.units,
    value: g.value,
  }));

  /* ---------------------------------------------------- vendor spend ------ */

  const vendorGroups = new Map<string, { units: number; value: number; lines: Set<string> }>();
  for (const m of purchases) {
    const vendor = (m.vendor || "").trim();
    if (!vendor) continue;
    const entry = vendorGroups.get(vendor) ?? { units: 0, value: 0, lines: new Set<string>() };
    entry.units += m.quantity;
    entry.value += m.value ?? 0;
    entry.lines.add(m.itemId);
    vendorGroups.set(vendor, entry);
  }
  const byVendor = [...vendorGroups.entries()]
    .map(([vendor, entry]) => ({
      vendor,
      units: entry.units,
      value: Math.round(entry.value),
      lines: entry.lines.size,
    }))
    .sort((a, b) => b.value - a.value);

  /* ------------------------------------------------------- the reorder ---- */

  const reorderRows: ReorderRow[] = lines
    .filter((line) => line.stock <= line.reorderLevel && line.reorderLevel > 0)
    .map((line) => {
      const toBuy = Math.max(1, line.reorderLevel * 2 - line.stock);
      return {
        id: line.id,
        item: line.name,
        sku: line.sku,
        stock: line.stock,
        reorderLevel: line.reorderLevel,
        toBuy,
        unitCost: line.unitCost,
        estimatedCost: toBuy * line.unitCost,
        supplier: line.supplier,
        status: line.status,
      };
    })
    .sort((a, b) => b.estimatedCost - a.estimatedCost);

  /* ------------------------------------------ what stops the workshop ----- */

  /**
   * An open job in "Awaiting Parts" is the workshop saying it cannot proceed.
   * Whether the store can cover it is the requisition queue's question — the
   * list here is simply the jobs themselves, costliest impediment first.
   */
  const stops = openJobs
    .filter((job) => job.status === "Awaiting Parts")
    .map((job) => ({
      job: String(job.id ?? ""),
      truck: String(job.truckReg || "—"),
      defect: String(job.defect || "—"),
      status: job.status,
    }));

  return {
    read: true,
    valuation: {
      total: totalValue,
      priced: pricedValue,
      unpricedLines,
      lines: lines.length,
      units: lines.reduce((total, line) => total + line.stock, 0),
    },
    idle: { value: idleValue, lines: idleLines.length, list: idleLines },
    consumption: {
      units: issues.reduce((total, m) => total + Math.abs(m.quantity), 0),
      value: Math.round(issues.reduce((total, m) => total + Math.abs(m.value ?? 0), 0)),
      events: issues.length,
      byTruck,
      byPart,
      list: issues
        .map(readRow)
        .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1))
        .slice(0, 50),
    },
    purchases: {
      units: purchases.reduce((total, m) => total + m.quantity, 0),
      value: Math.round(purchases.reduce((total, m) => total + (m.value ?? 0), 0)),
      events: purchases.length,
      byVendor,
      list: purchases
        .map(readRow)
        .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1))
        .slice(0, 50),
    },
    health: {
      ok: lines.filter((l) => l.tone === "green").length,
      low: lines.filter((l) => l.tone === "amber").length,
      out: lines.filter((l) => l.tone === "red").length,
    },
    reorder: {
      count: reorderRows.length,
      estimatedCost: Math.round(reorderRows.reduce((total, row) => total + row.estimatedCost, 0)),
      addressed: reorderRows.filter((row) => row.supplier).length,
      list: reorderRows,
    },
    stops: { count: stops.length, list: stops },
  } satisfies PartsOversight;
}
