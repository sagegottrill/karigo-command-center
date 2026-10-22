import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Package, Plus, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import {
  CustomRangePicker,
  PeriodFilter,
  SummaryBar,
  inWindow,
  resolvePeriod,
  useCustomRange,
} from "@/lib/fleetopsx/report-kit";
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
import { isStorekeeper } from "@/lib/fleetopsx/admin-departments";
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
    // Parts & Inventory is ITS OWN department: its own roles, plus the TM who
    // audits it. Engineering reads the parts it raised through the same board;
    // the STOREHOUSE (Inventory) works the desk, not this catalog.
    const allowed = [
      "Parts & Store",
      "Parts and Store",
      "Inventory",
      // PROCUREMENT is the buying desk of the same loop (PRD §5: when the shelf
      // cannot cover an approved request, it escalates here and buys the restock
      // that fills it back) — so it sits in the store portal, never in the
      // manager's chrome.
      "Procurement",
      ...ENGINEERING_ACCESS_ROLES,
    ];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: PartsAndStore,
});

const STOCK_FILTERS = ["All", "In Stock", "Low Stock", "Out of Stock"] as const;
const REQUEST_FILTERS = [
  "All",
  "Pending",
  "Awaiting HOE Review",
  "Awaiting Admin Approval",
  "Awaiting Pickup",
  "Awaiting Procurement",
  "Released",
  "Rejected",
] as const;

const statusPill = (status: string) => {
  switch (status) {
    case "Out of Stock":
      return "bg-[#ED351D] text-white";
    case "Low Stock":
      return "bg-[#F99E1F] text-white";
    case "Pending":
      return "bg-[#F99E1F] text-white";
    case "Awaiting HOE Review":
      return "bg-[#F99E1F] text-white";
    case "Awaiting Admin Approval":
      return "bg-[#2F6BD8] text-white";
    case "Awaiting Pickup":
      return "bg-[#2F6BD8] text-white";
    case "Awaiting Procurement":
      return "bg-[#2F6BD8] text-white";
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

  /**
   * The bulk intake: the storehouse's existing .xlsx ledger, 2,000+ lines
   * deep, in ONE upload. The sheet is parsed in the browser (no server round
   * trip per row), shown back as a preview the attendant can read, and only
   * then sent to /api/inventory/import — which upserts by SKU, so a re-upload
   * corrects lines rather than duplicating them.
   */
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);

  /** One parsed store line, with what the row is missing attached for the preview. */
  type ImportRow = {
    name: string;
    sku: string;
    stock: number;
    unitCost: number;
    reorderLevel: number;
    category: string;
    location: string;
    supplier: string;
    vehicleCompatibility: string;
    warnings: string[];
  };

  /** Header matching: a legacy sheet calls the same column ten different names. */
  const pickField = (
    row: Record<string, unknown>,
    patterns: readonly RegExp[],
  ): unknown => {
    for (const pattern of patterns) {
      for (const [key, value] of Object.entries(row)) {
        if (pattern.test(String(key).toLowerCase().replace(/[^a-z]/g, ""))) {
          if (value !== "" && value != null) return value;
        }
      }
    }
    return undefined;
  };

  const HEADER_PATTERNS = {
    name: [/name/, /description/, /part/, /item/],
    sku: [/sku/, /code/, /partno/, /partnumber/, /itemcode/],
    stock: [/quantity/, /qty/, /stock/, /onhand/, /count/],
    unitCost: [/unitcost/, /unitprice/, /price/, /cost/, /rate/],
    reorderLevel: [/reorder/, /threshold/, /minimum/, /min/, /alert/],
    category: [/category/, /type/, /class/, /group/],
    location: [/location/, /store/, /shelf/, /section/, /bin/],
    supplier: [/supplier/, /vendor/],
    vehicleCompatibility: [/compatibility/, /vehicle/, /fitment/, /applicable/],
  } as const;

  type HeaderField = keyof typeof HEADER_PATTERNS;

  const parseImportFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("The workbook has no sheets.");
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("The first sheet is empty.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const rows: ImportRow[] = [];
      let invalid = 0;
      raw.forEach((entry, index) => {
        const str = (field: HeaderField) => String(pickField(entry, HEADER_PATTERNS[field]) ?? "").trim();
        const num = (field: HeaderField) => {
          const value = pickField(entry, HEADER_PATTERNS[field]);
          const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
          return Number.isFinite(n) ? n : 0;
        };
        const name = str("name");
        if (!name) {
          invalid += 1;
          return;
        }
        const warnings: string[] = [];
        let sku = str("sku");
        if (!sku) {
          // A legacy line without a SKU still deserves to enter the store —
          // the ledger's identity is generated here and stays stable.
          sku = `AUTO-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}-${index + 1}`.toUpperCase();
          warnings.push("SKU generated");
        }
        const stock = Math.trunc(num("stock"));
        const unitCost = num("unitCost");
        if (stock <= 0) warnings.push("no quantity — stored at 0");
        if (unitCost <= 0) warnings.push("no unit cost — priced at ₦0");
        rows.push({
          name,
          sku,
          stock,
          unitCost,
          reorderLevel: Math.trunc(num("reorderLevel")) || 5,
          category: str("category") || "General",
          location: str("location") || "Main Store",
          supplier: str("supplier"),
          vehicleCompatibility: str("vehicleCompatibility"),
          warnings,
        });
      });
      if (rows.length === 0)
        throw new Error(
          invalid > 0
            ? "No row carried a part name — check the column headings."
            : "The sheet is empty.",
        );
      setImportFileName(file.name);
      setImportRows(rows);
      if (invalid > 0)
        toast.message(`${invalid} empty ${invalid === 1 ? "row" : "rows"} skipped before the preview.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be read.");
    }
  };

  const commitImport = async () => {
    if (!importRows?.length) return;
    setImporting(true);
    try {
      const result = await inventoryService.importItems(
        importRows.map(({ warnings: _w, ...row }) => row),
      );
      toast.success(
        `Import saved — ${result.created} parts created, ${result.updated} updated${
          result.skipped.length ? `, ${result.skipped.length} skipped` : ""
        }.`,
      );
      setImportOpen(false);
      setImportRows(null);
      setImportFileName("");
      void load().catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The import was not saved.");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const roles = authService.getRoles();
    // The store is kept by the STOREHOUSE itself (PRD §1/§2: the bulk Excel
    // intake, manual entries and minimum thresholds are the storehouse's, not
    // Engineering's) plus Engineering and the Head of Inventory; the Transport
    // Manager reads the board as an audit. Parts & Store is its own department
    // — its accounts must NEVER get a view-only shelf on their own board by a
    // stale check that predates the split.
    setCanEdit(
      rolesCanWorkOnTrucks() ||
        isStorekeeper() ||
        roles.some((r: string) => /head of inventory|inventory manager/i.test(r)),
    );
    const allowed = [
      "Parts & Store",
      "Parts and Store",
      "Inventory",
      // PROCUREMENT is the buying desk of the same loop (PRD §5: when the shelf
      // cannot cover an approved request, it escalates here and buys the restock
      // that fills it back) — so it sits in the store portal, never in the
      // manager's chrome.
      "Procurement",
      ...ENGINEERING_ACCESS_ROLES,
    ];
    if (!roles.some((r: string) => allowed.includes(r))) {
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

  /*
   * THE APPROVAL THE WORKSHOP WAITS ON. The TM decides a part request wherever
   * he meets the queue — his dashboard or this board — so "he has no control in
   * Parts & Inventory" stops being true of the module itself. Approving hands
   * the ticket to the store floor; rejecting must name a reason.
   */
  const canDecide = authService.getRoles().includes("Transport Manager");

  const decide = async (request: InventoryRequisition, approve: boolean) => {
    // The chain runs HOE → TM → store: the Transfer Manager only decides what
    // the Head of Engineering validated (or a legacy Pending ticket). Anything
    // still with HOE, or already past this desk, is refused with its reason.
    if (request.status === "Awaiting HOE Review") {
      toast.error("This request is still with the Head of Engineering for review.");
      return;
    }
    if (request.status !== "Pending" && request.status !== "Awaiting Admin Approval") {
      toast.error("This request has already moved past the approval desk.");
      return;
    }
    let note = "";
    if (!approve) {
      note = (
        window.prompt(
          `Why is "${request.part}" for ${request.truckReg} rejected? Attached to the record.`,
        ) ?? ""
      ).trim();
      if (!note) return;
    }
    try {
      if (approve) {
        await inventoryService.approveRequisition({
          id: request.id,
          itemId: request.itemId,
          quantity: request.quantity,
        });
      } else {
        await inventoryService.rejectRequisition(request.id, note);
      }
      toast.success(
        approve
          ? `${request.part} approved for ${request.truckReg} — handed to the store floor.`
          : `${request.part} rejected for ${request.truckReg}.`,
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The decision was not saved.");
    }
  };

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

  /*
   * THE APPROVAL DESK, as its own card. The Transport Manager's queue used to
   * hide inside the requisition table's rows — a viewer reading the module
   * could not see WHERE his decision happens. It stands at the top of the page
   * now: the workshop's asks with his Approve/Reject on them, the queue's
   * count as a badge, and the latest decisions underneath so the desk is
   * auditable at a glance.
   */
  const pendingQueue = useMemo(
    () =>
      requests
        .filter((r) => r.status === "Pending" || r.status === "Awaiting Admin Approval")
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [requests],
  );

  const recentDecisions = useMemo(
    () =>
      requests
        .filter((r) => r.status !== "Pending")
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 4),
    [requests],
  );

  /** Every non-pending state is an approval outcome — only the wording moves. */
  const decisionWord = (status: string) =>
    status === "Rejected"
      ? "Rejected"
      : status === "Released"
        ? "Approved · collected"
        : status === "Awaiting Procurement"
          ? "Approved · to buy"
          : status === "Awaiting Admin Approval"
            ? "HOE validated · awaiting TM"
            : status === "Awaiting HOE Review"
              ? "Awaiting HOE review"
              : "Approved · awaiting pickup";

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

  /** The store's requisition window — presets or a custom 1 – 15 Sept pair. */
  const [requestPeriod, setRequestPeriod] = useState<string>("All time");
  const requestCustom = useCustomRange();
  const requestRange = useMemo(
    () => resolvePeriod(requestPeriod, requestCustom.custom),
    [requestPeriod, requestCustom.custom],
  );

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => requestFilter === "All" || r.status === requestFilter)
      .filter((r) => inWindow(r.date, requestRange))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [requests, requestFilter, requestRange]);

  /** The shelf's footer: lines, units on the shelf and what they are worth. */
  const stockSummary = (
    <SummaryBar
      items={[
        { label: "Lines", value: String(filteredItems.length) },
        {
          label: "Units",
          value: String(filteredItems.reduce((s, i) => s + Number(i.stock ?? 0), 0)),
        },
        {
          label: "Stock value",
          value: formatNairaFull(
            filteredItems.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.unitCost ?? 0), 0),
          ),
        },
        {
          label: "Low",
          value: String(filteredItems.filter((i) => i.status === "Low Stock").length),
        },
        {
          label: "Out of stock",
          value: String(filteredItems.filter((i) => i.status === "Out of Stock").length),
        },
      ]}
    />
  );

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredItems.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  /** The requisitions' footer: asks, value and what the TM still owes a decision. */
  const requestSummary = (
    <SummaryBar
      items={[
        { label: "Requests", value: String(filteredRequests.length) },
        {
          label: "Units asked",
          value: String(filteredRequests.reduce((s, r) => s + Number(r.quantity ?? 0), 0)),
        },
        {
          label: "Estimated value",
          value: formatNairaFull(
            filteredRequests.reduce(
              (s, r) => s + Number(r.quantity ?? 0) * Number(r.unitCost ?? 0),
              0,
            ),
          ),
        },
        {
          label: "Pending",
          value: String(filteredRequests.filter((r) => r.status === "Pending").length),
        },
      ]}
    />
  );

  /**
   * Released stock, rolled up part by part: everything the shelf signed out
   * in the same window the requests read — how many releases, how many units,
   * which truck drew it last and what each part cost the fleet. A legacy row
   * without a posted release value is priced at the line's unit cost — and a
   * row without either stays in the count as an unpriced release.
   */
  const releasedGroups = useMemo(() => {
    const released = requests
      .filter((r) => r.status === "Released" && inWindow(r.date, requestRange))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const byPart = new Map<
      string,
      {
        name: string;
        last: InventoryRequisition;
        releases: number;
        units: number;
        value: number;
      }
    >();
    for (const r of released) {
      const key = r.part.trim().toLowerCase();
      const units = Number(r.releasedQty ?? r.quantity ?? 0);
      const value = Number(r.releasedValue ?? units * Number(r.unitCost ?? 0));
      const group = byPart.get(key);
      if (group) {
        group.releases += 1;
        group.units += units;
        group.value += value;
      } else {
        byPart.set(key, { name: r.part, last: r, releases: 1, units, value });
      }
    }
    return Array.from(byPart.values());
  }, [requests, requestRange]);

  /** The released roll-up's footer: parts moved, releases, units and money out. */
  const releasedSummary = (
    <SummaryBar
      items={[
        { label: "Parts moved", value: String(releasedGroups.length) },
        {
          label: "Releases",
          value: String(releasedGroups.reduce((s, g) => s + g.releases, 0)),
        },
        {
          label: "Units released",
          value: String(releasedGroups.reduce((s, g) => s + g.units, 0)),
        },
        {
          label: "Value released",
          value: formatNairaFull(releasedGroups.reduce((s, g) => s + g.value, 0)),
        },
      ]}
    />
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
        <DepartmentTabs department="parts" />
        <div className="min-h-[60vh] bg-[#F1F2F4]">
          <FigmaLoadingState label="Loading the store…" />
        </div>
      </>
    );
  }

  return (
    <>
      {/*
       * The STOREHOUSE's own modules. This page printed Engineering's tab strip
       * (Work Orders / Truck Availability / Repair Spend) for every viewer,
       * so the Transport Manager's Parts & Inventory page looked like the
       * workshop — the tabs now name the department he is actually standing in.
       */}
      <DepartmentTabs department="parts" />
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
                setImportRows(null);
                setImportFileName("");
                setImportOpen(true);
              }}
              className="flex h-8 items-center gap-1.5 rounded border border-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
            >
              <Upload className="size-4" strokeWidth={1.75} />
              Import Excel
            </button>
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

        {/* The TM's approval desk — last on the page: it is the one store
            board whose primary subject is the DECISION, and it belongs to the
            Transport Manager. The store's own content (its shelf, its
            releases) reads first. */}
        <div className="order-4 w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5E9] pb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[16px] font-medium text-[#1B2432]">Transport Manager Approval</h3>
              {counts.pending > 0 ? (
                <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
                  {counts.pending}
                </span>
              ) : (
                <span className="rounded-[4px] bg-[#EAF7F1] px-2 py-0.5 text-[11px] font-semibold text-[#0A7F58]">
                  Clear
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#5C6470]">
              {canDecide
                ? "Your release is the store floor's authority to hand parts over."
                : "The Transport Manager approves these — the store releases only what he has approved."}
            </p>
          </div>

          {pendingQueue.length === 0 ? (
            <FigmaEmptyState
              title="Nothing is waiting on your decision"
              body="Every parts request has been decided. A new ask from the workshop appears here the moment it is raised."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {pendingQueue.map((request) => {
                const lines = formatDateLines(request.date);
                return (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[8px] border border-[#E2E5E9] bg-[#F1F2F4]/60 px-4 py-3"
                  >
                    <span className="min-w-[92px] text-[12px] leading-tight text-[#5C6470]">
                      {lines.date}
                      {lines.time ? <span className="block text-[11px]">{lines.time}</span> : null}
                    </span>
                    <span className="min-w-[150px] text-[14px] font-medium text-[#1B2432]">
                      {truckOf(request.truckReg)}
                    </span>
                    <span className="min-w-[200px] flex-1">
                      <span className="block text-[14px] text-[#344256]">
                        {request.part} × {request.quantity}
                      </span>
                      {request.reason ? (
                        <span className="block text-[11px] text-[#5C6470]">{request.reason}</span>
                      ) : null}
                    </span>
                    <span className="min-w-[110px] text-[13px] tabular-nums text-[#344256]">
                      {formatNairaFull(request.quantity * request.unitCost)}
                    </span>
                    <span className="min-w-[120px] text-[12px] text-[#5C6470]">
                      {request.mechanic || "Unassigned"}
                    </span>
                    {canDecide ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void decide(request, true)}
                          className="h-8 rounded bg-[#34C759] px-4 text-[12px] font-semibold text-white hover:bg-[#2fae50]"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void decide(request, false)}
                          className="h-8 rounded bg-[#ED351D] px-4 text-[12px] font-semibold text-white hover:bg-[#d62e19]"
                        >
                          Reject
                        </button>
                      </span>
                    ) : (
                      <span className="rounded-[4px] bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium text-[#5C6470]">
                        Awaiting the Transport Manager
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {recentDecisions.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#E2E5E9] pt-3">
              <span className="text-[11px] uppercase tracking-[0.4px] text-[#9CA3AF]">
                Recently decided
              </span>
              {recentDecisions.map((request) => (
                <span key={request.id} className="text-[12px] text-[#5C6470]">
                  <span className="font-medium text-[#344256]">{request.part}</span> ·{" "}
                  {request.truckReg || "—"} —{" "}
                  <span
                    className={cn(
                      "font-medium",
                      request.status === "Rejected" ? "text-[#ED351D]" : "text-[#0A7F58]",
                    )}
                  >
                    {decisionWord(request.status)}
                  </span>
                  {request.decisionNote ? ` — “${request.decisionNote}”` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* What the shop asked for — the workshop's pipeline, after the shelf
            and its own store's outbound releases. */}
        <div className="order-3 w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[16px] font-medium text-[#1B2432]">Parts requested</h3>
              <p className="text-[12px] text-[#5C6470]">
                {counts.pending} awaiting the Transport Manager ·{" "}
                {formatNairaFull(counts.pendingValue)} in pending requests
              </p>
            </div>
            <PeriodFilter
              value={requestPeriod}
              onChange={setRequestPeriod}
              custom={requestCustom.custom}
              customOpen={requestCustom.open}
              onToggleCustom={requestCustom.setOpen}
            >
              <CustomRangePicker
                custom={requestCustom.custom}
                onSet={requestCustom.set}
                onClear={requestCustom.clear}
              />
            </PeriodFilter>
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
                      <span className={cell}>{request.quantity.toLocaleString("en-NG")}</span>
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
                      {/*
                       * THE TRANSPORT MANAGER'S DECISION — on the module, not only
                       * on the dashboard. The queue is real wherever he opens it:
                       * approving releases the stock to the floor, rejecting has
                       * to carry a reason the workshop can read.
                       */}
                      {canDecide && request.status === "Pending" ? (
                        <div className="col-span-3 flex items-center gap-2 pl-1">
                          <button
                            type="button"
                            onClick={() => void decide(request, true)}
                            className="h-7 rounded bg-[#34C759] px-3 text-[11px] font-semibold text-white hover:bg-[#2fae50]"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(request, false)}
                            className="h-7 rounded bg-[#ED351D] px-3 text-[11px] font-semibold text-white hover:bg-[#d62e19]"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            {filteredRequests.length > 0 ? requestSummary : null}
          </div>
        </div>

        {/* ------------------------------------ what actually left the shelf --- */}
        {/* Order 2: the store's outbound story sits under its holdings. */}
        {
          /* Same board, third answer: the shop asked (above), the shelf holds
           * (below), and here is what the shelf has actually handed over —
           * grouped part by part, with the trucks, mechanics and money behind
           * every signed-out unit. It reads the same period window as the
           * requests above. Storekeepers and the Transport Manager both see
           * it; only they may approve, so only they may also edit.
           */
        }
        {/* Order 2: the store's outbound story sits under its holdings. */}
        <div className="order-2 w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[16px] font-medium text-[#1B2432]">Released from the store</h3>
              <p className="text-[12px] text-[#5C6470]">
                Goods consumed by the workshop, rolled up part by part — the releases, the
                units signed out and what each part cost the fleet · same window as the
                requests above
              </p>
            </div>
            <PeriodFilter
              value={requestPeriod}
              onChange={setRequestPeriod}
              custom={requestCustom.custom}
              customOpen={requestCustom.open}
              onToggleCustom={requestCustom.setOpen}
            >
              <CustomRangePicker
                custom={requestCustom.custom}
                onSet={requestCustom.set}
                onClear={requestCustom.clear}
              />
            </PeriodFilter>
            <div className="ml-auto">
              <ExportMenu
                label="Export"
                rows={releasedGroups.length}
                title="Parts & Store — Released from the store"
                fileNameBase="store-releases"
                csv={() =>
                  [
                    [
                      "Part",
                      "Releases",
                      "Units Released",
                      "Value Released",
                      "Cost (each)",
                      "Last Truck",
                      "Mechanic",
                      "Released By",
                      "Last Released",
                    ],
                    ...releasedGroups.map((g) => [
                      g.name,
                      String(g.releases),
                      String(g.units),
                      String(g.value),
                      String(g.last.unitCost ?? ""),
                      g.last.truckReg,
                      g.last.mechanic,
                      g.last.pickedBy ?? "",
                      g.last.handoffAt ?? g.last.date,
                    ]),
                  ]
                    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
                    .join("\n")
                }
                xlsx={() => ({
                  headers: [
                    "Part",
                    "Releases",
                    "Units Released",
                    "Value Released (₦)",
                    "Cost (each) (₦)",
                    "Last Truck",
                    "Mechanic",
                    "Released By",
                    "Last Released",
                  ],
                  rows: releasedGroups.map((g) => [
                    g.name,
                    g.releases,
                    g.units,
                    g.value,
                    g.last.unitCost ?? "",
                    g.last.truckReg,
                    g.last.mechanic,
                    g.last.pickedBy ?? "",
                    g.last.handoffAt ?? g.last.date,
                  ]),
                  sheet: "Store releases",
                })}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[minmax(0,1.5fr)_110px_140px_120px_150px_130px_130px_110px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {[
                  "Part",
                  "Units Released",
                  "Value Released",
                  "Cost (each)",
                  "Last Truck",
                  "Mechanic",
                  "Released By",
                  "Last Released",
                ].map((heading) => (
                  <span
                    key={heading}
                    className="text-[13px] font-medium uppercase tracking-[0.4px] text-[#5C6470]"
                  >
                    {heading}
                  </span>
                ))}
              </div>

              {releasedGroups.length === 0 ? (
                <FigmaEmptyState
                  title="Nothing released yet"
                  body="When the store hands parts over and the mechanic signs, every release lands here — grouped by part with the units, trucks and cost of the goods consumed."
                />
              ) : (
                releasedGroups.map((group, index) => {
                  const released = formatDateLines(group.last.handoffAt ?? group.last.date);
                  const machine = displayHeadCap(
                    heads.find(
                      (h) =>
                        h.registration.trim().toLowerCase() ===
                          String(group.last.truckReg ?? "").trim().toLowerCase() ||
                        (displayHeadCap(h) || h.number).trim().toLowerCase() ===
                          String(group.last.truckReg ?? "").trim().toLowerCase(),
                    ) ?? ({} as TruckHead),
                  );
                  return (
                    <div
                      key={group.name.toLowerCase()}
                      className={cn(
                        "grid grid-cols-[minmax(0,1.5fr)_110px_140px_120px_150px_130px_130px_110px] items-center gap-4 py-[13px]",
                        index < releasedGroups.length - 1 && "border-b border-[#E2E5E9]",
                      )}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[14px] text-[#344256]">{group.name}</span>
                        <span className="text-[11px] text-[#5C6470]">
                          {group.releases} release{group.releases === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className={cell}>{group.units.toLocaleString("en-NG")}</span>
                      <span className={cell}>{formatNairaFull(group.value)}</span>
                      <span className={quiet}>
                        {group.last.unitCost ? formatNairaFull(group.last.unitCost) : "—"}
                      </span>
                      <span className="flex flex-col gap-0.5 text-[14px] text-[#344256]">
                        <span>{machine || truckOf(group.last.truckReg)}</span>
                        <span className="text-[11px] text-[#5C6470]">
                          {group.last.truckReg || "—"}
                        </span>
                      </span>
                      <span className={quiet}>{group.last.mechanic || "—"}</span>
                      <span className={quiet}>{group.last.pickedBy || "—"}</span>
                      <span className="flex flex-col gap-0.5 text-[13px] leading-tight text-[#5C6470]">
                        <span>{released.date}</span>
                        {released.time ? <span className="text-[11px]">{released.time}</span> : null}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {releasedGroups.length > 0 ? releasedSummary : null}
          </div>
        </div>

        {/* ------------------------------------------------- the shelf first --- */}
        {
          /* Order 1: the inventory itself — Part, SKU, Category, Unit Cost,
           * Stock, Reorder At — is the first thing this page shows. The critic
           * was right: a store opens on what it HOLDS, not on the approval
           * machinery around how parts move.
           */
        }
        <div className="order-1 w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
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
            <ExportMenu
              label="Export"
              rows={filteredItems.length}
              title="Parts & Store — Inventory Ledger"
              fileNameBase="inventory-ledger"
              csv={() =>
                [
                  ["Part", "SKU", "Category", "Unit Cost", "Stock", "Reorder At", "Total Value", "Location", "Status"],
                  ...filteredItems.map((i) => [
                    i.name,
                    i.sku,
                    i.category,
                    String(i.unitCost),
                    String(i.stock),
                    String(i.reorderLevel),
                    String(i.stock * i.unitCost),
                    i.location,
                    i.status,
                  ]),
                ]
                  .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
                  .join("\n")
              }
              xlsx={() => ({
                headers: ["Part", "SKU", "Category", "Unit Cost (₦)", "Stock", "Reorder At", "Total Value (₦)", "Location", "Status"],
                rows: filteredItems.map((i) => [
                  i.name,
                  i.sku,
                  i.category,
                  i.unitCost,
                  i.stock,
                  i.reorderLevel,
                  i.stock * i.unitCost,
                  i.location,
                  i.status,
                ]),
                sheet: "Inventory Ledger",
              })}
            />
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
                    <span className={cn(cell, item.stock <= item.reorderLevel && "text-[#B26A00]")}>{item.stock.toLocaleString("en-NG")}
                      </span>
                    <span className={quiet}>{item.reorderLevel.toLocaleString("en-NG")}</span>
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

          {filteredItems.length > 0 ? stockSummary : null}

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

      {/* ------------------------------------------------ bulk Excel import */}
      {importOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Import Excel"
          onClick={() => !importing && setImportOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-[720px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] pb-3">
              <h3 className="text-[18px] font-medium leading-6 text-[#1B2432]">
                Import the store's Excel ledger
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                One upload, however many lines. The .xlsx is read in the browser, shown back here
                for a look, then saved — existing SKUs are updated in place, new SKUs are created.
              </p>
            </div>

            {!importRows ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[#1B2432] bg-[#F7F8FA] px-4 py-10 text-center">
                <FileSpreadsheet className="size-7 text-[#1B2432]" strokeWidth={1.5} />
                <span className="text-[14px] font-medium text-[#1B2432]">
                  Choose the .xlsx file
                </span>
                <span className="text-[12px] text-[#5C6470]">
                  Columns read by name: name/part, SKU/code, quantity/stock, unit cost/price,
                  reorder/threshold, category, location, supplier, vehicle compatibility —
                  a row without a SKU gets one generated.
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void parseImportFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px] font-medium text-[#1B2432]">
                    {importFileName} — {importRows.length} parts ready
                  </span>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => {
                      setImportRows(null);
                      setImportFileName("");
                    }}
                    className="h-8 shrink-0 rounded border border-[#1B2432] px-3 text-[13px] font-medium text-[#1B2432] disabled:opacity-50"
                  >
                    Pick another file
                  </button>
                </div>
                <div className="max-h-[280px] overflow-auto rounded border border-[#E2E5E9]">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-[1.5fr_120px_90px_110px_90px] items-center gap-3 border-b border-[#E2E5E9] bg-[#F7F8FA] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
                      <span>Part</span>
                      <span>SKU</span>
                      <span>Quantity</span>
                      <span>Unit cost</span>
                      <span>Reorder at</span>
                    </div>
                    {importRows.slice(0, 100).map((row) => (
                      <div
                        key={row.sku}
                        className="grid grid-cols-[1.5fr_120px_90px_110px_90px] items-center gap-3 border-b border-[#E2E5E9] px-3 py-1.5 text-[13px] text-[#344256] last:border-b-0"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{row.name}</span>
                          {row.warnings.length ? (
                            <span className="truncate text-[11px] text-[#B26A00]">
                              {row.warnings.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate text-[12px] text-[#5C6470]">{row.sku}</span>
                        <span className="tabular-nums">{row.stock.toLocaleString("en-NG")}</span>
                        <span className="tabular-nums">{formatNairaFull(row.unitCost)}</span>
                        <span className="tabular-nums">{row.reorderLevel}</span>
                      </div>
                    ))}
                    {importRows.length > 100 ? (
                      <div className="px-3 py-2 text-[12px] text-[#5C6470]">
                        …and {importRows.length - 100} more lines (all will be saved).
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => {
                      setImportOpen(false);
                      setImportRows(null);
                      setImportFileName("");
                    }}
                    className="h-9 rounded border border-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-[#1B2432] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void commitImport()}
                    className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-white disabled:opacity-50"
                  >
                    {importing ? "Saving…" : `Save ${importRows.length} parts to the store`}
                  </button>
                </div>
              </>
            )}
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
                On shelf now: <strong className="text-[#1B2432]">{purchasing.stock.toLocaleString("en-NG")}</strong>
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
