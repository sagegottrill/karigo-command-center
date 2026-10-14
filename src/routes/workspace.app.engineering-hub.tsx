import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  Package,
  Search,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import {
  InspectionDialog,
  InspectionReportCard,
  MaintenanceCompleteDialog,
  type CheckAsset,
} from "@/components/fleetopsx/eng-checkup";
import { RequestsBoard } from "@/components/fleetopsx/eng-requests";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import {
  ENGINEERING_ACCESS_ROLES,
  rolesCanWorkOnTrucks,
  truckLabel,
} from "@/lib/fleetopsx/engineering-helpers";
import { indexWorkOrdersByTruck, lookupForTruck } from "@/lib/fleetopsx/engineering-helpers";
import { liveListFuelRequests } from "@/lib/fleetopsx/live-api";
import { groupRequisitions } from "@/lib/fleetopsx/request-status";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  authService,
  engineeringService,
  fleetService,
  inventoryService,
} from "@/lib/fleetopsx/services";
import type {
  FuelRequest,
  InventoryItem,
  InventoryRequisition,
  TruckHead,
  TruckTail,
  WorkOrder,
} from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/engineering-hub")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: MaintenanceHub,
});

const TABS = ["Overview", "Check-up Queue", "Maintenance Queue", "Maintenance Log", "Requests"] as const;
type Tab = (typeof TABS)[number];

const tailName = (t: TruckTail) => `${t.number}${t.registration ? ` (${t.registration})` : ""}`;
const tailReg = (t: TruckTail) => t.registration || t.number;

function assetOfHead(h: TruckHead): CheckAsset {
  return { id: h.id, kind: "head", label: truckLabel(h), reg: h.registration };
}
function assetOfTail(t: TruckTail): CheckAsset {
  return { id: t.id, kind: "tail", label: tailName(t), reg: tailReg(t) };
}

function MaintenanceHub() {
  const [canWork, setCanWork] = useState(false);
  const [canTM, setCanTM] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [requisitions, setRequisitions] = useState<InventoryRequisition[]>([]);
  const [fuel, setFuel] = useState<FuelRequest[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [inspecting, setInspecting] = useState<CheckAsset | null>(null);
  const [completing, setCompleting] = useState<CheckAsset | null>(null);
  const [completingBusy, setCompletingBusy] = useState(false);
  const [reportJob, setReportJob] = useState<WorkOrder | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const me = authService.getCurrentUser()?.name || "";

  const refresh = async () => {
    try {
      const [fleet, tailRows, wos, reqs, itemsRows] = await Promise.all([
        fleetService.listHeads().catch(() => [] as TruckHead[]),
        fleetService.listTails().catch(() => [] as TruckTail[]),
        engineeringService.listWorkOrders().catch(() => [] as WorkOrder[]),
        inventoryService.requisitions().catch(() => [] as InventoryRequisition[]),
        inventoryService.list().catch(() => [] as InventoryItem[]),
      ]);
      let fuelRows: FuelRequest[] = [];
      try {
        fuelRows = (await liveListFuelRequests("")).requests;
      } catch {
        fuelRows = [];
      }
      setHeads(fleet);
      setTails(tailRows);
      setOrders(wos);
      setRequisitions(reqs);
      setItems(itemsRows);
      setFuel(fuelRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the hub.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCanWork(rolesCanWorkOnTrucks());
    const roles = authService.getRoles();
    setCanTM(roles.includes("Transport Manager") || roles.includes("Platform Admin"));
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { open } = useMemo(() => indexWorkOrdersByTruck(orders), [orders]);

  const checkupAssets = useMemo(
    () => [
      ...heads.filter((h) => h.status === "Check Up").map(assetOfHead),
      ...tails.filter((t) => t.status === "Check Up").map(assetOfTail),
    ],
    [heads, tails],
  );
  const maintAssets = useMemo(
    () => [
      ...heads.filter((h) => h.status === "Maintenance").map(assetOfHead),
      ...tails.filter((t) => t.status === "Maintenance").map(assetOfTail),
    ],
    [heads, tails],
  );
  const availableCount = useMemo(
    () => heads.filter((h) => h.status === "Available").length + tails.filter((t) => t.status === "Available").length,
    [heads, tails],
  );
  const activeRequests = useMemo(
    () =>
      groupRequisitions(requisitions).filter((g) =>
        ["Awaiting HOE Review", "Awaiting Admin Approval", "Approved by Admin", "Awaiting Procurement"].includes(g.stage),
      ).length,
    [requisitions],
  );

  const openFor = (a: CheckAsset) => {
    // The index is keyed by plate — a bare registration is enough to look up.
    const probe = { registration: a.reg } as TruckHead;
    return lookupForTruck(open, probe) ?? null;
  };

  const partsForTruck = (reg: string) =>
    requisitions.filter((r) => r.truckReg === reg && r.status !== "Rejected");

  const filteredAssets = (list: CheckAsset[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => `${a.label} ${a.reg}`.toLowerCase().includes(q));
  };

  const completeRepairs = async (asset: CheckAsset, notes: string) => {
    setCompletingBusy(true);
    try {
      if (asset.kind === "head") await fleetService.updateHeadStatus(asset.id, "Available", asset.label);
      else await fleetService.updateTailStatus(asset.id, "Available", asset.label);
      const job = openFor(asset);
      if (job && job.status !== "Completed") {
        if (notes) await engineeringService.updateWorkOrder(job.id, { notes }).catch(() => null);
        await engineeringService.complete(job.id);
      }
      toast.success(`${asset.label} returned to Available.`);
      setCompleting(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not return the truck.");
    } finally {
      setCompletingBusy(false);
    }
  };

  const logOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...orders]
      .filter((o) => !q || `${o.truckReg} ${o.defect} ${o.mechanic} ${o.reportedBy} ${o.status}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt)));
  }, [orders, query]);

  const logPageCount = Math.max(1, Math.ceil(logOrders.length / PAGE_SIZE));
  const logPage = Math.min(page, logPageCount - 1);
  const logSlice = logOrders.slice(logPage * PAGE_SIZE, logPage * PAGE_SIZE + PAGE_SIZE);

  const partsForJob = (job: WorkOrder) => {
    const direct = requisitions.filter((r) => r.workOrder && r.workOrder === job.id);
    if (direct.length) return direct;
    return requisitions.filter(
      (r) => r.truckReg === job.truckReg && r.date >= (job.reportedAt || ""),
    );
  };

  if (loading) {
    return (
      <>
        <DepartmentTabs department="engineering" />
        <FigmaLoadingState label="Loading the maintenance hub…" />
      </>
    );
  }

  const cards = [
    { label: "Available", value: availableCount, hint: "Ready Fleet", tone: "green" as const, icon: CheckCircle2 },
    { label: "Parts Request", value: activeRequests, hint: "Active", tone: "blue" as const, icon: Package },
    { label: "Check-up", value: checkupAssets.length, hint: "In Queue", tone: "amber" as const, icon: CalendarCheck },
    { label: "Under Maintenance", value: maintAssets.length, hint: "In Repair", tone: "red" as const, icon: Wrench },
  ];

  return (
    <>
      <DepartmentTabs department="engineering" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div>
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Maintenance Hub</h2>
          <p className="text-[11.4px] uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Manage maintenance cycle from inspection to parts requisition
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setPage(0); setQuery(""); }}
              className={cn(
                "h-9 rounded-[8px] border px-3.5 text-[13.5px] font-medium",
                tab === t ? "border-[#1B2432] bg-[#1B2432] text-white" : "border-[#E2E5E9] bg-white text-[#5C6470] hover:text-[#1B2432]",
              )}
            >
              {t}
              {t === "Check-up Queue" && checkupAssets.length > 0 ? ` (${checkupAssets.length})` : ""}
              {t === "Maintenance Queue" && maintAssets.length > 0 ? ` (${maintAssets.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "Overview" ? (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {cards.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() =>
                    setTab(
                      c.label === "Available"
                        ? "Overview"
                        : c.label === "Parts Request"
                          ? "Requests"
                          : c.label === "Check-up"
                            ? "Check-up Queue"
                            : "Maintenance Queue",
                    )
                  }
                  className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white p-4 text-left shadow-[0px_4px_16px_rgba(12,12,13,0.05)] hover:border-[#1B2432]"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[#5C6470]">{c.label}</span>
                    <c.icon className="size-4 text-[#8E95A1]" />
                  </span>
                  <span className="text-[30px] font-bold leading-8 text-[#1B2432] tabular-nums">{c.value}</span>
                  <span className="text-[12px] text-[#8E95A1]">{c.hint}</span>
                </button>
              ))}
            </div>
            <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2432]">
                Check-up Queue
                <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] text-white">
                  {checkupAssets.length}
                </span>
              </p>
              <p className="text-[12.5px] text-[#8E95A1]">Returning fleet awaiting evaluation</p>
              {checkupAssets.length === 0 ? (
                <p className="py-6 text-center text-[13.5px] text-[#8E95A1]">No truck is waiting for check-up.</p>
              ) : (
                <div className="mt-3 flex flex-col divide-y divide-[#E2E5E9]">
                  {checkupAssets.slice(0, 5).map((a) => (
                    <div key={a.kind + a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-[14px] font-medium text-[#1B2432]">{a.label}</span>
                      {canWork ? (
                        <button
                          type="button"
                          onClick={() => setInspecting(a)}
                          className="h-8 shrink-0 rounded bg-[#ED351D] px-3 text-[13px] font-medium text-white hover:bg-[#d62e19]"
                        >
                          Inspect
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {tab === "Check-up Queue" ? (
          <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[16px] font-semibold text-[#1B2432]">
                  Check-up Queue
                  <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] text-white">
                    {checkupAssets.length}
                  </span>
                </p>
                <p className="text-[12.5px] text-[#8E95A1]">Returning fleet awaiting evaluation</p>
              </div>
              <label className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] px-2.5 text-[13px] text-[#5C6470]">
                <Search className="size-4" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search check-up queue" className="w-36 bg-transparent outline-none placeholder:text-[#8E95A1]" />
              </label>
            </div>
            {filteredAssets(checkupAssets).length === 0 ? (
              <FigmaEmptyState title="Queue is clear" body="Returned trucks land here for inspection." />
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredAssets(checkupAssets).map((a) => (
                  <div key={a.kind + a.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E2E5E9] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold text-[#1B2432]">{a.label}</p>
                      <p className="text-[12px] text-[#8E95A1]">{a.kind === "head" ? "Truck Head" : "Truck Tail"} • Check Up</p>
                    </div>
                    {canWork ? (
                      <button
                        type="button"
                        onClick={() => setInspecting(a)}
                        className="h-9 shrink-0 rounded bg-[#ED351D] px-4 text-[13.5px] font-medium text-white hover:bg-[#d62e19]"
                      >
                        Inspect
                      </button>
                    ) : (
                      <span className="shrink-0 rounded-full bg-[#F99E1F]/15 px-2.5 py-1 text-[11px] font-semibold text-[#B26A00]">
                        Awaiting inspection
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "Maintenance Queue" ? (
          <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[16px] font-semibold text-[#1B2432]">
                  Fleet Under Maintenance
                  <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] text-white">
                    {maintAssets.length}
                  </span>
                </p>
                <p className="text-[12.5px] text-[#8E95A1]">Manage fleet grounded for repairs following defect log</p>
              </div>
              <label className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] px-2.5 text-[13px] text-[#5C6470]">
                <Search className="size-4" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search maintenance queue" className="w-36 bg-transparent outline-none placeholder:text-[#8E95A1]" />
              </label>
            </div>
            {filteredAssets(maintAssets).length === 0 ? (
              <FigmaEmptyState title="No truck under maintenance" body="Defects logged at check-up ground trucks here." />
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredAssets(maintAssets).map((a) => {
                  const job = openFor(a);
                  const parts = partsForTruck(a.reg);
                  const awaiting = parts.filter((p) => ["Awaiting HOE Review", "Awaiting Admin Approval", "Awaiting Pickup", "Awaiting Procurement"].includes(p.status));
                  return (
                    <div key={a.kind + a.id} className="rounded-[8px] border border-[#E2E5E9] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[14.5px] font-semibold text-[#1B2432]">
                          {a.kind === "head" ? "Truck Head" : "Truck Tail"}: {a.label}
                        </p>
                        <span className="rounded-full bg-[#ED351D]/10 px-2.5 py-1 text-[11px] font-semibold text-[#ED351D]">
                          Under Maintenance
                        </span>
                      </div>
                      {job?.severity ? (
                        <p className="mt-1.5 text-[12px] text-[#5C6470]">
                          Severity: <span className="font-semibold text-[#1B2432]">{job.severity.toUpperCase()}</span>
                        </p>
                      ) : null}
                      {job?.defect ? (
                        <div className="mt-2 rounded-[6px] border border-[#ED351D]/25 bg-[#FFF5F4] px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#ED351D]">Logged Defect:</p>
                          <p className="text-[13.5px] text-[#1B2432]">{job.defect}</p>
                        </div>
                      ) : null}
                      <p className="mt-2 text-[12.5px] text-[#5C6470]">
                        Parts Request:{" "}
                        {parts.length === 0 ? (
                          <span className="text-[#8E95A1]">none raised</span>
                        ) : (
                          <span className="font-medium text-[#1B2432]">
                            {parts.map((p) => p.part).slice(0, 3).join(" + ")}
                            {awaiting.length > 0 ? (
                              <span className="ml-2 rounded-full bg-[#F99E1F]/15 px-2 py-0.5 text-[11px] font-semibold text-[#B26A00]">
                                Awaiting Approval
                              </span>
                            ) : (
                              <span className="ml-2 rounded-full bg-[#34C759]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0A8F4D]">
                                Issued
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                      {canWork ? (
                        <button
                          type="button"
                          onClick={() => setCompleting(a)}
                          className="mt-3 h-10 w-full rounded bg-[#34C759] text-[14px] font-medium text-white hover:bg-[#2cab4e]"
                        >
                          Complete Repairs and Set as Available
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {tab === "Maintenance Log" ? (
          <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1B2432]">Fleet Inspection Log</h3>
                <p className="text-[12.5px] text-[#8E95A1]">Manage historical records of completed physical inspection</p>
              </div>
              <label className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] px-2.5 text-[13px] text-[#5C6470]">
                <Search className="size-4" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search log" aria-label="Search maintenance log" className="w-36 bg-transparent outline-none placeholder:text-[#8E95A1]" />
              </label>
            </div>
            {logSlice.length === 0 ? (
              <FigmaEmptyState title="No inspection records" body="Completed check-ups file their reports here." />
            ) : (
              <div className="mt-3 flex flex-col divide-y divide-[#E2E5E9]">
                {logSlice.map((o) => (
                  <div key={o.id} className="relative flex items-center justify-between gap-3 py-2.5">
                    <button type="button" onClick={() => setReportJob(o)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[14px] font-medium text-[#1B2432]">
                        {o.truckReg} • {o.defect || "Passed inspection"}
                      </p>
                      <p className="text-[12px] text-[#8E95A1]">
                        {formatDateLines(o.completedAt || o.reportedAt).date} • {o.status}
                        {o.severity ? ` • ${o.severity}` : ""} • {o.inspectedBy || o.reportedBy}
                      </p>
                    </button>
                    <RowActionMenu
                      open={menuFor === o.id}
                      onOpenChange={(v) => setMenuFor(v ? o.id : null)}
                      items={[
                        { label: "Open inspection report", onSelect: () => { setReportJob(o); setMenuFor(null); } },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-[13px] text-[#5C6470]">
              <span>{logOrders.length === 0 ? 0 : logPage * PAGE_SIZE + 1} – {Math.min(logOrders.length, logPage * PAGE_SIZE + PAGE_SIZE)} of {logOrders.length}</span>
              <span className="flex gap-1.5">
                <button type="button" aria-label="Previous page" disabled={logPage === 0} onClick={() => setPage(logPage - 1)} className="grid size-8 place-items-center rounded border border-[#E2E5E9] bg-white disabled:opacity-40">
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" aria-label="Next page" disabled={logPage >= logPageCount - 1} onClick={() => setPage(logPage + 1)} className="grid size-8 place-items-center rounded border border-[#E2E5E9] bg-white disabled:opacity-40">
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </div>
          </div>
        ) : null}

        {tab === "Requests" ? (
          <RequestsBoard
            requisitions={requisitions}
            fuel={fuel}
            heads={heads}
            tails={tails}
            items={items}
            canWork={canWork}
            canTM={canTM}
            onRefresh={() => void refresh()}
          />
        ) : null}

        {tab !== "Overview" && tab !== "Requests" ? (
          <p className="flex items-center gap-2 text-[12.5px] text-[#8E95A1]">
            <History className="size-4" />
            <ClipboardList className="size-4" />
            Tip: the full request trail — parts, lubricant, HOE review and store handover — lives under Requests.
          </p>
        ) : null}
      </div>

      {inspecting ? (
        <InspectionDialog
          asset={inspecting}
          items={items}
          inspector={me}
          onClose={() => setInspecting(null)}
          onDone={() => void refresh()}
        />
      ) : null}
      {completing ? (
        <MaintenanceCompleteDialog
          asset={completing}
          busy={completingBusy}
          onClose={() => (completingBusy ? null : setCompleting(null))}
          onConfirm={(notes) => void completeRepairs(completing, notes)}
        />
      ) : null}
      {reportJob ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Inspection report"
          onClick={() => setReportJob(null)}
        >
          <div className="my-6 w-full max-w-[560px]" onClick={(e) => e.stopPropagation()}>
            <InspectionReportCard job={reportJob} parts={partsForJob(reportJob)} />
            <button
              type="button"
              onClick={() => setReportJob(null)}
              className="mt-3 h-10 w-full rounded border border-white/30 text-[14px] font-medium text-white hover:bg-white/10"
            >
              Close report
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
