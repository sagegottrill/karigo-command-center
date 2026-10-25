import { createFileRoute, redirect } from "@tanstack/react-router";
import { History, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { downloadCsvBlob } from "@/lib/fleetopsx/table-export";
import { DepartmentSidebar, DepartmentMobileNav, DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import {
  CardShell,
  CountBadge,
  FamilyTabs,
  ModalActions,
  ModalShell,
  PagerFooter,
  SearchField,
  classOfItem,
  csvOf,
  dateOf,
  type StoreTab,
} from "@/components/fleetopsx/store-portal";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, inventoryService } from "@/lib/fleetopsx/services";
import type { InventoryItem, InventoryMovement } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/store/issue-history")({
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
  component: IssueHistoryPage,
});

const PAGE_SIZE = 9;

/** One card = one dispense day for one truck (the ledger's own grouping). */
interface IssueCard {
  key: string;
  date: string;
  truck: string;
  requestedBy: string;
  tab: StoreTab;
  lines: InventoryMovement[];
}

function IssueHistoryPage() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StoreTab>("parts");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [reportFor, setReportFor] = useState<IssueCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [movementRows, itemRows] = await Promise.all([
        inventoryService.movements(),
        inventoryService.list().catch(() => [] as InventoryItem[]),
      ]);
      setMovements(movementRows);
      setItems(itemRows);
    } catch {
      toast.error("Could not reach the movement ledger. Retry in a moment.");
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo<IssueCard[]>(() => {
    const itemBySku = new Map(items.map((i) => [i.sku, i]));
    // The group key is the day and the truck: the physical handoff the store
    // signed for. The reference (a requisition group when present) keeps a
    // multi-line request on one card inside the same day+truck window.
    const buckets = new Map<string, InventoryMovement[]>();
    for (const m of movements) {
      if (m.kind !== "Issue") continue;
      const key = `${dateOf(m.actedAt)}|${(m.truckReg || "").trim().toUpperCase() || "STORE"}`;
      const list = buckets.get(key) ?? [];
      list.push(m);
      buckets.set(key, list);
    }
    const cards: IssueCard[] = [];
    buckets.forEach((lines, key) => {
      const [date, truck] = key.split("|");
      const first = lines[0];
      if (!date || !first) return;
      const tabOf = lines
        .map((l) => {
          const item = itemBySku.get(l.sku);
          return item ? classOfItem(item) : classOfItem({ sku: l.sku, name: l.itemName, category: "" });
        })
        .find(Boolean);
      cards.push({
        key: truck === "STORE" ? `${date} • Store floor` : `${date} • ${truck}`,
        date,
        truck: truck ?? "STORE",
        requestedBy: first.actedBy,
        tab: tabOf ?? "parts",
        lines: lines.sort((a, b) => a.itemName.localeCompare(b.itemName)),
      });
    });
    return cards.sort((a, b) => b.date.localeCompare(a.date));
  }, [movements, items]);

  const familyCards = useMemo(() => cards.filter((c) => c.tab === tab), [cards, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return familyCards;
    return familyCards.filter((c) =>
      `${c.key} ${c.requestedBy} ${c.lines.map((l) => `${l.sku} ${l.itemName}`).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [familyCards, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const exportCsv = () => {
    const rows: string[][] = [
      ["Issue Date", "Truck", "Issued By", "Family", "Part Number", "Part Name", "Quantity", "Reference"],
      ...filtered.flatMap((c) =>
        c.lines.map((l) => [
          c.date,
          c.truck === "STORE" ? "Store floor" : c.truck,
          c.requestedBy,
          c.tab,
          l.sku,
          l.itemName,
          String(Math.abs(Number(l.quantity) || 0)),
          l.reference,
        ]),
      ),
    ];
    downloadCsvBlob(csvOf(rows), `parts-issue-history-${tab}`);
  };

  return (
    <>
      <DepartmentSidebar department="parts" collapsed={false} onToggle={() => {}} />
      <DepartmentMobileNav department="parts" />
      <main className="min-h-screen flex-1 bg-[#F7F8FA] pb-4">
        <DepartmentTabs department="parts" />
        <div className="mx-auto w-full max-w-[1160px] px-5 pt-6 max-md:px-3">
          <h1 className="text-[26px] font-semibold tracking-[0.4px] text-[#1B2432]">Requests Issue History</h1>
          <p className="mt-1 max-w-[600px] text-[12.5px] font-medium uppercase leading-[18px] tracking-[0.4px] text-[#9AA2AC]">
            Every part the store floor dispensed — the day it left the shelf and the truck that took it.
          </p>

          <CardShell className="mt-5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">Issue Record</h2>
                <CountBadge value={filtered.length} />
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                <FamilyTabs active={tab} onSelect={setTab} />
                <SearchField value={query} onChange={setQuery} />
              </div>
            </div>

            {loading ? (
              <FigmaLoadingState label="Loading the dispense ledger…" />
            ) : filtered.length === 0 ? (
              <div className="py-10">
                <FigmaEmptyState
                  title="Nothing issued yet on this family"
                  body="Units appear here the moment Complete Handoff signs them out on the request queue — the record is written by the handoff itself."
                />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((card) => (
                  <IssueCardView key={card.key} card={card} onPrint={() => setReportFor(card)} />
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
                />
              </div>
            )}
          </CardShell>
        </div>
      </main>

      {reportFor && <IssueReportModal card={reportFor} onClose={() => setReportFor(null)} />}
    </>
  );
}

/* --------------------------------------------------------------- issue card */

function IssueCardView({ card, onPrint }: { card: IssueCard; onPrint: () => void }) {
  return (
    <div className="flex flex-col rounded-[12px] border border-[#E2E5E9] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold tracking-[0.4px] text-[#1B2432]">{card.key}</p>
        <button
          type="button"
          onClick={onPrint}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#E2E5E9] px-2 py-1 text-[11.5px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
        >
          <Printer className="size-3.5" />
          Print
        </button>
      </div>
      <p className="mt-1 text-[12px] text-[#5C6470]">Requested by: {card.requestedBy || "—"}</p>

      <div className="mt-2 flex-1 overflow-hidden rounded-[8px] border border-[#EFF1F4]">
        <div className="flex items-center justify-between bg-[#F7F8FA] px-3 py-1.5 text-[11.5px] font-medium text-[#5C6470]">
          <span>Parts Dispensed</span>
          <span>Quantity</span>
        </div>
        {card.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 border-t border-[#EFF1F4] px-3 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-[#1B2432]">{l.sku}</p>
              <p className="line-clamp-2 text-[11px] text-[#5C6470]">{l.itemName}</p>
            </div>
            <span className="grid h-[24px] min-w-[28px] shrink-0 place-items-center rounded-[6px] border border-[#E2E5E9] px-1.5 text-[11.5px] font-semibold text-[#1B2432]">
              {Math.abs(Number(l.quantity) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------- the printable report § */

function IssueReportModal({ card, onClose }: { card: IssueCard; onClose: () => void }) {
  const printNow = () => {
    window.print();
  };

  return (
    <>
      {/* Print-only sheet: while printing, everything else on the page is
          hidden and ONLY this record shows. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .issue-print-sheet, .issue-print-sheet * { visibility: visible !important; }
          .issue-print-sheet {
            position: absolute !important;
            left: 0; top: 0; width: 100%;
            padding: 24px;
            background: #fff;
            color: #1b2432;
          }
        }
      `}</style>

      <div className="issue-print-sheet hidden">
        <div style={{ borderBottom: "2px solid #1b2432", paddingBottom: 8, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 16 }}>Petroline Transport Ltd — Parts Issue Report</p>
          <p style={{ fontSize: 12 }}>Store and Parts Inventory Portal</p>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600 }}>{card.key}</p>
        <p style={{ fontSize: 12, margin: "4px 0 12px" }}>Issued by: {card.requestedBy || "—"}</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #1b2432", padding: 6, textAlign: "left" }}>Parts Requested</th>
              <th style={{ border: "1px solid #1b2432", padding: 6, width: 100 }}>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {card.lines.map((l) => (
              <tr key={l.id}>
                <td style={{ border: "1px solid #1b2432", padding: 6 }}>
                  <strong>{l.sku}</strong>
                  <br />
                  {l.itemName}
                </td>
                <td style={{ border: "1px solid #1b2432", padding: 6, textAlign: "center" }}>
                  {Math.abs(Number(l.quantity) || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, margin: "12px 0" }}>
          Issued from the Store and Parts Inventory Portal · Petroline Transport Ltd
        </p>
      </div>

      <ModalShell
        title="Parts issue Report"
        subtitle="The store's dispense record for one handoff"
        onClose={onClose}
        width="max-w-[540px]"
      >
        <div className="rounded-[8px] bg-[#F7F8FA] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#1B2432]">{card.key}</p>
          <p className="mt-0.5 text-[12px] text-[#5C6470]">Requested by: {card.requestedBy || "—"}</p>
        </div>

        <div className="mt-3 overflow-hidden rounded-[8px] border border-[#EFF1F4]">
          <div className="flex items-center justify-between bg-[#F7F8FA] px-3 py-2 text-[12px] font-medium text-[#5C6470]">
            <span>Parts Requested</span>
            <span>Quantity</span>
          </div>
          {card.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 border-t border-[#EFF1F4] px-3 py-2">
              <div className="min-w-0">
                <p className={cn("text-[12.5px] font-semibold text-[#1B2432]")}>{l.sku}</p>
                <p className="line-clamp-2 text-[11px] text-[#5C6470]">{l.itemName}</p>
              </div>
              <span className="grid h-[26px] min-w-[30px] place-items-center rounded-[6px] border border-[#E2E5E9] px-2 text-[12px] font-semibold text-[#1B2432]">
                {Math.abs(Number(l.quantity) || 0)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <ModalActions
            onCancel={onClose}
            submitLabel="Print Record"
            onAction={printNow}
            busy={false}
          />
        </div>
      </ModalShell>
    </>
  );
}
