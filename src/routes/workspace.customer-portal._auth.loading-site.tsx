import { createFileRoute } from "@tanstack/react-router";
import { PackageCheck, Phone, PenLine, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import { SignaturePad } from "@/components/fleetopsx/signature-pad";
import { FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  authService,
  loadingSiteService,
  type LoadingSiteBoard,
  type LoadingSitePickup,
} from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/loading-site")({
  component: LoadingSitePortal,
});

/**
 * THE LOADING SITE — the Loader partner's own page.
 *
 * A partner account comes in two shapes: a REQUESTER raising dispatches, or a
 * LOADER running a yard. This page is the yard. It is the web's answer to the
 * same portal the loader's phone already runs: the trucks waiting to load at
 * its sites, whoever they haul for, and the pickups the driver has signed —
 * with the confirmation that puts the "Loaded" stamp on the dispatch.
 */
function LoadingSitePortal() {
  const [board, setBoard] = useState<LoadingSiteBoard | null>(null);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<LoadingSiteBoard["waiting"][number] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (site?: string) => {
    const res = await loadingSiteService.board(site || undefined);
    setBoard(res);
    if (!site && res.site) setSelectedSite(res.site);
  }, []);

  useEffect(() => {
    void load()
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Could not load the site board."),
      )
      .finally(() => setLoading(false));
  }, [load]);

  useAutoRefresh(() => {
    void load(selectedSite).catch(() => undefined);
  });

  const onPickSite = (site: string) => {
    setSelectedSite(site);
    setLoading(true);
    void load(site)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load that site."))
      .finally(() => setLoading(false));
  };

  return (
    <PartnerPortalShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-5 lg:px-8 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[24px] font-semibold leading-8 text-[#1B2432]">Loading Site</h2>
            <p className="text-[13px] text-[#5C6470]">
              {board?.site ? (
                <>
                  The trucks waiting to load at{" "}
                  <span className="font-medium text-[#1B2432]">{board.site}</span>.
                </>
              ) : (
                "Waiting on your site."
              )}
            </p>
          </div>
          {board && board.sites.length > 1 ? (
            <select
              value={selectedSite}
              onChange={(e) => onPickSite(e.target.value)}
              aria-label="Switch loading site"
              className="h-10 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#1B2432] outline-none"
            >
              {board.sites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {loading && !board ? (
          <FigmaLoadingState label="Reading the yard…" />
        ) : !board ? null : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-[420px]">
              <Counter label="Waiting to load" value={board.counts.waiting} tone="pending" />
              <Counter label="Signed pickups" value={board.counts.pickedUp} tone="done" />
            </div>

            <h3 className="mt-7 flex items-center gap-2 text-[16px] font-semibold text-[#1B2432]">
              <Truck className="size-4 text-[#ED351D]" /> Waiting to load
            </h3>
            {board.waiting.length === 0 ? (
              <EmptyHint text="Nothing waiting right now — every truck dispatched here is on the signed list." />
            ) : (
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {board.waiting.map((t) => (
                  <div
                    key={t.tripId}
                    className="rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-semibold text-[#1B2432]">
                          Dispatch {t.reference}
                        </p>
                        <p className="mt-0.5 text-[13px] text-[#5C6470]">
                          {t.truckReg || "Truck unassigned"}
                          {t.tailNumber ? ` · ${t.tailNumber}` : ""}
                          {t.tailType ? ` (${t.tailType})` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#FDECEA] px-2.5 py-1 text-[12px] font-medium text-[#ED351D]">
                        {t.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] text-[#344256]">
                      Cargo for {t.dropoff || "—"} · Driver{" "}
                      <span className="font-medium">{t.driverName || "—"}</span>
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      {t.driverPhone ? (
                        <a
                          href={`tel:${t.driverPhone}`}
                          className="flex items-center gap-1.5 text-[13px] font-medium text-[#1B2432] hover:text-[#ED351D]"
                        >
                          <Phone className="size-4" /> {t.driverPhone}
                        </a>
                      ) : (
                        <span className="text-[13px] text-[#8E95A1]">No phone on file</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirming(t)}
                        className="flex h-9 items-center gap-2 rounded-[6px] bg-[#ED351D] px-3.5 text-[13.5px] font-medium text-white hover:bg-[#d62e19]"
                      >
                        <PenLine className="size-4" /> Confirm Pickup
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 className="mt-7 flex items-center gap-2 text-[16px] font-semibold text-[#1B2432]">
              <PackageCheck className="size-4 text-[#2BB673]" /> Signed pickups
            </h3>
            {board.pickedUp.length === 0 ? (
              <EmptyHint text="No pickup has been signed at this site yet." />
            ) : (
              <div className="mt-3 overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
                <div className="hidden grid-cols-[110px_1fr_140px_1fr_130px] items-center gap-3 border-b border-[#E2E5E9] bg-[#F1F3F5] px-4 py-2.5 text-[12px] uppercase tracking-[0.4px] text-[#5C6470] lg:grid">
                  <span>Dispatch</span>
                  <span>Truck</span>
                  <span>Driver</span>
                  <span>Confirmed</span>
                  <span className="text-right">Signature</span>
                </div>
                {board.pickedUp.map((p) => (
                  <PickupRow key={p.id} pickup={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {confirming ? (
        <ConfirmPickupDialog
          row={confirming}
          site={board?.site ?? selectedSite}
          busy={busy}
          onClose={() => (busy ? null : setConfirming(null))}
          onConfirmed={(duplicate) => {
            setConfirming(null);
            toast.success(
              duplicate
                ? "This truck was already signed at this site."
                : "Load picked up — the dispatch now reads Loaded.",
            );
            void load(selectedSite).catch(() => undefined);
          }}
          onFail={() => {
            setConfirming(null);
          }}
          onBusy={setBusy}
        />
      ) : null}
    </PartnerPortalShell>
  );
}

/* ------------------------------------------------------------------ pieces */

const fmtStampDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
};
const fmtStampTime = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pending" | "done";
}) {
  return (
    <div className="rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-[24px] font-semibold leading-7 tabular-nums",
          tone === "pending" ? "text-[#ED351D]" : "text-[#2BB673]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-[10px] border border-dashed border-[#D3D7DE] bg-[#FCFCFD] px-4 py-5 text-center text-[13.5px] text-[#8E95A1]">
      {text}
    </p>
  );
}

function PickupRow({ pickup: p }: { pickup: LoadingSitePickup }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-[#E2E5E9] px-4 py-3 last:border-b-0 lg:grid-cols-[110px_1fr_140px_1fr_130px] lg:items-center lg:gap-3">
      <span className="text-[13.5px] font-medium text-[#1B2432]">{p.reference || "—"}</span>
      <span className="text-[13px] text-[#344256]">
        {p.truckReg || "—"}
        {p.tailNumber ? ` · ${p.tailNumber}` : ""}
      </span>
      <span className="text-[13px] text-[#344256]">{p.driverName || "—"}</span>
      <span className="text-[12px] text-[#5C6470]">
        {p.confirmedAt ? `${fmtStampDate(p.confirmedAt)} · ${fmtStampTime(p.confirmedAt)}` : "—"}
        {p.confirmedBy ? ` by ${p.confirmedBy}` : ""}
      </span>
      <span className="lg:justify-self-end">
        {p.signature ? (
          <img
            src={p.signature}
            alt={`Driver signature for ${p.reference || p.tripId}`}
            className="h-12 w-[130px] rounded border border-[#E2E5E9] bg-white object-contain"
          />
        ) : (
          <span className="text-[12px] text-[#8E95A1]">—</span>
        )}
      </span>
    </div>
  );
}

function ConfirmPickupDialog({
  row,
  site,
  busy,
  onClose,
  onConfirmed,
  onFail,
  onBusy,
}: {
  row: LoadingSiteBoard["waiting"][number];
  site: string;
  busy: boolean;
  onClose: () => void;
  onConfirmed: (duplicate: boolean) => void;
  onFail: () => void;
  onBusy: (v: boolean) => void;
}) {
  const me = authService.getCurrentUser();
  const [signature, setSignature] = useState<string | null>(null);
  const [driverName, setDriverName] = useState(row.driverName || "");
  const [driverPhone, setDriverPhone] = useState(row.driverPhone || "");

  const submit = async () => {
    if (!signature) {
      toast.error("The driver must sign before the pickup can be confirmed.");
      return;
    }
    onBusy(true);
    try {
      const res = await loadingSiteService.confirmPickup({
        tripId: row.tripId,
        site,
        signature,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
      });
      onConfirmed(Boolean(res.duplicate));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The pickup was not saved.");
      onFail();
    } finally {
      onBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm pickup for dispatch ${row.reference}`}
      onClick={() => (busy ? null : onClose())}
    >
      <div
        className="my-6 w-full max-w-[540px] rounded-[14px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-2.5 rounded-[10px] bg-[#1B2432] px-4 py-3.5">
          <h3 className="text-[17px] font-semibold text-white">Confirm Load Picked Up</h3>
          <p className="text-[12px] text-white/60">
            Dispatch {row.reference} · {site || "your site"}
          </p>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="rounded-[8px] border border-[#E2E5E9] bg-[#FCFCFD] px-3 py-2.5 text-[13px] text-[#344256]">
            <p>
              <span className="font-semibold text-[#1B2432]">
                {row.truckReg || "Truck unassigned"}
              </span>
              {row.tailNumber ? ` · ${row.tailNumber}` : ""}
              {row.tailType ? ` (${row.tailType})` : ""}
            </p>
            <p className="mt-0.5">
              Cargo for {row.dropoff || "—"} — status {row.status}.
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#1B2432]">Driver's name</span>
            <input
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="h-10 rounded-[6px] border border-[#E2E5E9] px-3 text-[14px] text-[#1B2432] outline-none focus:border-[#1B2432]"
              placeholder="The man who collected the load"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#1B2432]">Driver's phone</span>
            <input
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              inputMode="tel"
              className="h-10 rounded-[6px] border border-[#E2E5E9] px-3 text-[14px] text-[#1B2432] outline-none focus:border-[#1B2432]"
              placeholder="0803…"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1B2432]">
              <PenLine className="size-4 text-[#ED351D]" /> Driver's signature{" "}
              <span className="text-[#ED351D]">*</span>
            </span>
            <SignaturePad onChange={setSignature} className="h-[170px] w-full" />
            {!signature ? (
              <span className="text-[12px] text-[#8E95A1]">
                The driver signs here — a receipt without a name is not a receipt.
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-10 rounded-[6px] border border-[#E2E5E9] px-4 text-[14px] font-medium text-[#5C6470] hover:text-[#1B2432] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="h-10 rounded-[6px] bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-40"
            >
              {busy ? "Saving…" : "Confirm Pickup"}
            </button>
          </div>
          <p className="text-[12px] text-[#8E95A1]">
            {me?.name ? `Confirming as ${me.name}. ` : ""}The confirmation ends up on both this
            yard's record and the dispatch.
          </p>
        </div>
      </div>
    </div>
  );
}
