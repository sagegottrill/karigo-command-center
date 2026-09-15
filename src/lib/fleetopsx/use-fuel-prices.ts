import { useCallback, useEffect, useState } from "react";
import { fuelPriceService, type FuelPrice } from "@/lib/fleetopsx/services";

/**
 * Single source of truth for TM-managed fuel prices (₦ per litre).
 *
 * The Transport Manager sets the price per litre in HR → Fuel Pricing; every
 * module that displays or computes a fuel/lubricant cost reads the same prices
 * through this hook. FO never types a price — they enter a quantity and the
 * cost is computed as qty × TM price. The hook re-fetches whenever any module
 * fires the shared `fleetopsx:badges-refresh` event (the update service does)
 * or the tab regains focus.
 */
export function useFuelPrices() {
  const [prices, setPrices] = useState<Record<"Diesel" | "Gas", number>>({
    Diesel: 0,
    Gas: 0,
  });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows: FuelPrice[] = await fuelPriceService.list();
      const next: Record<"Diesel" | "Gas", number> = { Diesel: 0, Gas: 0 };
      for (const r of rows) {
        if (r.fuelType === "Diesel" || r.fuelType === "Gas") next[r.fuelType] = r.pricePerLitre;
      }
      setPrices(next);
    } catch {
      // Silent: callers treat 0 as "price not loaded" and fall back to the
      // stored cost. The page-level error handling already surfaces hard failures.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("fleetopsx:badges-refresh", onRefresh);
    window.addEventListener("focus", onRefresh);
    return () => {
      window.removeEventListener("fleetopsx:badges-refresh", onRefresh);
      window.removeEventListener("focus", onRefresh);
    };
  }, [refresh]);

  return { prices, loaded, price: (t: "Diesel" | "Gas") => prices[t] };
}
