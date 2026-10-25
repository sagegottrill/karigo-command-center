import { createFileRoute, redirect } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { downloadCsvBlob } from "@/lib/fleetopsx/table-export";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { SignaturePad } from "@/components/fleetopsx/signature-pad";
import {
  CardShell,
  CountBadge,
  FamilyTabs,
  ModalActions,
  ModalShell,
  PagerFooter,
  SearchField,
  STORE_TAB_DETAILS,
  StatusPill,
  csvOf,
  dateOf,
  type StoreTab,
} from "@/components/fleetopsx/store-portal";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { classOfItem } from "@/components/fleetopsx/store-portal";
import {
  authService,
  formatNairaFull,
  inventoryService,
} from "@/lib/fleetopsx/services";
import type { InventoryItem, InventoryRequisition } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/store/parts-request")({
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
  component: PartsRequestPage,
});

const PAGE_SIZE = 9;

/** A raw API id must never reach the customer's eye: a legacy row without an
    engineering group prints its UUID here, which is not a ticket number. */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ticketIdOf(key: string): string {
  const k = (key || "").trim();
  if (!k) return "—";
  if (!UUID_RX.test(k)) return k;
  return `PRT-${k.replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(-5).padStart(5, "0")}`;
}

/** The statuses the store's approved queue reads — never the TM's queue. */
const QUEUE_STATUSES = ["Awaiting Pickup", "Awaiting Procurement"] as const;

/** One card = one request group (a legacy single row carries its own). */
interface RequestCard {
  key: string;
  date: string;
  requestedBy: string;
  description: string;
  status: string;
  tab: StoreTab;
  lines: InventoryRequisition[];
  shelf: Map<string, InventoryItem>;
}

function pillFor(status: string): { label: string; tone: "amber" | "green" | "red" | "blue" } {
  switch (status) {
    case "Awaiting Pickup":
      return { label: "Approved by Admin", tone: "green" };
    case "Awaiting Procurement":
      return { label: "Approved — Stock Out", tone: "amber" };
    case "Released":
      return { label: "Issued", tone: "blue" };
    case "Rejected":
      return { label: "Declined by Admin", tone: "red" };
    default:
      return { label: status, tone: "amber" };
  }
}

function PartsRequestPage() {
  const [requisitions, setRequisitions] = useState<InventoryRequisition[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StoreTab>("parts");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [issueFor, setIssueFor] = useState<RequestCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRows, itemRows] = await Promise.all([
        inventoryService.requisitions(),
        inventoryService.list().catch(() => [] as InventoryItem[]),
      ]);
      setRequisitions(reqRows);
      setItems(itemRows);
    } catch {
      toast.error("Could not reach the request ledger. Retry in a moment.");
      setRequisitions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo<RequestCard[]>(() => {
    const shelf = new Map(items.map((i) => [i.id, i]));
    const grouped = new Map<string, InventoryRequisition[]>();
    for (const r of requisitions) {
      if (!QUEUE_STATUSES.includes(r.status as (typeof QUEUE_STATUSES)[number])) continue;
      const key = r.requestGroup || r.id;
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }
    return Array.from(grouped.entries()).flatMap(([key, lines]) => {
      const first = lines[0];
      if (!first) return [];
      // The family the card reads under: the shelf line each request names
      // decides it; a line without one falls back to the parts tab.
      const tabOf = lines
        .map((l) => {
          const item = l.itemId ? shelf.get(l.itemId) : undefined;
          return item ? classOfItem(item) : null;
        })
        .find(Boolean);
      return [
        {
          key,
          date: first.date,
          requestedBy: first.mechanic,
          description: first.description,
          status: first.status,
          tab: tabOf ?? "parts",
          lines,
          shelf,
        },
      ];
    });
  }, [requisitions, items]);

  const familyCards = useMemo(() => cards.filter((c) => c.tab === tab), [cards, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return familyCards;
    return familyCards.filter((c) =>
      `${ticketIdOf(c.key)} ${c.requestedBy} ${c.description} ${c.lines.map((l) => l.part).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [familyCards, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const exportCsv = () => {
    const rows: string[][] = [
      ["Request Group", "Date", "Requested By", "Description", "Status", "Part", "Unit", "Quantity", "Unit Cost"],
      ...filtered.flatMap((c) =>
        c.lines.map((l) => [
          c.key,
          dateOf(c.date),
          c.requestedBy,
          c.description,
          c.status,
          l.part,
          c.shelf.get(l.itemId ?? "")?.sku ?? "",
          String(l.releasedQty ?? l.quantity ?? 0),
          String(l.unitCost ?? 0),
        ]),
      ),
    ];
    downloadCsvBlob(csvOf(rows), `approved-part-requests-${tab}`);
  };

  return (
    <>
      {/* The shell (workspace.app.tsx) owns the sidebar, header and mobile nav —
          a page must not paint its own second rail beside it. */}
      <div className="w-full bg-[#F7F8FA] pb-4">
        <DepartmentTabs department="parts" />
        <div className="mx-auto w-full max-w-[1160px] px-5 pt-6 max-md:px-3">
          <h1 className="text-[26px] font-semibold tracking-[0.4px] text-[#1B2432]">Parts Request</h1>
          <p className="mt-1 max-w-[640px] text-[12.5px] font-medium uppercase leading-[18px] tracking-[0.4px] text-[#9AA2AC]">
            Received approved parts requests from engineering — issue the parts against the ticket.
          </p>

          <CardShell className="mt-5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  Approved Part Request
                </h2>
                <CountBadge value={filtered.length} />
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                <FamilyTabs active={tab} onSelect={setTab} />
                <SearchField value={query} onChange={setQuery} />
              </div>
            </div>

            {loading ? (
              <FigmaLoadingState label="Loading the approved ticket queue…" />
            ) : filtered.length === 0 ? (
              <div className="py-10">
                <FigmaEmptyState
                  title="No approved request on this family"
                  body="A request reaches this desk only after the Transport Manager approves it. When engineering needs parts for a truck, the approved ticket lands here for the store floor to hand over."
                />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((card) => (
                  <RequestCardView key={card.key} card={card} onIssue={() => setIssueFor(card)} />
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
      </div>

      {issueFor && (
        <IssuePartsModal
          card={issueFor}
          onClose={() => setIssueFor(null)}
          onDone={async () => {
            setIssueFor(null);
            toast.success("The parts are issued — the stock movement posts to the ledger.");
            await load();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------- request card */

function RequestCardView({ card, onIssue }: { card: RequestCard; onIssue: () => void }) {
  const pill = pillFor(card.status);
  const issueable = card.lines.some((l) => l.status === "Awaiting Pickup");
  return (
    <div
      className={cn(
        "flex flex-col rounded-[12px] border bg-white p-3",
        issueable ? "border-[#ED351D]" : "border-[#E2E5E9]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold tracking-[0.4px] text-[#1B2432]">
          {dateOf(card.date)} • {ticketIdOf(card.key)}
        </p>
        <div className="flex items-center gap-1.5">
          <StatusPill label={pill.label} tone={pill.tone} />
          <button
            type="button"
            onClick={onIssue}
            disabled={!issueable}
            title={issueable ? "Hand over the parts against the mechanic's signature" : "Nothing waiting on the shelf"}
            className="rounded-[6px] border border-[#E2E5E9] px-2 py-1 text-[11.5px] font-medium text-[#1B2432] disabled:opacity-40"
          >
            Issue
          </button>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-[#5C6470]">Requested by: {card.requestedBy || "—"}</p>

      {card.description && (
        <div className="mt-2 rounded-[8px] bg-[#F7F8FA] px-3 py-2">
          <p className="text-[12px] font-semibold text-[#1B2432]">Description:</p>
          <p className="mt-0.5 line-clamp-3 text-[12px] leading-[16px] text-[#5C6470]">{card.description}</p>
        </div>
      )}

      <div className="mt-2 flex-1 overflow-hidden rounded-[8px] border border-[#EFF1F4]">
        <div className="flex items-center justify-between bg-[#F7F8FA] px-3 py-1.5 text-[11.5px] font-medium text-[#5C6470]">
          <span>{STORE_TAB_DETAILS[card.tab]}</span>
          <span>Quantity</span>
        </div>
        {card.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between border-t border-[#EFF1F4] px-3 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-[#1B2432]">{l.part}</p>
              <p className="truncate text-[11px] text-[#5C6470]">
                {formatNairaFull(l.unitCost ?? 0)}
                {l.status === "Awaiting Procurement" ? " · not on shelf" : ""}
              </p>
            </div>
            <span className="grid h-[24px] min-w-[28px] shrink-0 place-items-center rounded-[6px] border border-[#E2E5E9] px-1.5 text-[11.5px] font-semibold text-[#1B2432]">
              {l.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- issue (handoff) */

function IssuePartsModal({
  card,
  onClose,
  onDone,
}: {
  card: RequestCard;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [sign, setSign] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = card.lines.filter((l) => l.status === "Awaiting Pickup");

  const confirm = async () => {
    if (!sign || sign.length < 40) {
      toast.error("The mechanic's signature is required before the parts leave the shelf.");
      return;
    }
    setBusy(true);
    let failed = 0;
    for (const line of lines) {
      try {
        await inventoryService.completeHandoff(line.id, sign, line.quantity);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      await onDone();
      return;
    }
    toast.error(
      failed === lines.length
        ? "The release did not post — check stock and retry."
        : `${lines.length - failed} of ${lines.length} line(s) issued; the rest refused — retry from the card.`,
    );
    await onDone();
  };

  return (
    <ModalShell
      title="Issue Part Request"
      subtitle={`${dateOf(card.date)} • ${ticketIdOf(card.key)}`}
      onClose={onClose}
      width="max-w-[560px]"
    >
      {card.description && (
        <div className="rounded-[8px] bg-[#F7F8FA] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#1B2432]">Description</p>
          <p className="mt-0.5 text-[12.5px] text-[#5C6470]">{card.description}</p>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-[8px] border border-[#EFF1F4]">
        <div className="flex items-center justify-between bg-[#F7F8FA] px-3 py-2 text-[12px] font-medium text-[#5C6470]">
          <span>Parts Requested</span>
          <span>Quantity</span>
        </div>
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between border-t border-[#EFF1F4] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-[#1B2432]">{l.part}</p>
              <p className="text-[11px] text-[#5C6470]">{formatNairaFull(l.unitCost ?? 0)}</p>
            </div>
            <span className="grid h-[26px] min-w-[30px] place-items-center rounded-[6px] border border-[#E2E5E9] px-2 text-[12px] font-semibold text-[#1B2432]">
              {l.quantity}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[13.5px] font-medium text-[#1B2432]">
          Mechanic's signature<span className="text-[#ED351D]"> *</span>
        </p>
        <SignaturePad onChange={setSign} className="h-[150px] w-full" />
      </div>

      <div className="mt-4">
        <ModalActions onCancel={onClose} submitLabel="Complete Handoff" busy={busy} onAction={confirm} />
      </div>
    </ModalShell>
  );
}
