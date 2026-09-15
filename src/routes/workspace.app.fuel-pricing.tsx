import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Fuel, TrendingUp } from "lucide-react";
import { authService, fuelPriceService, type FuelPrice } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/fuel-pricing")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Fuel Pricing | FleetOpsX" },
      { name: "description", content: "Transport Manager sets the price per litre — the source of truth for all fuel costs." },
    ],
  }),
  component: FuelPricingPage,
});

function FuelPricingPage() {
  const [rows, setRows] = useState<FuelPrice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fuelPriceService.list();
      setRows(next);
      setDrafts((d) => {
        const merged = { ...d };
        for (const r of next) if (merged[r.fuelType] == null) merged[r.fuelType] = String(r.pricePerLitre);
        return merged;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load fuel prices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("fleetopsx:badges-refresh", onRefresh);
    return () => window.removeEventListener("fleetopsx:badges-refresh", onRefresh);
  }, [refresh]);

  const save = async (fuelType: "Diesel" | "Gas") => {
    const value = Number(drafts[fuelType]);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(`${fuelType} price must be a positive number (₦ per litre).`);
      return;
    }
    setSaving(fuelType);
    try {
      await fuelPriceService.update(fuelType, value);
      toast.success(
        `${fuelType} price updated to ₦${value.toLocaleString()} per litre. Fleet Operations costs re-price automatically.`,
      );
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update fuel price.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Fuel Pricing
        </h2>
        <p className="text-[12px] text-[#5C6470] md:text-[11.4px] md:uppercase md:tracking-[0.4px] md:text-[rgba(92,100,112,0.6)]">
          set the price per litre — fleet operations only enters quantity, cost is automatic
        </p>
      </div>

      {loading ? (
        <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-8 text-center text-[14px] text-[#5C6470]">
          Loading fuel prices…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["Diesel", "Gas"] as const).map((t) => {
            const row = rows.find((r) => r.fuelType === t);
            return (
              <div
                key={t}
                className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-[#1B2432]">
                      <Fuel className="size-5 text-white" strokeWidth={1.5} />
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">{t}</span>
                      <span className="text-[11px] tracking-[0.4px] text-[#627084]">
                        {row?.updatedBy ? `set by ${row.updatedBy}` : "not set yet"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#ED351D]">
                    <TrendingUp className="size-4" strokeWidth={1.75} />
                    <span className="text-[14px] font-bold tabular-nums">
                      {row ? `₦${row.pricePerLitre.toLocaleString()}` : "—"}
                    </span>
                  </div>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-[#141A1F]">New price per litre (₦)</span>
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-[#5C6470]">₦</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={drafts[t] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [t]: e.target.value }))}
                        placeholder={row ? String(row.pricePerLitre) : "e.g. 1800"}
                        className="h-11 w-full rounded border border-[#E2E5E9] bg-white pl-7 pr-3 text-[15px] font-medium text-[#141A1F] outline-none focus:border-[#1B2432]"
                        aria-label={`${t} price per litre`}
                      />
                    </div>
                    <span className="text-[12px] tracking-[0.4px] text-[#627084]">/ L</span>
                  </div>
                </label>

                <button
                  type="button"
                  disabled={saving === t}
                  onClick={() => void save(t)}
                  className="mt-4 flex h-10 w-full items-center justify-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white disabled:opacity-50"
                >
                  {saving === t ? "Updating…" : `Update ${t} Price`}
                </button>

                <p className="mt-3 text-[11px] leading-4 tracking-[0.4px] text-[#627084]">
                  Fleet Operations sees this rate read-only. A dispatch with quantity 44 L is automatically
                  priced {row ? `₦${(44 * row.pricePerLitre).toLocaleString()}` : "—"}.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
