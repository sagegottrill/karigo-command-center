import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { downloadCsvBlob } from "@/lib/fleetopsx/table-export";
import { RequestProcurementModal } from "@/components/fleetopsx/store-request-procurement";
import {
  CardShell,
  CountBadge,
  Dropdown,
  PagerFooter,
  SearchField,
  FAMILY_OPTIONS,
  StatusPill,
  StorePageShell,
  familyFromOption,
  familyOfPo,
  csvOf,
  dateOf,
} from "@/components/fleetopsx/store-portal";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  authService,
  formatNairaFull,
  inventoryService,
  procurementService,
} from "@/lib/fleetopsx/services";
import type { InventoryItem, ProcurementRequest } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/app/store/procurement")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = [
      "Parts & Store",
      "Parts and Store",
      "Procurement",
      "Inventory",
      "Transport Manager",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: ProcurementRequestsPage,
});

const PAGE_SIZE = 9;

/** A PO row plus the fields the kind filter needs. */
type PoRow = ProcurementRequest & { kind?: string };

/** The shape one details row of a card carries. */
interface PoLine {
  name: string;
  sku: string;
  quantity: number;
  price: number;
}

function pillFor(status: string): { label: string; tone: "amber" | "green" | "red" | "blue" } {
  switch (status) {
    case "Requested":
      return { label: "Awaiting Admin Approval", tone: "amber" };
    case "Sourcing":
      return { label: "Approved by Admin", tone: "green" };
    case "Procured":
      return { label: "Delivered · Stocked", tone: "blue" };
    default:
      return { label: status, tone: "amber" };
  }
}

function ProcurementRequestsPage() {
  const [pos, setPos] = useState<PoRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyOption, setFamilyOption] = useState(FAMILY_OPTIONS[0] ?? "All Categories");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [poRes, itemRows] = await Promise.all([
          procurementService.list(),
          inventoryService.list().catch(() => [] as InventoryItem[]),
        ]);
        if (!alive) return;
        const rows = (
          Array.isArray(poRes) ? poRes : ((poRes as { data?: unknown[] })?.data ?? [])
        ) as PoRow[];
        // Fuel-tank restocks bill under the Lubricant module's own desk — the
        // store's request ledger carries the parts buys.
        setPos(rows.filter((r) => r.kind !== "Fuel"));
        setItems(itemRows);
      } catch {
        if (alive) toast.error("Could not reach the procurement ledger. Retry in a moment.");
        if (alive) setPos([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const optionFamily = familyFromOption(familyOption);
  const familyPos = useMemo(
    () => (optionFamily ? pos.filter((po) => familyOfPo(po, items) === optionFamily) : pos),
    [pos, items, optionFamily],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return familyPos;
    return familyPos.filter((po) =>
      `${po.partName} ${po.vendor ?? ""} ${po.requestedBy ?? ""} ${po.note ?? ""} ${dateOf(po.date)}`
        .toLowerCase()
        .includes(q),
    );
  }, [familyPos, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const linesOf = (po: PoRow): PoLine[] => {
    // The PO names its SKU or store line — resolve the shelf row for the
    // exact identity the card shows (sku bold, name beneath).
    const name = (po.partName ?? "").trim().toLowerCase();
    let item = items.find((i) => i.sku && i.sku.toLowerCase() === name);
    if (!item) item = items.find((i) => i.name.trim().toLowerCase() === name);
    const label = item ? item.sku : po.partName;
    const labelName = item ? item.name : "";
    const price = Number(po.unitPrice ?? item?.unitCost ?? 0) || 0;
    const qty = Number(po.quantity ?? 0) || 0;
    return [{ name: labelName || label, sku: label, quantity: qty, price: price * qty }];
  };

  const exportCsv = () => {
    const rows: string[][] = [
      [
        "Request Date",
        "Reference",
        "Family",
        "Part Number",
        "Part Name",
        "Requested By",
        "Quantity",
        "Total Price",
        "Status",
        "Vendor",
        "Procurement Note",
      ],
      ...filtered.flatMap((po) =>
        linesOf(po).map((l) => [
          dateOf(po.date),
          `PO-${po.id.substring(0, 6).toUpperCase()}`,
          familyOption,
          l.sku,
          l.name,
          po.requestedBy ?? "",
          String(l.quantity),
          String(l.price),
          po.status,
          po.vendor ?? "",
          po.note ?? "",
        ]),
      ),
    ];
    downloadCsvBlob(csvOf(rows), `procurement-requests-${familyOption}`);
  };

  const markProcured = async (po: PoRow) => {
    try {
      await procurementService.markProcured(po.id);
      toast.success("Delivery received — mark the shelf restock from the Store Inventory card.");
      const refreshed = (await procurementService.list()) as PoRow[];
      const rows = (
        Array.isArray(refreshed) ? refreshed : ((refreshed as { data?: unknown[] })?.data ?? [])
      ) as PoRow[];
      setPos(rows.filter((r) => r.kind !== "Fuel"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark it procured.");
    }
  };

  return (
    <>
      <StorePageShell
        title="Procurement Order"
        subtitle="Manage and issue received approved parts requests."
        actions={
          <button
            type="button"
            onClick={() => setRaiseOpen(true)}
            className="h-[40px] rounded-[8px] bg-[#1B2432] px-4 text-[13.5px] font-medium text-white hover:bg-[#2A3849]"
          >
            Request Procurement
          </button>
        }
      >
        <CardShell className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Procurement Requests
              </h2>
              <CountBadge value={filtered.length} />
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              <Dropdown
                value={familyOption}
                options={FAMILY_OPTIONS}
                onChange={setFamilyOption}
                className="w-[168px]"
                align="right"
              />
              <SearchField value={query} onChange={setQuery} />
            </div>
          </div>

          {loading ? (
            <FigmaLoadingState label="Loading the buys…" />
          ) : filtered.length === 0 ? (
            <div className="py-10">
              <FigmaEmptyState
                title="No procurement request on this family"
                body="Raise the first buy with Request Procurement — the store names the line and the quantity; the Transport Manager authorises the spend."
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageRows.map((po) => (
                <PoCard
                  key={po.id}
                  po={po}
                  lines={linesOf(po)}
                  onProcured={() => markProcured(po)}
                />
              ))}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-4 -mx-5">
              <PagerFooter
                shownFrom={safePage * PAGE_SIZE + 1}
                shownTo={Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)}
                total={filtered.length}
                page={safePage}
                pageCount={pageCount}
                onPage={setPage}
                onExport={exportCsv}
                exportLabel="Export"
              />
            </div>
          )}
        </CardShell>
      </StorePageShell>

      {raiseOpen && (
        <RequestProcurementModal
          items={items}
          onClose={() => setRaiseOpen(false)}
          onDone={async () => {
            setRaiseOpen(false);
            toast.success("The buy is on its sheet below.");
            const refreshed = (await procurementService.list()) as PoRow[];
            const rows = (
              Array.isArray(refreshed)
                ? refreshed
                : ((refreshed as { data?: unknown[] })?.data ?? [])
            ) as PoRow[];
            setPos(rows.filter((r) => r.kind !== "Fuel"));
          }}
        />
      )}
    </>
  );
}

function PoCard({
  po,
  lines,
  onProcured,
}: {
  po: PoRow;
  lines: PoLine[];
  onProcured: () => Promise<void>;
}) {
  const pill = pillFor(po.status);
  const [busy, setBusy] = useState(false);
  const actionOpen = po.status === "Requested" || po.status === "Sourcing";
  return (
    <div className="flex flex-col rounded-[12px] border border-[#E2E5E9] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold tracking-[0.4px] text-[#1B2432]">
          {dateOf(po.date)} • PO-{po.id.substring(0, 6).toUpperCase()}
        </p>
        <div className="flex items-center gap-1.5">
          <StatusPill label={pill.label} tone={pill.tone} />
          {actionOpen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const run = async () => {
                  setBusy(true);
                  await onProcured();
                  setBusy(false);
                };
                void run();
              }}
              title="The delivery arrived — the buy is fulfilled"
              className="rounded-[6px] border border-[#E2E5E9] px-2 py-1 text-[11.5px] font-medium text-[#1B2432] disabled:opacity-40"
            >
              Mark Procured
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[12px] text-[#5C6470]">
        Requested by:&nbsp;
        <span className="font-medium text-[#1B2432]">{po.requestedBy || "Store desk"}</span>
      </p>

      {po.note && (
        <div className="mt-2 rounded-[8px] bg-[#F7F8FA] px-3 py-2">
          <p className="text-[12px] font-semibold text-[#1B2432]">Procurement note:</p>
          <p className="mt-0.5 line-clamp-3 text-[12px] leading-[16px] text-[#5C6470]">{po.note}</p>
        </div>
      )}

      <div className="mt-2 flex-1 overflow-hidden rounded-[8px] border border-[#EFF1F4]">
        <div className="flex items-center justify-between bg-[#F7F8FA] px-3 py-1.5 text-[11.5px] font-medium text-[#5C6470]">
          <span>Parts details</span>
          <span className="flex-1 pl-4 text-right">Quantity&nbsp;&nbsp;&nbsp;&nbsp;Price</span>
        </div>
        {lines.map((l, idx) => (
          <div key={idx} className="border-t border-[#EFF1F4] px-3 py-1.5">
            <p className="text-[12px] font-semibold text-[#1B2432]">{l.sku}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="line-clamp-2 pr-3 text-[11px] text-[#5C6470]">{l.name}</p>
              <div className="flex shrink-0 items-center gap-4">
                <span className="grid h-[24px] min-w-[26px] place-items-center rounded-[6px] border border-[#E2E5E9] px-1.5 text-[11.5px] font-semibold text-[#1B2432]">
                  {l.quantity.toLocaleString("en-NG")}
                </span>
                <span className="text-[11.5px] font-semibold text-[#1B2432]">
                  {formatNairaFull(l.price)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
