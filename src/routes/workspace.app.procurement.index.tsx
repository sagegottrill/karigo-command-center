import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Plus, Trash2, X } from "lucide-react";
import { fetchApi } from "@/lib/fleetopsx/apiClient";
import { authService } from "@/lib/fleetopsx/services";

/**
 * PROCUREMENT — the buying desk (PRD, Nov 2026).
 *
 * One inbox for every desk's request (Store, Engineering, TM), the low-stock
 * alerts that raise their own PO, the receipt that lands stock at a weighted
 * average cost and pings the requester, the vendor directory with each part's
 * price trail, and the proof-of-purchase documents tied to the PO they paid for.
 */

type Tab = "Inbox" | "Low stock" | "Vendors" | "Price history" | "Documents";

type Po = {
  id: string;
  partName: string;
  quantity: number;
  linkedId: string;
  kind?: string | null;
  unitPrice?: number | null;
  vendor?: string | null;
  requestedBy?: string | null;
  note?: string | null;
  status: string;
  date: string;
  source?: string | null;
  sku?: string | null;
  category?: string | null;
  itemId?: string | null;
  receivedQty?: number | null;
  receivedUnitCost?: number | null;
  receivedAt?: string | null;
  receivedBy?: string | null;
};
type Item = { id: string; sku: string; name: string; category: string; stock: number; reorderLevel: number; unitCost?: number; status: string };
type Vendor = { id: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null; location?: string | null; notes?: string | null; status?: string };
type Doc = { id: string; procurementId?: string | null; kind: string; fileName: string; mimeType: string; size: number; vendor?: string | null; uploadedBy?: string | null; createdAt: string };
type Purchase = { id: string; sku: string; itemName: string; vendor?: string | null; unitCost?: number | null; quantity: number; value?: number | null; actedAt: string; reference?: string | null };
type Upload = { kind: string; fileName: string; mimeType: string; dataUrl: string };

const ROLES = [
  "Procurement",
  "Procurement Officer",
  "Procurement Manager",
  "Procurement Clerk",
  "Head of Procurement",
  "Purchasing Officer",
  "Buyer",
  "Transport Manager",
  "Platform Admin",
];
const SOURCES = ["Store", "Engineering", "TM", "Procurement"];
const STATUSES = ["All", "Requested", "Sourcing", "Procured", "Rejected"];

export const Route = createFileRoute("/workspace/app/procurement/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r) => ROLES.includes(r))) throw redirect({ to: "/workspace/app" });
  },
  component: ProcurementPage,
});

const money = (n?: number | null) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : "₦" + Number(n).toLocaleString("en-NG", { maximumFractionDigits: 0 });
const when = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const sourceTone: Record<string, string> = {
  Store: "bg-[#EAF2FF] text-[#1D5FD0]",
  Engineering: "bg-[#FFF1E6] text-[#B25A00]",
  TM: "bg-[#F1EBFF] text-[#5B2EC4]",
  Procurement: "bg-[#E9F7EF] text-[#127A45]",
};
const statusTone = (s: string) =>
  s === "Procured" ? "bg-[#E9F7EF] text-[#127A45]"
  : s === "Rejected" ? "bg-[#FDECEC] text-[#B42318]"
  : s === "Sourcing" ? "bg-[#FFF7E6] text-[#8A5A00]"
  : "bg-[#EEF2F7] text-[#41556B]";

function ProcurementPage() {
  const [tab, setTab] = useState<Tab>("Inbox");
  const [requests, setRequests] = useState<Po[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState<Po | null>(null);
  const [vendorDraft, setVendorDraft] = useState<Vendor | "new" | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  // PRD §2: the inbox is multi-channel — Store, Engineering, TM and the desk's
  // own reorders, picked apart by the desk that asked.
  const [channel, setChannel] = useState("All");
  const [raising, setRaising] = useState(false);

  const load = useCallback(async () => {
    try {
      const [po, inv, ven, doc, price] = await Promise.all([
        fetchApi<Po[]>("/procurement"),
        fetchApi<Item[]>("/inventory"),
        fetchApi<Vendor[]>("/vendors"),
        fetchApi<Doc[]>("/procurement/documents"),
        fetchApi<Purchase[]>("/vendors/price-history"),
      ]);
      setRequests(Array.isArray(po) ? po : []);
      setItems(Array.isArray(inv) ? inv : []);
      setVendors(Array.isArray(ven) ? ven : []);
      setDocs(Array.isArray(doc) ? doc : []);
      setPurchases(Array.isArray(price) ? price : []);
    } catch (e: any) {
      toast.error(e?.message || "Could not load the procurement desk.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A live inbox (PRD §2): another desk's request, a receipt and the resulting
  // shelf numbers appear without anyone pressing reload.
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 20_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const open = useMemo(() => requests.filter((r) => !["Procured", "Rejected"].includes(r.status)), [requests]);
  const lowStock = useMemo(() => items.filter((i) => i.stock <= i.reorderLevel), [items]);
  const search = q.trim().toLowerCase();
  const channelCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) {
      if (["Procured", "Rejected"].includes(r.status)) continue;
      const key = r.source || "Store";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [requests]);
  const inbox = useMemo(
    () => requests.filter((r) => {
      if (channel !== "All" && (r.source || "Store") !== channel) return false;
      if (status !== "All" && r.status !== status) return false;
      if (!search) return true;
      return [r.partName, r.linkedId, r.requestedBy, r.vendor, r.source, r.sku].some((v) => String(v ?? "").toLowerCase().includes(search));
    }),
    [requests, status, search],
  );
  const priceRows = useMemo(
    () => purchases.filter((p) => !search || [p.itemName, p.sku, p.vendor, p.reference].some((v) => String(v ?? "").toLowerCase().includes(search))),
    [purchases, search],
  );

  const advance = async (po: Po, next: string) => {
    try {
      await fetchApi(`/procurement/${po.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      toast.success(`${po.partName} → ${next}`);
      void load();
    } catch (e: any) {
      toast.error(e?.message || "Could not update that request.");
    }
  };

  const raiseFromShelf = async (item: Item) => {
    try {
      await fetchApi("/procurement", {
        method: "POST",
        body: JSON.stringify({
          partName: item.name,
          quantity: Math.max(item.reorderLevel * 2 - item.stock, 1),
          linkedId: item.sku,
          kind: "Part",
          sku: item.sku,
          category: item.category,
          source: "Procurement",
          requestedBy: "Procurement (low stock)",
          note: `${item.name} is at ${item.stock} on the shelf — reorder level ${item.reorderLevel}.`,
        }),
      });
      toast.success(`PO raised for ${item.name}.`);
      setTab("Inbox");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "Could not raise that PO.");
    }
  };

  const openDoc = async (id: string) => {
    try {
      const doc = await fetchApi<Doc & { dataUrl: string }>(`/procurement/documents/${id}`);
      const a = document.createElement("a");
      a.href = doc.dataUrl;
      a.download = doc.fileName;
      a.click();
    } catch (e: any) {
      toast.error(e?.message || "Could not open that document.");
    }
  };

  const exportPrices = () => {
    const rows = [
      ["Part", "SKU", "Vendor", "Quantity", "Unit cost", "Total", "Date", "Reference"],
      ...priceRows.map((p) => [p.itemName, p.sku, p.vendor || "", p.quantity, p.unitCost ?? "", p.value ?? "", when(p.actedAt), p.reference || ""]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "procurement-price-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ key: Tab; count: number }> = [
    { key: "Inbox", count: open.length },
    { key: "Low stock", count: lowStock.length },
    { key: "Vendors", count: vendors.length },
    { key: "Price history", count: purchases.length },
    { key: "Documents", count: docs.length },
  ];

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[#1B2432]">Procurement</h1>
          <p className="mt-1 text-[13px] text-[#6B7788]">
            Every desk's buying request in one inbox — received stock lands on the shelf at the price actually paid, with the receipt kept against the PO.
          </p>
        </div>
        <div className="flex gap-2">
          <Stat label="Open requests" value={open.length} />
          <Stat label="Low / out" value={lowStock.length} tone={lowStock.length ? "warn" : undefined} />
          <Stat label="Vendors" value={vendors.length} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E7ECF2] bg-white p-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition " +
              (tab === t.key ? "bg-[#1B2432] text-white" : "text-[#5A6B7F] hover:bg-[#F4F7FA]")
            }
          >
            {t.key}
            <span className={"rounded-full px-1.5 py-0.5 text-[10.5px] " + (tab === t.key ? "bg-white/15" : "bg-[#EEF2F7] text-[#65758A]")}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#EDF0F4] px-4 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "Vendors" ? "Search vendors" : tab === "Documents" ? "Search documents" : "Search part, PO or vendor"}
            className="h-9 w-full max-w-[280px] rounded-lg border border-[#E2E8F0] px-3 text-[12.5px] outline-none focus:border-[#1B2432]"
          />
          {tab === "Inbox" && (
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[12.5px]">
              {STATUSES.map((s) => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
            </select>
          )}
          {tab === "Inbox" && (
            <div className="flex flex-wrap items-center gap-1">
              {["All", ...SOURCES].map((s) => (
                <button
                  key={s}
                  onClick={() => setChannel(s)}
                  className={
                    "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition " +
                    (channel === s ? "bg-[#1B2432] text-white" : "bg-[#F4F7FA] text-[#5A6B7F] hover:bg-[#EAEFF5]")
                  }
                >
                  {s === "All" ? "All desks" : s}
                  {s !== "All" && <span className="ml-1 opacity-70">{channelCount[s] || 0}</span>}
                </button>
              ))}
            </div>
          )}
          {tab === "Inbox" && (
            <button onClick={() => setRaising(true)} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#1B2432] px-3 py-2 text-[12.5px] font-semibold text-white">
              <Plus className="size-3.5" /> Raise PO
            </button>
          )}
          {tab === "Vendors" && (
            <button onClick={() => setVendorDraft("new")} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#1B2432] px-3 py-2 text-[12.5px] font-semibold text-white">
              <Plus className="size-3.5" /> Add vendor
            </button>
          )}
          {tab === "Price history" && (
            <button onClick={exportPrices} className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-[12.5px] font-semibold text-[#41556B]">
              <Download className="size-3.5" /> Export CSV
            </button>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-[13px] text-[#6B7788]">Loading the buying desk…</p>
        ) : tab === "Inbox" ? (
          <Inbox rows={inbox} onReceive={setReceiving} onAdvance={advance} />
        ) : tab === "Low stock" ? (
          <LowStock rows={lowStock} onRaise={raiseFromShelf} />
        ) : tab === "Vendors" ? (
          <Vendors rows={vendors.filter((v) => !search || v.name.toLowerCase().includes(search))} onEdit={setVendorDraft} onDeleted={load} />
        ) : tab === "Price history" ? (
          <PriceHistory rows={priceRows} />
        ) : (
          <Documents rows={docs.filter((d) => !search || d.fileName.toLowerCase().includes(search))} onOpen={openDoc} requests={requests} />
        )}
      </div>

      {receiving && (
        <ReceiveModal
          po={receiving}
          vendors={vendors}
          onClose={() => setReceiving(null)}
          onDone={load}
        />
      )}
      {vendorDraft && (
        <VendorModal
          draft={vendorDraft}
          onClose={() => setVendorDraft(null)}
          onDone={load}
        />
      )}
      {raising && (
        <RaiseModal
          items={items}
          vendors={vendors}
          onClose={() => setRaising(false)}
          onDone={load}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-[#E7ECF2] bg-white px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wide text-[#8896A6]">{label}</p>
      <p className={"text-[16px] font-semibold " + (tone ? "text-[#B25A00]" : "text-[#1B2432]")}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-[#EDF0F4] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8896A6]">{children}</th>;
}

function Inbox({ rows, onReceive, onAdvance }: { rows: Po[]; onReceive: (po: Po) => void; onAdvance: (po: Po, s: string) => void }) {
  if (!rows.length) return <p className="px-4 py-10 text-center text-[13px] text-[#6B7788]">Nothing in the inbox. Requests from Store, Engineering and the TM land here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr><Th>PO</Th><Th>Part</Th><Th>Qty</Th><Th>From</Th><Th>Asked by</Th><Th>Est. cost</Th><Th>Status</Th><Th>Action</Th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[#F2F5F8] last:border-0">
              <td className="px-4 py-2.5 text-[12px] font-medium text-[#41556B]">{r.linkedId}</td>
              <td className="px-4 py-2.5">
                <p className="text-[12.5px] font-medium text-[#1B2432]">{r.partName}</p>
                <p className="text-[11px] text-[#8896A6]">{r.sku || r.category || "Part"}{r.note ? " · " + r.note : ""}</p>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{r.receivedQty ?? r.quantity}</td>
              <td className="px-4 py-2.5">
                <span className={"rounded-full px-2 py-0.5 text-[10.5px] font-semibold " + (sourceTone[r.source || "Store"] || "bg-[#EEF2F7] text-[#41556B]")}>{r.source || "Store"}</span>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{r.requestedBy || "—"}<p className="text-[10.5px] text-[#8896A6]">{when(r.date)}</p></td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{money(r.receivedUnitCost ?? r.unitPrice)}</td>
              <td className="px-4 py-2.5"><span className={"rounded-full px-2 py-0.5 text-[10.5px] font-semibold " + statusTone(r.status)}>{r.status}</span></td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {!["Procured", "Rejected"].includes(r.status) && (
                    <button onClick={() => onReceive(r)} className="rounded-md bg-[#127A45] px-2.5 py-1 text-[11.5px] font-semibold text-white">Receive</button>
                  )}
                  {r.status === "Requested" && (
                    <button onClick={() => onAdvance(r, "Sourcing")} className="rounded-md border border-[#E2E8F0] px-2.5 py-1 text-[11.5px] font-medium text-[#41556B]">Sourcing</button>
                  )}
                  {!["Procured", "Rejected"].includes(r.status) && (
                    <button onClick={() => onAdvance(r, "Rejected")} className="rounded-md border border-[#F3D6D6] px-2.5 py-1 text-[11.5px] font-medium text-[#B42318]">Reject</button>
                  )}
                  {r.status === "Procured" && <span className="text-[11px] text-[#8896A6]">{r.receivedBy ? "by " + r.receivedBy : "on the shelf"}</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LowStock({ rows, onRaise }: { rows: Item[]; onRaise: (i: Item) => void }) {
  if (!rows.length) return <p className="px-4 py-10 text-center text-[13px] text-[#6B7788]">Every line is above its reorder level.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead><tr><Th>SKU</Th><Th>Item</Th><Th>On shelf</Th><Th>Reorder at</Th><Th>Status</Th><Th>Action</Th></tr></thead>
        <tbody>
          {rows.slice(0, 300).map((i) => (
            <tr key={i.id} className="border-b border-[#F2F5F8] last:border-0">
              <td className="px-4 py-2.5 text-[12px] font-medium text-[#41556B]">{i.sku}</td>
              <td className="px-4 py-2.5 text-[12.5px] text-[#1B2432]">{i.name}<p className="text-[11px] text-[#8896A6]">{i.category}</p></td>
              <td className="px-4 py-2.5 text-[12px] font-semibold text-[#1B2432]">{i.stock}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{i.reorderLevel}</td>
              <td className="px-4 py-2.5">
                <span className={"rounded-full px-2 py-0.5 text-[10.5px] font-semibold " + (i.stock === 0 ? "bg-[#FDECEC] text-[#B42318]" : "bg-[#FFF7E6] text-[#8A5A00]")}>
                  {i.stock === 0 ? "Critical — zero" : "Low stock"}
                </span>
              </td>
              <td className="px-4 py-2.5"><button onClick={() => onRaise(i)} className="rounded-md bg-[#1B2432] px-2.5 py-1 text-[11.5px] font-semibold text-white">Raise PO</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 300 && (
        <p className="border-t border-[#EDF0F4] px-4 py-2.5 text-[11.5px] text-[#8896A6]">
          Showing the 300 most urgent of {rows.length.toLocaleString()} lines below their reorder level.
        </p>
      )}
    </div>
  );
}

function Vendors({ rows, onEdit, onDeleted }: { rows: Vendor[]; onEdit: (v: Vendor) => void; onDeleted: () => void }) {
  const remove = async (v: Vendor) => {
    try {
      await fetchApi(`/vendors/${v.id}`, { method: "DELETE" });
      toast.success(`${v.name} removed from the directory.`);
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove that vendor.");
    }
  };
  if (!rows.length) return <p className="px-4 py-10 text-center text-[13px] text-[#6B7788]">No vendors yet — add the workshops and suppliers you buy from.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] border-collapse text-left">
        <thead><tr><Th>Vendor</Th><Th>Contact</Th><Th>Location</Th><Th>Notes</Th><Th>Action</Th></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="border-b border-[#F2F5F8] last:border-0">
              <td className="px-4 py-2.5 text-[12.5px] font-medium text-[#1B2432]">{v.name}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{v.contactName || "—"}<p className="text-[11px] text-[#8896A6]">{[v.phone, v.email].filter(Boolean).join(" · ") || "—"}</p></td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{v.location || "—"}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#6B7788]">{v.notes || "—"}</td>
              <td className="px-4 py-2.5">
                <div className="flex gap-1.5">
                  <button onClick={() => onEdit(v)} className="rounded-md border border-[#E2E8F0] px-2.5 py-1 text-[11.5px] font-medium text-[#41556B]">Edit</button>
                  <button onClick={() => remove(v)} className="rounded-md border border-[#F3D6D6] px-2 py-1 text-[11.5px] text-[#B42318]" aria-label={`Remove ${v.name}`}><Trash2 className="size-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceHistory({ rows }: { rows: Purchase[] }) {
  if (!rows.length) return <p className="px-4 py-10 text-center text-[13px] text-[#6B7788]">No purchases booked yet. Price history starts with the first receipt.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead><tr><Th>Part</Th><Th>Vendor</Th><Th>Qty</Th><Th>Unit cost</Th><Th>Total</Th><Th>Date</Th><Th>PO</Th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-[#F2F5F8] last:border-0">
              <td className="px-4 py-2.5 text-[12.5px] text-[#1B2432]">{p.itemName}<p className="text-[11px] text-[#8896A6]">{p.sku}</p></td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{p.vendor || "—"}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{p.quantity}</td>
              <td className="px-4 py-2.5 text-[12px] font-medium text-[#1B2432]">{money(p.unitCost)}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{money(p.value)}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{when(p.actedAt)}</td>
              <td className="px-4 py-2.5 text-[11.5px] text-[#8896A6]">{p.reference || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Documents({ rows, onOpen, requests }: { rows: Doc[]; onOpen: (id: string) => void; requests: Po[] }) {
  const poRef = (id?: string | null) => requests.find((r) => r.id === id)?.linkedId || "—";
  if (!rows.length) return <p className="px-4 py-10 text-center text-[13px] text-[#6B7788]">No documents yet. Every received purchase carries its receipt, invoice, waybill or bill of lading here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead><tr><Th>File</Th><Th>Type</Th><Th>PO</Th><Th>Vendor</Th><Th>Uploaded</Th><Th>Action</Th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-[#F2F5F8] last:border-0">
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-2 text-[12.5px] text-[#1B2432]"><FileText className="size-3.5 text-[#8896A6]" />{d.fileName}</span>
                <p className="text-[11px] text-[#8896A6]">{Math.max(1, Math.round(d.size / 1024))} KB</p>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{d.kind}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{poRef(d.procurementId)}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{d.vendor || "—"}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#41556B]">{when(d.createdAt)}<p className="text-[11px] text-[#8896A6]">{d.uploadedBy || ""}</p></td>
              <td className="px-4 py-2.5"><button onClick={() => onOpen(d.id)} className="rounded-md border border-[#E2E8F0] px-2.5 py-1 text-[11.5px] font-medium text-[#41556B]">Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, subtitle, children, footer, onClose }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1220]/45 p-4" role="dialog" aria-modal="true">
      <div className="my-6 flex max-h-[calc(100vh-48px)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#EDF0F4] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[#1B2432]">{title}</p>
            {subtitle && <p className="mt-0.5 text-[12px] text-[#6B7788]">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[#8896A6] hover:bg-[#F4F7FA]" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[#EDF0F4] bg-[#FBFCFD] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold text-[#41556B]">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-[#8896A6]">{hint}</span>}
    </label>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] px-3 text-[12.5px] text-[#1B2432] outline-none focus:border-[#1B2432]";

function ReceiveModal({ po, vendors, onClose, onDone }: { po: Po; vendors: Vendor[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(po.partName);
  const [sku, setSku] = useState(po.sku || "");
  const [category, setCategory] = useState(po.category || "Spare Parts");
  const [qty, setQty] = useState(String(po.receivedQty ?? po.quantity ?? 1));
  const [cost, setCost] = useState(po.unitPrice != null ? String(po.unitPrice) : "");
  const [vendor, setVendor] = useState(po.vendor || "");
  const [kind, setKind] = useState("Receipt");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: Upload[] = [];
    for (const f of Array.from(list)) {
      if (!["application/pdf", "image/png", "image/jpeg"].includes(f.type)) { toast.error(`${f.name} is not a PDF, JPEG or PNG.`); continue; }
      if (f.size > 2_500_000) { toast.error(`${f.name} is over 2.5 MB.`); continue; }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      next.push({ kind, fileName: f.name, mimeType: f.type, dataUrl });
    }
    setFiles((prev) => [...prev, ...next].slice(0, 6));
    if (fileRef.current) fileRef.current.value = "";
  };

  const total = Number(qty || 0) * Number(cost || 0);

  const submit = async () => {
    const qtyNum = Number(qty);
    const costNum = Number(cost);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) { toast.error("Quantity received must be a positive number."); return; }
    if (!cost.trim() || !Number.isFinite(costNum) || costNum < 0) { toast.error("Enter what was paid per unit."); return; }
    if (!files.length) { toast.error("Attach the receipt, invoice, waybill or bill of lading."); return; }
    setBusy(true);
    try {
      await fetchApi(`/procurement/${po.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ name, sku: sku || name, category, quantity: qtyNum, unitCost: costNum, vendor, note, documents: files }),
      });
      toast.success(`${name} received — the shelf and ledger are updated.`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not receive that purchase.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Receive ${po.linkedId}`}
      subtitle={`${po.partName} · requested by ${po.requestedBy || po.source || "the store"}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-[#41556B]">
            {files.length ? `${files.length} document${files.length === 1 ? "" : "s"} attached` : "Receipt required"}
            <span className="mx-1.5 text-[#C7D0DA]">·</span>
            {total > 0 ? money(total) + " total" : "cost not entered"}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-[12.5px] font-medium text-[#41556B]">Cancel</button>
            <button onClick={submit} disabled={busy} className="rounded-lg bg-[#127A45] px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">
              {busy ? "Receiving…" : "Receive into stock"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Part name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <Field label="SKU" hint="Matches the shelf line; a new SKU creates the item."><input value={sku} onChange={(e) => setSku(e.target.value)} className={inputCls} placeholder={name} /></Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {["Spare Parts", "Tyres", "Lubricants", "Tools", "Safety", "General"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Quantity received"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
        <Field label="Unit cost (₦)" hint="The price actually paid — it sets the shelf's weighted average.">
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={inputCls} placeholder="e.g. 18500" />
        </Field>
        <Field label="Vendor">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} list="vendor-names" className={inputCls} placeholder="Who supplied it" />
          <datalist id="vendor-names">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </Field>
      </div>

      <div className="mt-4 rounded-xl border border-[#E7ECF2] bg-[#FBFCFD] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold text-[#1B2432]">Proof of purchase</p>
            <p className="text-[11px] text-[#6B7788]">Receipt, invoice, waybill or bill of lading — PDF, JPEG or PNG, up to 2.5 MB each.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 rounded-lg border border-[#E2E8F0] bg-white px-2 text-[11.5px]">
              {["Receipt", "Invoice", "Waybill", "Bill of Lading"].map((k) => <option key={k}>{k}</option>)}
            </select>
            <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-[#1B2432] px-2.5 py-1.5 text-[11.5px] font-semibold text-white">Attach file</button>
          </div>
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => void addFiles(e.target.files)} />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={`${f.fileName}-${i}`} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] text-[#41556B]">
                <span className="flex items-center gap-1.5"><FileText className="size-3.5 text-[#8896A6]" />{f.fileName}<span className="text-[#8896A6]">· {f.kind}</span></span>
                <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-[#B42318]">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3">
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Optional — delivery note, invoice number" /></Field>
      </div>
    </Modal>
  );
}

function VendorModal({ draft, onClose, onDone }: { draft: Vendor | "new"; onClose: () => void; onDone: () => void }) {
  const editing = draft !== "new";
  const [form, setForm] = useState({
    name: editing ? draft.name : "",
    contactName: editing ? draft.contactName || "" : "",
    phone: editing ? draft.phone || "" : "",
    email: editing ? draft.email || "" : "",
    location: editing ? draft.location || "" : "",
    notes: editing ? draft.notes || "" : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.name.trim()) { toast.error("A vendor needs a name."); return; }
    setBusy(true);
    try {
      if (editing) await fetchApi(`/vendors/${draft.id}`, { method: "PATCH", body: JSON.stringify(form) });
      else await fetchApi("/vendors", { method: "POST", body: JSON.stringify(form) });
      toast.success(editing ? `${form.name} updated.` : `${form.name} added to the directory.`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not save that vendor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? "Edit vendor" : "Add vendor"}
      subtitle="Suppliers and workshops the company buys from."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-[12.5px] font-medium text-[#41556B]">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-lg bg-[#1B2432] px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save vendor"}</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vendor name"><input value={form.name} onChange={set("name")} className={inputCls} placeholder="e.g. Kenworth Parts Ltd" /></Field>
        <Field label="Contact person"><input value={form.contactName} onChange={set("contactName")} className={inputCls} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={set("phone")} className={inputCls} /></Field>
        <Field label="Email"><input value={form.email} onChange={set("email")} className={inputCls} /></Field>
        <Field label="Market location"><input value={form.location} onChange={set("location")} className={inputCls} placeholder="e.g. Ladipo Market, Lagos" /></Field>
        <Field label="Notes"><input value={form.notes} onChange={set("notes")} className={inputCls} placeholder="Terms, lead time" /></Field>
      </div>
    </Modal>
  );
}

/**
 * RAISE A BUY (PRD §2): the desk starts a purchase itself — a one-off part for a
 * specific repair, the TM's strategic order (bulk tyres, trackers, hardware), or
 * a store consumable — and files it under the desk that asked, so the inbox
 * channel counts stay truthful.
 */
function RaiseModal({ items, vendors, onClose, onDone }: { items: Item[]; vendors: Vendor[]; onClose: () => void; onDone: () => void }) {
  const [source, setSource] = useState("Procurement");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [askedBy, setAskedBy] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Typing a shelf line's SKU or name links the buy to that line, so receiving
  // lands on the same stock item the store counts.
  const pick = (value: string) => {
    const hit = items.find((i) => i.sku.toLowerCase() === value.toLowerCase() || i.name.toLowerCase() === value.toLowerCase());
    setName(hit ? hit.name : value);
    setSku(hit ? hit.sku : value);
  };

  const submit = async () => {
    const qtyNum = Number(qty);
    if (!name.trim()) { toast.error("What is being bought?"); return; }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) { toast.error("Quantity must be a positive number."); return; }
    const costNum = cost.trim() ? Number(cost) : null;
    if (costNum !== null && (!Number.isFinite(costNum) || costNum < 0)) { toast.error("Estimated unit cost must be zero or more."); return; }
    const shelf = items.find((i) => i.sku.toLowerCase() === (sku || name).trim().toLowerCase());
    setBusy(true);
    try {
      await fetchApi("/procurement", {
        method: "POST",
        body: JSON.stringify({
          partName: name.trim(),
          sku: (sku || name).trim(),
          category: shelf?.category,
          itemId: shelf?.id,
          quantity: qtyNum,
          kind: "Part",
          status: "Requested",
          source,
          vendor: vendor.trim() || null,
          unitPrice: costNum,
          requestedBy: askedBy.trim() || null,
          note: note.trim() || null,
        }),
      });
      toast.success(`${name} raised for ${source}.`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not raise that purchase.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Raise a purchase"
      subtitle="A part, a one-off for a truck, or the TM's strategic order — it lands in the inbox under the desk that asked."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-[12.5px] font-medium text-[#41556B]">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-lg bg-[#1B2432] px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">
            {busy ? "Raising…" : "Raise PO"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Requested by desk" hint="Which department's request this is.">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Asked by" hint="Optional — the person or seat wanting it.">
          <input value={askedBy} onChange={(e) => setAskedBy(e.target.value)} className={inputCls} placeholder="e.g. TM, or a mechanic" />
        </Field>
        <Field label="Part or asset" hint="Type a shelf item or a new one-off part.">
          <input value={name} onChange={(e) => pick(e.target.value)} list="raise-parts" className={inputCls} placeholder="e.g. Tyre 315/80R22.5" />
          <datalist id="raise-parts">
            {items.slice(0, 400).map((i) => <option key={i.id} value={i.name}>{i.sku}</option>)}
          </datalist>
        </Field>
        <Field label="SKU / stock code" hint="Existing codes add to that line; a new code creates it on receiving.">
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputCls} placeholder="Matches the shelf" />
        </Field>
        <Field label="Quantity"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
        <Field label="Estimated unit cost (₦)" hint="Optional — what the buyer expects to pay.">
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={inputCls} placeholder="e.g. 45000" />
        </Field>
        <Field label="Vendor" hint="Optional — the supplier to buy from.">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} list="raise-vendors" className={inputCls} placeholder="Who supplies it" />
          <datalist id="raise-vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </Field>
        <Field label="Note" hint="Why it's needed, which truck, or the reference.">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
