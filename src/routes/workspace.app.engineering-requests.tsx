import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  InspectionDialog,
  InspectionReportCard,
  MaintenanceCompleteDialog,
  type CheckAsset,
} from "@/components/fleetopsx/eng-checkup";
import {
  GroupReviewDialog,
  PartsRequestDialog,
  LubricantRequestDialog,
} from "@/components/fleetopsx/eng-requests";
import {
  authService,
  engineeringService,
  fleetService,
  formatNairaFull,
  inventoryService,
} from "@/lib/fleetopsx/services";
import { liveListFuelRequests, liveSetFuelRequestStatus } from "@/lib/fleetopsx/live-api";
import {
  fuelBadge,
  groupRequisitions,
  type RequestGroup,
} from "@/lib/fleetopsx/request-status";
import {
  ENGINEERING_ACCESS_ROLES,
  indexWorkOrdersByTruck,
  rolesCanWorkOnTrucks,
  truckLabel,
} from "@/lib/fleetopsx/engineering-helpers";
import type {
  FuelRequest,
  InventoryItem,
  InventoryRequisition,
  TruckHead,
  TruckTail,
  WorkOrder,
} from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * THE ENGINEERING PAGE — ONE BOARD, THE MERGED HUB.
 *
 * Previously this lived as three places: the old Work Orders page
 * (/engineering), the Maintenance Hub (/engineering-hub) and this
 * Authorization page. They were the same department seen from three doors, so
 * they are one page now: Requests first (the authorization the design prints),
 * then the hub's own sections — Overview, Check-up Queue, Maintenance Queue,
 * Maintenance Log — as in-page sections, and the report behind its own toggle.
 */
export const Route = createFileRoute("/workspace/app/engineering-requests")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const roles = authService.getRoles();
    if (!roles.some((r: string) => ["Transport Manager", "Platform Admin", "Engineering", "Engineering & Maintenance", "Engineering and Maintenance"].includes(r))) {
      window.location.assign("/workspace/app/unauthorized");
    }
  },
  component: EngineeringRequestsPage,
});

type Tab = "parts" | "lubricant";
type Section = "requests" | "hoe" | "overview" | "checkup" | "queue" | "log";

const tailLabel = (t: TruckTail) => (t.registration ? `${t.number} (${t.registration})` : t.number);

const assetOfHead = (h: TruckHead): CheckAsset => ({
  id: h.id,
  kind: "head",
  label: truckLabel(h),
  reg: h.registration,
});
const assetOfTail = (t: TruckTail): CheckAsset => ({
  id: t.id,
  kind: "tail",
  label: tailLabel(t),
  reg: t.registration || t.number,
});

function toCsv(rows: string[][]) {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function EngineeringRequestsPage() {
  const [tab, setTab] = useState<Tab>("parts");
  const [reportView, setReportView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [requisitions, setRequisitions] = useState<InventoryRequisition[]>([]);
  const [fuel, setFuel] = useState<FuelRequest[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [partsForm, setPartsForm] = useState(false);
  const [lubeForm, setLubeForm] = useState(false);

  // The merged hub's own state: which section shows, the asset under inspection,
  // completion and the log rows.
  const [section, setSection] = useState<Section>("requests");
  const [assetQuery, setAssetQuery] = useState("");
  const [hoeReviewing, setHoeReviewing] = useState<RequestGroup | null>(null);
  const [inspecting, setInspecting] = useState<CheckAsset | null>(null);
  const [completing, setCompleting] = useState<CheckAsset | null>(null);
  const [completingBusy, setCompletingBusy] = useState(false);

  const me = authService.getCurrentUser()?.name || "Transport Manager";
  const canTM = authService.getRoles().some((r: string) => ["Transport Manager", "Platform Admin"].includes(r));
  const canWork = authService.getRoles().some((r: string) => ENGINEERING_ACCESS_ROLES.includes(r));

  const refresh = useCallback(async () => {
    const [headsRows, tailsRows, store, reqs, wos] = await Promise.all([
      fleetService.listHeads().catch(() => [] as TruckHead[]),
      fleetService.listTails().catch(() => [] as TruckTail[]),
      inventoryService.list().catch(() => [] as InventoryItem[]),
      inventoryService.requisitions().catch(() => [] as InventoryRequisition[]),
      engineeringService.listWorkOrders().catch(() => [] as WorkOrder[]),
    ]);
    let fuelRows: FuelRequest[] = [];
    try {
      fuelRows = (await liveListFuelRequests("")).requests;
    } catch {
      fuelRows = [];
    }
    setHeads(headsRows);
    setTails(tailsRows);
    setItems(store);
    setRequisitions(reqs);
    setFuel(fuelRows);
    setOrders(wos);
  }, []);

  useEffect(() => {
    void refresh()
      .catch(() => toast.error("Failed to load the requests"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const groups = useMemo(() => groupRequisitions(requisitions), [requisitions]);
  const engFuel = useMemo(
    () =>
      fuel
        .filter((f) => f.source === "Internal Use" && f.targetType)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [fuel],
  );

  /** The head of engineering's queue: what is still Awaiting HOE Review. */
  const hoeParts = useMemo(() => groups.filter((g) => g.stage === "Awaiting HOE Review"), [groups]);
  const hoeLube = useMemo(() => engFuel.filter((f) => f.status === "Requested"), [engFuel]);

  /** The Figma queue: only the group the TM authorises — with a real target. */
  const pendingParts = useMemo(
    () => groups.filter((g) => g.stage === "Awaiting Admin Approval" || g.lines.some((l) => l.status === "Pending")),
    [groups],
  );
  const pendingLube = useMemo(
    () => engFuel.filter((f) => f.status === "HOE Approved" || f.status === "Requested"),
    [engFuel],
  );

  const stockOf = (part: string) => {
    const hit = items.find(
      (i) => i.name.trim().toLowerCase() === part.trim().toLowerCase(),
    );
    return hit ? hit.stock : null;
  };

  /* ------------------------------------------------ the two decisions */

  const rejectGroup = async (key: string, lines: InventoryRequisition[]) => {
    const note = (window.prompt(`Why is request ${key} rejected? Attached to the record.`) ?? "").trim();
    if (!note) return;
    setBusyId(key);
    try {
      for (const l of lines) await inventoryService.rejectRequisition(l.id, note);
      toast.success(`${key} rejected.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The rejection was not saved.");
    } finally {
      setBusyId(null);
    }
  };

  const approveGroup = async (key: string, lines: InventoryRequisition[]) => {
    setBusyId(key);
    try {
      for (const l of lines) {
        await inventoryService.approveRequisition({ id: l.id, itemId: l.itemId, quantity: l.quantity });
      }
      toast.success(`${key} authorized — handed to the store floor.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The authorization was not saved.");
    } finally {
      setBusyId(null);
    }
  };

  const decideFuel = async (r: FuelRequest, approve: boolean, hoe: boolean) => {
    setBusyId(r.id);
    try {
      if (hoe) {
        const reason = approve ? "" : (window.prompt(`Why is ${r.reference} declined? Attached to the record.`) ?? "").trim();
        if (!approve && !reason) {
          setBusyId(null);
          return;
        }
        await inventoryService.hoeReviewFuelRequest(r.id, approve, reason);
        toast.success(approve ? `${r.reference} validated — sent to the TM desk.` : `${r.reference} declined.`);
      } else {
        await liveSetFuelRequestStatus(r.id, approve ? "Authorized" : "Declined");
        toast.success(approve ? `${r.reference} authorized — the desk can dispense it.` : `${r.reference} declined.`);
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The decision was not saved.");
    } finally {
      setBusyId(null);
    }
  };

  /* -------------------------------------------------- hub derived state */

  const { open } = useMemo(() => indexWorkOrdersByTruck(orders), [orders]);

  /** Hub assets, check-up and maintenance queues, keyed the way the hub does. */
  const checkupAssets = useMemo(
    (): CheckAsset[] => [
      ...heads.filter((h) => h.status === "Check Up").map(assetOfHead),
      ...tails.filter((t) => t.status === "Check Up").map(assetOfTail),
    ],
    [heads, tails],
  );
  const maintAssets = useMemo(
    (): CheckAsset[] => [
      ...heads.filter((h) => h.status === "Maintenance").map(assetOfHead),
      ...tails.filter((t) => t.status === "Maintenance").map(assetOfTail),
    ],
    [heads, tails],
  );
  const completedJobs = useMemo(
    () =>
      [...orders]
        .filter((o) => o.status === "Completed" || o.status === "Cancelled")
        .sort((a, b) => String(b.completedAt || b.reportedAt).localeCompare(String(a.completedAt || a.reportedAt))),
    [orders],
  );
  const availableCount = useMemo(
    () => heads.filter((h) => h.status === "Available").length + tails.filter((t) => t.status === "Available").length,
    [heads, tails],
  );

  const filterAssets = (list: CheckAsset[]): CheckAsset[] => {
    const q = assetQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => `${a.label} ${a.reg}`.toLowerCase().includes(q));
  };

  const openFor = (a: CheckAsset) => {
    const probe = { registration: a.reg } as TruckHead;
    const direct = Array.from(open.values()).find((o) => o.truckReg === a.reg);
    return direct ?? null;
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

  /* -------------------------------------------------- maintenance report */

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-[#F1F2F4] p-[30px]">
        <FigmaLoadingState label="Loading engineering page…" />
      </div>
    );
  }

  if (reportView) {
    return (
      <>
        <div className="flex w-full items-center gap-3 bg-[#F1F2F4] px-4 pt-4 md:px-[30px]">
          <button
            type="button"
            onClick={() => setReportView(false)}
            className="grid size-9 place-items-center rounded-full text-[#1B2432] hover:bg-[#E4E6EA]"
            aria-label="Back to authorization"
          >
            <ArrowLeft className="size-5" />
          </button>
        </div>
        <MaintenanceReportView
          heads={heads}
          tails={tails}
          requisitions={requisitions}
        />
      </>
    );
  }

  /* ============================ authorization board ============================ */
  /** PARTS / LUBRICANT AUTHORIZATION (the design's first screen) — as its own
   *  JSX block so the section nav can show it first. */
  const authorizationBoard = (
    <EngineeringRequestsBoard
      tab={tab}
      setTab={setTab}
      pendingParts={pendingParts}
      pendingLube={pendingLube}
      engFuel={engFuel}
      items={items}
      busyId={busyId}
      canTM={canTM}
      canWork={canWork}
      onRejectGroup={rejectGroup}
      onApproveGroup={approveGroup}
      onDecideFuel={decideFuel}
      stockOf={stockOf}
    />
  );

  /* ================================ HOE review desk ============================ */
  /** The head of engineering's approval screen: everything still awaiting his
   *  review, before the TM authorisation board sees it. */
  const hoeDesk = (
    <HoeReviewDesk
      parts={hoeParts}
      lube={hoeLube}
      stockOf={stockOf}
      busy={busyId}
      onReviewGroup={(g) => setHoeReviewing(g)}
      onDecideFuel={decideFuel}
    />
  );

  /* ================================ hub sections ============================== */
  const hubOverview = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {([
          ["Available", availableCount, "Ready Fleet"],
          ["Parts Request", pendingParts.length, "Active"],
          ["Check-up", checkupAssets.length, "In Queue"],
          ["Under Maintenance", maintAssets.length, "In Repair"],
        ] as const).map(([label, value, hint]) => (
          <div key={label} className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
            <span className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[#5C6470]">{label}</span>
            </span>
            <span className="text-[30px] font-bold leading-8 text-[#1B2432] tabular-nums">{value}</span>
            <span className="text-[12px] text-[#8E95A1]">{hint}</span>
          </div>
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
    </div>
  );

  const hubCheckup = (
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
          <input value={assetQuery} onChange={(e) => setAssetQuery(e.target.value)} placeholder="Search" aria-label="Search check-up queue" className="w-36 bg-transparent outline-none placeholder:text-[#8E95A1]" />
        </label>
      </div>
      {filterAssets(checkupAssets).length === 0 ? (
        <FigmaEmptyState title="Queue is clear" body="Returned trucks land here for inspection." />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filterAssets(checkupAssets).map((a) => (
            <div key={a.kind + a.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E2E5E9] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-semibold text-[#1B2432]">{a.label}</p>
                <p className="text-[12px] text-[#8E95A1]">{a.kind === "head" ? "Truck Head" : "Truck Tail"} • Check Up</p>
              </div>
              {canWork ? (
                <button type="button" onClick={() => setInspecting(a)} className="h-9 shrink-0 rounded bg-[#ED351D] px-4 text-[13.5px] font-medium text-white hover:bg-[#d62e19]">
                  Inspect
                </button>
              ) : (
                <span className="shrink-0 rounded-full bg-[#F99E1F]/15 px-2.5 py-1 text-[11px] font-semibold text-[#B26A00]">Awaiting inspection</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const hubQueue = (
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
          <input value={assetQuery} onChange={(e) => setAssetQuery(e.target.value)} placeholder="Search" aria-label="Search maintenance queue" className="w-36 bg-transparent outline-none placeholder:text-[#8E95A1]" />
        </label>
      </div>
      {filterAssets(maintAssets).length === 0 ? (
        <FigmaEmptyState title="No truck under maintenance" body="Defects logged at check-up ground trucks here." />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filterAssets(maintAssets).map((a) => {
            const awaiting = requisitions.filter(
              (p) => p.truckReg === a.reg && ["Awaiting HOE Review", "Awaiting Admin Approval", "Awaiting Pickup", "Awaiting Procurement"].includes(p.status),
            );
            return (
              <div key={a.kind + a.id} className="rounded-[8px] border border-[#E2E5E9] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14.5px] font-semibold text-[#1B2432]">
                    {a.kind === "head" ? "Truck Head" : "Truck Tail"}: {a.label}
                  </p>
                  <span className="rounded-full bg-[#ED351D]/10 px-2.5 py-1 text-[11px] font-semibold text-[#ED351D]">Under Maintenance</span>
                </div>
                {(() => {
                  const job = openFor(a);
                  return job?.mechanic ? (
                    <p className="mt-1.5 text-[12px] text-[#5C6470]">
                      Assigned engineer: <span className="font-medium text-[#1B2432]">{job.mechanic}</span>
                    </p>
                  ) : null;
                })()}
                {awaiting.length > 0 ? (
                  <p className="mt-1.5 text-[12px] text-[#5C6470]">
                    Parts: {awaiting.map((p) => p.part).slice(0, 3).join(" + ")} ({awaiting.length} awaiting approval)
                  </p>
                ) : null}
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
  );

  const hubLog = (
    <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-4">
      <h3 className="text-[16px] font-semibold text-[#1B2432]">Fleet Inspection Log</h3>
      <p className="mt-0.5 text-[12.5px] text-[#8E95A1]">Completed inspections, newest first</p>
      {completedJobs.length === 0 ? (
        <p className="py-6 text-center text-[13.5px] text-[#8E95A1]">No completed job on record yet.</p>
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-[#E2E5E9]">
          {completedJobs.slice(0, 12).map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-[#1B2432]">
                  {o.truckReg} • {o.defect || "Passed inspection"}
                </span>
                <span className="text-[12px] text-[#8E95A1]">
                  {(o.completedAt || o.reportedAt || "").slice(0, 10)} • {o.severity || o.priority}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:p-[30px] md:pb-[30px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-[5px] md:max-w-[520px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Engineering</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Parts and lubricant requests, the maintenance cycle, and the official report
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canWork}
            onClick={() => setLubeForm(true)}
            className="h-10 rounded bg-[#1B2432] px-4 text-[14px] font-medium text-white hover:bg-[#2a3547] disabled:opacity-40"
          >
            Request Lubricant
          </button>
          <button
            type="button"
            disabled={!canWork}
            onClick={() => setPartsForm(true)}
            className="h-10 rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-40"
          >
            Request Part
          </button>
          <button
            type="button"
            onClick={() => setReportView(true)}
            className="h-10 rounded border border-[#E2E5E9] bg-white px-4 text-[14px] font-medium tracking-[0.4px] text-[#8E95A1] hover:text-[#1B2432]"
          >
            Fleet Maintenance Report
          </button>
        </div>
      </div>

      {/* THE ONE NAV. Requests first — then the hub's sections in one page,
          replacing the old Engineering/Maintenance Hub/Work Orders split. */}
      <div className="flex flex-wrap gap-2">
      {([
        ["requests", "Requests"],
        ["hoe", `HOE Review (${hoeParts.length + hoeLube.length})`],
        ["overview", "Overview"],
        ["checkup", `Check-up Queue (${checkupAssets.length})`],
        ["queue", `Maintenance Queue (${maintAssets.length})`],
        ["log", "Maintenance Log"],
      ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setSection(key);
              setAssetQuery("");
            }}
            className={cn(
              "h-9 rounded-[8px] border px-3.5 text-[13.5px] font-medium",
              section === key
                ? "border-[#1B2432] bg-[#1B2432] text-white"
                : "border-[#E2E5E9] bg-white text-[#5C6470] hover:text-[#1B2432]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "requests" ? authorizationBoard : null}
      {section === "hoe" ? hoeDesk : null}

      {section === "overview" ? hubOverview : null}
      {section === "checkup" ? hubCheckup : null}
      {section === "queue" ? hubQueue : null}
      {section === "log" ? hubLog : null}

      {inspecting ? (
        <InspectionDialog asset={inspecting} items={items} inspector={me} onClose={() => setInspecting(null)} onDone={() => void refresh()} />
      ) : null}
      {hoeReviewing ? (
        <GroupReviewDialog
          group={hoeReviewing}
          onClose={() => setHoeReviewing(null)}
          onDone={() => void refresh()}
        />
      ) : null}
      {completing ? (
        <MaintenanceCompleteDialog asset={completing} busy={completingBusy} onClose={() => (completingBusy ? null : setCompleting(null))} onConfirm={(notes) => void completeRepairs(completing, notes)} />
      ) : null}
      {partsForm ? (
        <PartsRequestDialog heads={heads} tails={tails} items={items} onClose={() => setPartsForm(false)} onDone={refresh} />
      ) : null}
      {lubeForm ? (
        <LubricantRequestDialog heads={heads} tails={tails} onClose={() => setLubeForm(false)} onDone={refresh} />
      ) : null}
    </div>
  );
}

/* ============================================================ REPORT VIEW */

type AssetLike = {
  id: string;
  number: string;
  capNumber?: string;
  registration: string;
  type?: string;
  make?: string;
};

const underMaintenanceLabel = (a: AssetLike, kind: "head" | "tail") =>
  kind === "head"
    ? a.capNumber
      ? `${a.capNumber} (${a.registration})`
      : a.number
    : `${a.number} \u2022 ${a.type || a.registration}`;

function MaintenanceReportView({
  heads,
  tails,
  requisitions,
}: {
  heads: (TruckHead & Partial<AssetLike>)[];
  tails: (TruckTail & Partial<AssetLike>)[];
  requisitions: InventoryRequisition[];
}) {
  const [kind, setKind] = useState<"head" | "tail">("head");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const underMaintenance = useMemo(
    () =>
      kind === "head"
        ? heads.filter((h) => h.status === "Maintenance" || h.status === "Check Up")
        : tails.filter((t) => t.status === "Maintenance" || t.status === "Check Up"),
    [kind, heads, tails],
  );

  useEffect(() => {
    setSelectedId(underMaintenance[0]?.id ?? null);
  }, [kind, underMaintenance]);

  const selected = underMaintenance.find((a) => a.id === selectedId) ?? null;
  const head = kind === "head" ? (selected as TruckHead | null) : null;
  const tail = kind === "tail" ? (selected as TruckTail | null) : null;

  const jobsFor = useCallback(
    (asset: { id: string } | null) => {
      if (!asset) return [];
      return requisitions.filter((r) => r.requestGroup && r.truckReg && r.status !== "Rejected").slice(0, 3);
    },
    [requisitions],
  );

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Standardized Fleet Maintenance Report</h2>
        <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
          Official maintenance report for truck heads and tails, formatted with details, diagnostic,
          timestamps and resolve date.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[440px_1fr]">
        <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="grid grid-cols-2 rounded bg-[#1B2432] p-1">
            {([
              ["head", "Truck Head"],
              ["tail", "Truck Tail"],
            ] as const).map(([k, label]) => {
              const n = k === "head"
                ? heads.filter((h) => h.status === "Maintenance" || h.status === "Check Up").length
                : tails.filter((t) => t.status === "Maintenance" || t.status === "Check Up").length;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "h-9 rounded text-[13px] font-medium",
                    kind === k ? "bg-white text-[#1B2432]" : "text-[#B8C0CC]",
                  )}
                >
                  {label} ({n})
                </button>
              );
            })}
          </div>
          <p className="flex items-center gap-2 text-[16px] font-semibold text-[#1B2432]">
            {kind === "head" ? "Truck Heads under Maintenance" : "Truck Tails under Maintenance"}
            <span className="grid h-6 min-w-6 place-items-center rounded bg-[#ED351D] px-1.5 text-[12px] text-white">
              {underMaintenance.length}
            </span>
          </p>

          {underMaintenance.length === 0 ? (
            <FigmaEmptyState
              title="Nothing under maintenance"
              body={kind === "head" ? "No truck head is in the workshop." : "No truck tail is in the workshop."}
            />
          ) : (
            underMaintenance.map((a, i) => {
              const on = a.id === selectedId;
              const label = kind === "head" ? truckLabel(a as TruckHead) : tailLabel(a as TruckTail);
              const cap =
                kind === "head"
                  ? `${(a as AssetLike).capNumber ?? (a as AssetLike).number} \u2022 ${(a as AssetLike).registration}`
                  : `${(a as AssetLike).number} \u2022 ${(a as AssetLike).type || (a as AssetLike).registration}`;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-[10px] border px-3 py-2.5 text-left",
                    i === 0 && on
                      ? "border-[#F3A69A] bg-[#FFF5F4]"
                      : "border-[#E2E5E9] bg-white hover:bg-[#F7F8FA]",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-[#1B2432]">{cap}</span>
                    <span className="rounded bg-[#FEE8E6] px-2 py-0.5 text-[10.5px] font-semibold text-[#ED351D]">
                      In Repair
                    </span>
                  </span>
                  <span className="text-[12.5px] text-[#5C6470]">{label}</span>
                  <span className="text-[11.5px] text-[#8E95A1]">
                    Asset id: {a.id.slice(0, 8)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Fleet Maintenance Report
            </h3>
            <span className="rounded border border-[#F3A69A] bg-[#FFF5F4] px-2.5 py-1 text-[12px] font-semibold text-[#ED351D]">
              MNT-REP-{new Date().toISOString().slice(2, 10).replace(/-/g, "")}
            </span>
          </div>

          {kind === "head" ? (
            <div className="rounded-[10px] bg-[#1B2432] px-5 py-4">
              <p className="text-[15px] font-semibold text-white">Truck Details</p>
              <div className="mt-3 grid grid-cols-3 gap-4">
                {[
                    ["Head Number", head ? ((head as AssetLike).capNumber ?? head.number) : "\u2014"],
                    ["Plate No", head?.registration ?? "\u2014"],
                    ["Make/Model", (head as AssetLike | null)?.make || head?.type || "\u2014"],
                  ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[11px] uppercase tracking-[0.4px] text-[#8FA0B3]">{label}</p>
                    <p className="mt-1 text-[15px] font-medium text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[10px] bg-[#1B2432] px-5 py-4">
              <p className="text-[15px] font-semibold text-white">Tail Details</p>
              <div className="mt-3 grid grid-cols-3 gap-4">
                {[
                  ["Tail Number", tail?.number ?? "\u2014"],
                  ["Tail Type", tail?.type ?? "\u2014"],
                  ["Reg", tail?.registration || "\u2014"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[11px] uppercase tracking-[0.4px] text-[#8FA0B3]">{label}</p>
                    <p className="mt-1 text-[15px] font-medium text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[10px] border border-[#E2E5E9] bg-[#FCFCFD] p-4">
            <div className="rounded bg-[#E9EDF1] px-3 py-2 text-[15px] font-medium text-[#1B2432]">
              Issue Diagnostics and Description
            </div>
            <div className="mt-2 rounded border border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px] text-[#344256]">
              {selected ? jobsFor(selected)[0]?.part || "Defect under repair \u2014 see the work order." : "\u2014"}
            </div>
            <div className="mt-2 min-h-[110px] rounded border border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px] text-[#627084]">
              {selected ? jobsFor(selected).map((j) => j.part).join(" \u2022 ") || "\u2014" : "\u2014"}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[13.5px] font-medium text-[#1B2432]">Reported on (Automated)</p>
                <div className="mt-1.5 h-10 rounded border border-[#E2E5E9] bg-[#F7F8FA] px-3 leading-10 text-[14px] text-[#627084]">
                  {new Date().toISOString().slice(0, 10)}
                </div>
              </div>
              <div>
                <p className="text-[13.5px] font-medium text-[#1B2432]">
                  Expected Date to Resolve <span className="text-[#ED351D]">*</span>
                </p>
                <div className="mt-1.5 h-10 rounded border border-[#F3A69A] bg-[#FFF5F4] px-3 leading-10 text-[14px] text-[#ED351D]">
                  {new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 rounded border border-[#E2E5E9] bg-white px-4 text-[14px] font-medium text-[#1B2432] hover:bg-[#F7F8FA]"
            >
              Print Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================= the HOE review desk ========================= */

/**
 * The head of engineering's approval screen.
 *
 * Every grouped parts request and engineering lubricant draw that is still
 * Awaiting HOE Review, in one queue: the workshop raises it here, the head of
 * engineering validates (correcting part names and quantities — that is the
 * review's whole point) or declines it with a reason, and only then does it
 * move to the TM's authorisation board. The server enforces the order — a call
 * on an already-reviewed group is refused — so this screen cannot skip a step.
 */
function HoeReviewDesk({
  parts,
  lube,
  stockOf,
  busy,
  onReviewGroup,
  onDecideFuel,
}: {
  /** Groups still awaiting HOE review — the desk's whole queue. */
  parts: RequestGroup[];
  /** Engineering lubricant draws still at Requested. */
  lube: FuelRequest[];
  stockOf: (part: string) => number | null;
  busy: string | null;
  onReviewGroup: (g: RequestGroup) => void;
  onDecideFuel: (r: FuelRequest, approve: boolean, hoe: boolean) => void;
}) {
  const empty = parts.length === 0 && lube.length === 0;
  return (
    <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <div className="mb-5 border-b border-[#E2E5E9] pb-4">
        <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
          Head of Engineering Approval
        </h3>
        <p className="mt-1 text-[12.5px] text-[#8E95A1]">
          Requests the workshop raised, waiting on this desk before the Transport Manager authorises them
        </p>
      </div>

      {empty ? (
        <FigmaEmptyState
          title="Nothing awaits HOE review"
          body="Requests the workshop raises appear here first — validate or decline them before they reach the TM."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {parts.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2432]">
                Spare Part Requests
                <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] text-white">
                  {parts.length}
                </span>
              </p>
              {parts.map((g) => (
                <div key={g.key} className="rounded-[10px] border border-[#E2E5E9] bg-[#F1F2F4]/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-[#1B2432]">
                        {g.truckReg === "WORKSHOP" ? "Workshop" : g.truckReg}
                        <span className="ml-2 text-[12px] font-normal text-[#8E95A1]">{g.key}</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-[#5C6470]">
                        Requested by: <span className="text-[#344256]">Engr. {g.requestedBy || "\u2014"}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy === g.key}
                      onClick={() => onReviewGroup(g)}
                      className="h-9 rounded bg-[#1B2432] px-3.5 text-[13px] font-medium text-white hover:bg-[#2a3547] disabled:opacity-60"
                    >
                      Review and Approve
                    </button>
                  </div>
                  <div className="mt-2 rounded-[6px] border border-[#F3A69A] bg-[#FFF5F4] px-3 py-2">
                    <p className="text-[13px] font-semibold text-[#ED351D]">Description:</p>
                    <p className="text-[13px] text-[#1B2432]">{g.description || "\u2014"}</p>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-[6px] border border-[#E2E5E9]">
                    <div className="grid grid-cols-[1fr_72px_110px] items-center bg-[#F7F8FA] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                      <span>Part</span>
                      <span>Quantity</span>
                      <span className="text-right">Available Stock</span>
                    </div>
                    {g.lines.map((l) => (
                      <div key={l.id} className="grid grid-cols-[1fr_72px_110px] items-center border-t border-[#E2E5E9] bg-white px-3 py-2">
                        <span className="min-w-0 truncate text-[13.5px] font-medium text-[#1B2432]">{l.part}</span>
                        <span className="grid h-7 w-16 place-items-center rounded border border-[#E2E5E9] bg-white text-[13px] font-semibold tabular-nums">
                          {l.quantity}
                        </span>
                        <span className="text-right text-[13px] font-semibold tabular-nums text-[#1B2432]">
                          {stockOf(l.part) ?? "\u2014"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {lube.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2432]">
                Lubricant Draws
                <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#1B2432] px-1.5 text-[12px] text-white">
                  {lube.length}
                </span>
              </p>
              {lube.map((r) => (
                <div key={r.id} className="rounded-[10px] border border-[#E2E5E9] bg-[#F1F2F4]/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-[#1B2432]">
                        {r.plateNumber === "WORKSHOP" ? "Workshop" : r.plateNumber || r.reference}
                        <span className="ml-2 text-[12px] font-normal text-[#8E95A1]">{r.reference}</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-[#5C6470]">
                        Requested by: <span className="text-[#344256]">Engr. {r.requestedBy || "\u2014"}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => onDecideFuel(r, false, true)}
                        className="h-9 rounded border border-[#E2E5E9] bg-white px-3.5 text-[13px] font-medium text-[#1B2432] hover:bg-[#F7F8FA] disabled:opacity-60"
                      >
                        Reject Request
                      </button>
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => onDecideFuel(r, true, true)}
                        className="h-9 rounded bg-[#34C759] px-3.5 text-[13px] font-medium text-white hover:bg-[#2cab4e] disabled:opacity-60"
                      >
                        Review and Approve
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 rounded-[6px] border border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px] text-[#1B2432]">
                    {r.fuelType} • {r.quantity.toLocaleString()} litres
                    {r.purpose ? <span className="text-[#5C6470]"> • {r.purpose}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ========================= the authorization board ========================= */

function EngineeringRequestsBoard({
  tab,
  setTab,
  pendingParts,
  pendingLube,
  engFuel,
  items,
  busyId,
  canTM,
  canWork,
  onRejectGroup,
  onApproveGroup,
  onDecideFuel,
  stockOf,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  pendingParts: ReturnType<typeof groupRequisitions>;
  pendingLube: FuelRequest[];
  engFuel: FuelRequest[];
  items: InventoryItem[];
  busyId: string | null;
  canTM: boolean;
  canWork: boolean;
  onRejectGroup: (key: string, lines: InventoryRequisition[]) => void;
  onApproveGroup: (key: string, lines: InventoryRequisition[]) => void;
  onDecideFuel: (r: FuelRequest, approve: boolean, hoe: boolean) => void;
  stockOf: (part: string) => number | null;
}) {
  return (
    <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E5E9] pb-5">
        <div className="flex items-center gap-3">
          <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
            Part Requests Authorization
          </h3>
          <div className="flex h-10 items-center rounded bg-[#F1F2F4] px-1">
            {([
              ["parts", "Parts Requests"],
              ["lubricant", "Lubricant Requests"],
            ] as const).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "h-8 rounded px-3 text-[13px] font-medium",
                  tab === t ? "bg-white shadow-sm" : "text-[#8E95A1] hover:text-[#344256]",
                )}
              >
                {label} ({t === "parts" ? pendingParts.length : engFuel.length})
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "parts" ? (
        pendingParts.length === 0 ? (
          <FigmaEmptyState
            title="No parts request awaits approval"
            body="Engineering raises; HOE validates; what reaches this desk needs your authorization."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {pendingParts.map((g) => (
              <div key={g.key} className="rounded-[10px] border border-[#E2E5E9] bg-[#F1F2F4]/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[#1B2432]">
                      {g.truckReg === "WORKSHOP" ? "Workshop" : g.truckReg}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[#5C6470]">
                      Requested by: <span className="text-[#344256]">Engr. {g.requestedBy || "\u2014"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === g.key}
                      onClick={() => onRejectGroup(g.key, g.lines)}
                      className="h-9 rounded border border-[#E2E5E9] bg-white px-3.5 text-[13px] font-medium text-[#1B2432] hover:bg-[#F7F8FA] disabled:opacity-60"
                    >
                      Reject Request
                    </button>
                    <button
                      type="button"
                      disabled={busyId === g.key}
                      onClick={() => onApproveGroup(g.key, g.lines)}
                      className="h-9 rounded bg-[#2ECC71] px-3.5 text-[13px] font-medium text-white hover:bg-[#28b564] disabled:opacity-60"
                    >
                      Authorize Part Approval
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded-[6px] border border-[#F3A69A] bg-[#FFF5F4] px-3 py-2">
                  <p className="text-[13px] font-semibold text-[#ED351D]">Description:</p>
                  <p className="text-[13px] text-[#1B2432]">{g.description || "\u2014"}</p>
                </div>
                <div className="mt-2 overflow-hidden rounded-[6px] border border-[#E2E5E9]">
                  <div className="grid grid-cols-[1fr_72px_110px] items-center bg-[#F7F8FA] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                    <span>Part Number</span>
                    <span>Quantity</span>
                    <span className="text-right">Available Stock</span>
                  </div>
                  {g.lines.map((l) => (
                    <div key={l.id} className="grid grid-cols-[1fr_72px_110px] items-center border-t border-[#E2E5E9] px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-[#1B2432]">{l.part}</span>
                      </span>
                      <span className="grid h-7 w-16 place-items-center rounded border border-[#E2E5E9] bg-white text-[13px] font-semibold tabular-nums">
                        {l.quantity}
                      </span>
                      <span className="text-right text-[13px] font-semibold tabular-nums text-[#1B2432]">
                        {stockOf(l.part) ?? "\u2014"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : pendingLube.length === 0 ? (
        <FigmaEmptyState
          title="No lubricant request awaits approval"
          body="Engineering draws pass HOE first; the approved ones wait here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {pendingLube.map((r) => {
            const hoe = r.status === "Requested";
            return (
              <div key={r.id} className="rounded-[10px] border border-[#E2E5E9] bg-[#F1F2F4]/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[#1B2432]">
                      {r.plateNumber === "WORKSHOP" ? "Workshop" : r.plateNumber || r.reference}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[#5C6470]">
                      Requested by: <span className="text-[#344256]">Engr. {r.requestedBy || "\u2014"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => onDecideFuel(r, false, hoe)}
                      className="h-9 rounded border border-[#E2E5E9] bg-white px-3.5 text-[13px] font-medium text-[#1B2432] hover:bg-[#F7F8FA] disabled:opacity-60"
                    >
                      Reject Request
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => onDecideFuel(r, true, hoe)}
                      className="h-9 rounded bg-[#2ECC71] px-3.5 text-[13px] font-medium text-white hover:bg-[#28b564] disabled:opacity-60"
                    >
                      Authorize Part Approval
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded-[6px] border border-[#E2E5E9] bg-white px-3 py-2 text-[13.5px] text-[#1B2432]">
                  {r.fuelType} • {r.quantity.toLocaleString()} litres
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
