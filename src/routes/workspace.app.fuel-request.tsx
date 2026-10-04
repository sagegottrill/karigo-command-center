import { createFileRoute, redirect } from "@tanstack/react-router";
import { Droplets, Fuel, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  liveCreateFuelRequest,
  liveListFuelRequests,
  liveListPartnerCompanies,
} from "@/lib/fleetopsx/live-api";
import { authService } from "@/lib/fleetopsx/services";
import { FuelRequestDetails } from "@/components/fleetopsx/fuel-request-details";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import type { FuelRequest } from "@/lib/fleetopsx/types";

/**
 * The Transport Manager raises a tank draw.
 *
 * The endpoint has existed all along (`POST /api/fuel-requests` — the gate, the
 * desk phone call and the mechanic all use it), but the web portal had no screen
 * that called it, so a Transport Manager on the dashboard could not ask the pump
 * for a litre of diesel. This is that screen.
 *
 * The partner picker matters more than it looks: the partner's OWN queue is
 * scoped by an exact company match, so a request typed as "silver steel" would
 * file under a name the partner never sees. Picking from the list means every
 * row is written in the spelling the rest of the system already uses.
 */
export const Route = createFileRoute("/workspace/app/fuel-request")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Platform Admin"];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Internal Request | FleetOpsX" },
      {
        name: "description",
        content:
          "Transport Manager raises a diesel or gas draw — it lands straight in the fuel desk's waiting queue.",
      },
    ],
  }),
  component: FuelRequestPage,
});

const inputClass =
  "h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]";
const selectClass = `${inputClass} appearance-none`;

/** "Other…" in the picker — the free-typed department the list does not hold. */
const OTHER = "__other__";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
        {label}
        {required ? <span className="text-[#ED351D]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-[#5C6470]">{hint}</span> : null}
    </label>
  );
}

function statusClass(status: FuelRequest["status"]) {
  return status === "Dispensed"
    ? "bg-[#E7F6EC] text-[#137A3D]"
    : status === "Authorized"
      ? "bg-[#FFF3D6] text-[#8A5A00]"
      : status === "Declined"
        ? "bg-[#FDECEA] text-[#C0392B]"
        : "bg-[#EAF1FF] text-[#1B4FA0]";
}

function FuelRequestPage() {
  const [partners, setPartners] = useState<string[]>([]);
  const [mine, setMine] = useState<FuelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [raised, setRaised] = useState<FuelRequest | null>(null);
  /** The row whose 3-dots is open, and the row currently read in full. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [fuelType, setFuelType] = useState("Diesel");
  const [quantity, setQuantity] = useState("");
  const [source, setSource] = useState("Internal Use");
  const [requestedFor, setRequestedFor] = useState("");
  const [customFor, setCustomFor] = useState("");
  const [purpose, setPurpose] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [note, setNote] = useState("");

  const currentUser = authService.getCurrentUser();
  const [requestedBy, setRequestedBy] = useState(currentUser?.name || "");
  const raiser = currentUser?.name || "Transport Manager";

  const refreshMine = useCallback(async () => {
    try {
      const res = await liveListFuelRequests("?mine=1&limit=25");
      setMine(res.requests);
    } catch {
      // The queue is a convenience — the raise itself must not depend on it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void liveListPartnerCompanies()
      .then((list) => setPartners(list.map((p) => p.company)))
      .catch(() => setPartners([]));
    void refreshMine();
  }, [refreshMine]);

  /** What is actually filed: "" means Petroline's own draw, not a partner's. */
  const effectiveFor = useMemo(() => {
    if (requestedFor === OTHER) return customFor.trim();
    return requestedFor.trim();
  }, [requestedFor, customFor]);

  /** Read the row LIVE from the queue, so a decision made elsewhere shows here. */
  const viewed = viewingId ? (mine.find((r) => r.id === viewingId) ?? null) : null;

  const copyReference = async (reference: string) => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(`${reference} copied.`);
    } catch {
      // The clipboard refuses when the window is not focused — show the ref so
      // the caller can still take it, rather than a dead-end error.
      toast.error(`Could not copy — the reference is ${reference}.`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const litres = Number(quantity);
    if (!Number.isFinite(litres) || litres <= 0) {
      toast.error("Quantity is what is asked for — it must be a positive number of litres.");
      return;
    }
    if (!requestedBy.trim()) {
      toast.error(
        "Requested by is who is asking: the buyer on the slip, the mechanic, or the department.",
      );
      return;
    }
    if (requestedFor === OTHER && !customFor.trim()) {
      toast.error("Type the company or department this fuel is for.");
      return;
    }

    setSubmitting(true);
    try {
      const row = await liveCreateFuelRequest({
        fuelType,
        quantity: litres,
        source,
        requestedBy: requestedBy.trim(),
        requestedFor: effectiveFor || undefined,
        purpose: purpose.trim(),
        plateNumber: plateNumber.trim(),
        note: note.trim(),
      });
      setRaised(row);
      toast.success(
        `${row.reference} raised — ${row.quantity.toLocaleString()} ${row.unit} of ${row.fuelType} is now waiting at the fuel desk.`,
      );
      setQuantity("");
      setPurpose("");
      setPlateNumber("");
      setNote("");
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      await refreshMine();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to raise the fuel request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Internal Request
        </h2>
        <p className="text-[12px] text-[#5C6470] md:text-[11.4px] md:uppercase md:tracking-[0.4px] md:text-[rgba(92,100,112,0.6)]">
          raise a tank draw for our yard or for a partner — it reaches the pump straight away
        </p>
      </div>

      <div className="rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 text-[13px] text-[#5C6470]">
        Every raise lands in the diesel attendant's waiting queue and alerts the
        <span className="font-semibold text-[#1B2432]"> Lubricant desk</span>. Nothing leaves the
        tank until the attendant authorises and dispenses it against {` `}
        <span className="font-semibold text-[#1B2432]">your price per litre</span>.
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
        <section className="rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <h3 className="border-b border-[#E2E5E9] pb-2 text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
            The Draw
          </h3>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fuel type" required>
              <div className="flex gap-2">
                {["Diesel", "Gas"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFuelType(t)}
                    className={`flex h-10 flex-1 items-center justify-center gap-2 rounded border text-[14px] font-medium tracking-[0.4px] transition-colors ${
                      fuelType === t
                        ? "border-[#1B2432] bg-[#1B2432] text-white"
                        : "border-[#E2E5E9] bg-white text-[#5C6470] hover:border-[#1B2432]"
                    }`}
                  >
                    <Fuel className="size-4" strokeWidth={1.5} />
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Quantity (litres)" required hint="What the pump is asked to release.">
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="example: 50"
                className={inputClass}
              />
            </Field>

            <Field
              label="Fuel is for"
              hint="Pick the partner so their own portal sees the request. Our own draws stay under Petroline."
            >
              <div className="relative">
                <select
                  value={requestedFor === OTHER ? OTHER : requestedFor}
                  onChange={(e) => setRequestedFor(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Petroline — our own draw</option>
                  {partners.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value={OTHER}>Other… (type it)</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-[#5C6470]">
                  ▾
                </span>
              </div>
              {requestedFor === OTHER && (
                <input
                  value={customFor}
                  onChange={(e) => setCustomFor(e.target.value)}
                  placeholder="example: Workshop"
                  className={`${inputClass} mt-2`}
                />
              )}
            </Field>

            <Field
              label="Source"
              required
              hint="Walk-in is a buyer at the gate with a slip; internal is the yard asking the yard."
            >
              <div className="relative">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={selectClass}
                >
                  <option value="Internal Use">Internal Use</option>
                  <option value="Walk-In Sale">Walk-In Sale</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-[#5C6470]">
                  ▾
                </span>
              </div>
            </Field>

            <Field
              label="Requested by"
              required
              hint="The buyer on the slip, the mechanic, or the department."
            >
              <input
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="who is asking"
                className={inputClass}
              />
            </Field>

            <Field label="Purpose" hint="example: engine wash — boss requested">
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="why the fuel is needed"
                className={inputClass}
              />
            </Field>

            <Field label="Plate number" hint="Optional — which truck the draw is for.">
              <input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="example: APP857YL"
                className={inputClass}
              />
            </Field>

            <Field label="Note" hint="Anything the attendant needs before releasing the litre.">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="optional"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex h-11 items-center gap-2 rounded bg-[#ED351D] px-6 text-[14px] font-medium tracking-[0.4px] text-white transition-colors hover:bg-[#D52F18] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="size-4" strokeWidth={1.75} />
            {submitting ? "Raising…" : "Raise fuel request"}
          </button>
          {raised && (
            <span className="rounded border border-[#E2E5E9] bg-white px-3 py-2 text-[13px] text-[#5C6470]">
              Last raised <span className="font-semibold text-[#1B2432]">{raised.reference}</span> —{" "}
              <span className={statusClass(raised.status)}>{raised.status}</span>
            </span>
          )}
        </div>
      </form>

      <section className="rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="mb-4 flex items-center gap-2 border-b border-[#E2E5E9] pb-2">
          <Droplets className="size-5 text-[#ED351D]" strokeWidth={1.5} />
          <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
            Requests you raised
          </h3>
        </div>

        {loading ? (
          <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-8 text-center text-[14px] text-[#5C6470]">
            Loading your fuel requests…
          </div>
        ) : mine.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[#E2E5E9] p-8 text-center text-[14px] text-[#5C6470]">
            You have not raised a tank draw yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E5E9] text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.7)]">
                  <th className="py-2 pr-3 font-medium">Ref</th>
                  <th className="py-2 pr-3 font-medium">Fuel</th>
                  <th className="py-2 pr-3 font-medium">Quantity</th>
                  <th className="py-2 pr-3 font-medium">For</th>
                  <th className="py-2 pr-3 font-medium">Purpose</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mine.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setViewingId(r.id)}
                    className="cursor-pointer border-b border-[#F1F2F4] text-[14px] text-[#1B2432] hover:bg-[#F7F8F9]"
                  >
                    <td className="py-2.5 pr-3 font-medium tabular-nums">{r.reference}</td>
                    <td className="py-2.5 pr-3">{r.fuelType}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {r.quantity.toLocaleString()} {r.unit}
                    </td>
                    <td className="py-2.5 pr-3">{r.requestedFor || "Petroline"}</td>
                    <td className="py-2.5 pr-3 text-[#5C6470]">{r.purpose || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded px-2 py-1 text-[12px] font-medium ${statusClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td
                      className="py-2.5 pr-3 justify-self-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu
                        open={menuFor === r.id}
                        onOpenChange={(o) => setMenuFor(o ? r.id : null)}
                        label={`Options for ${r.reference}`}
                        width={190}
                        items={[
                          {
                            label: "View Details",
                            onSelect: () => {
                              setMenuFor(null);
                              setViewingId(r.id);
                            },
                          },
                          {
                            label: "Copy reference",
                            onSelect: () => {
                              setMenuFor(null);
                              void copyReference(r.reference);
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FuelRequestDetails row={viewed} onClose={() => setViewingId(null)} />
    </div>
  );
}
