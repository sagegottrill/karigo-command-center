import { useEffect, useMemo, useRef } from "react";
import type { Trip } from "@/lib/fleetopsx/types";
import type { LocationCheckpoint } from "@/lib/fleetopsx/tracking-ops";
import "leaflet/dist/leaflet.css";

/**
 * Partner-facing live map for a single request. Real Leaflet map — trip start
 * (loading site/depot), destination pin, the truck's current position, and
 * every Tracking Ops checkpoint logged along the route. Positions come from
 * the trip row + checkpoints (no mock points).
 */
const FALLBACK_DEPOT: [number, number] = [9.0765, 7.3986]; // Abuja

export function PartnerLiveMap({ trip, checkpoints }: { trip: Trip; checkpoints: LocationCheckpoint[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const fitDoneRef = useRef(false);

  const destination = useMemo<[number, number]>(() => {
    if (trip.dropoff) {
      const parsed = geocodeDeterministic(trip.dropoff);
      if (parsed) return parsed;
    }
    return FALLBACK_DEPOT;
  }, [trip.dropoff]);

  const origin = useMemo<[number, number]>(() => {
    const site = trip.loadingSite?.[0] || trip.pickup;
    if (site) {
      const parsed = geocodeDeterministic(site);
      if (parsed) return parsed;
    }
    return FALLBACK_DEPOT;
  }, [trip.loadingSite, trip.pickup]);

  // Truck position: latest checkpoint wins, else progress-blend origin→destination.
  const truckPos = useMemo<[number, number]>(() => {
    const latest = checkpoints[0];
    if (latest) {
      const parsed = geocodeDeterministic(latest.location);
      if (parsed) return parsed;
    }
    const progress = Math.min(0.95, Math.max(0.05, (trip.progress ?? 0) / 100));
    return [origin[0] + (destination[0] - origin[0]) * progress, origin[1] + (destination[1] - origin[1]) * progress];
  }, [checkpoints, trip.progress, origin, destination]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      requestAnimationFrame(() => {
        map.invalidateSize();
        if (!fitDoneRef.current) {
          fitDoneRef.current = true;
          map.fitBounds(L.latLngBounds([origin, destination]).pad(0.25));
        }
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      fitDoneRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever trip/checkpoints change (poll keeps this fresh).
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || !layerRef.current) return;
      const layers = layerRef.current;
      layers.clearLayers();

      const pin = (color: string, ring = "#ffffff") =>
        L.divIcon({
          className: "fleetopsx-map-marker",
          html: `<span style="display:block;width:14px;height:14px;border-radius:999px;background:${color};border:2px solid ${ring};box-shadow:0 2px 6px rgba(0,0,0,.3)"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

      // Route line origin → destination
      L.polyline([origin, destination], { color: "#1B2432", weight: 2, opacity: 0.35, dashArray: "6 8" }).addTo(layers);

      L.marker(origin, { icon: pin("#627084") }).addTo(layers).bindTooltip("Loading site", { direction: "top" });
      L.marker(destination, { icon: pin("#ED351D", "#ffffff") })
        .addTo(layers)
        .bindTooltip(trip.dropoff || "Destination", { direction: "top" });

      // Checkpoints (oldest → newest)
      for (const cp of [...checkpoints].reverse()) {
        const pos = geocodeDeterministic(cp.location);
        if (!pos) continue;
        L.marker(pos, { icon: pin("#F99E1F") })
          .addTo(layers)
          .bindTooltip(`${cp.location} • ${new Date(cp.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, { direction: "top" });
      }

      // Truck marker (moves with latest data)
      const truckIcon = L.divIcon({
        className: "fleetopsx-map-marker",
        html: `<div style="display:flex;align-items:center;gap:4px"><span style="display:block;width:12px;height:12px;border-radius:999px;background:#0ACF83;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></span><span style="background:#1B2432;color:#fff;font:600 10px Inter,sans-serif;padding:2px 6px;border-radius:6px;white-space:nowrap">Truck</span></div>`,
        iconSize: [64, 16],
        iconAnchor: [8, 8],
      });
      L.marker(truckPos, { icon: truckIcon, zIndexOffset: 500 }).addTo(layers);

      requestAnimationFrame(() => mapRef.current?.invalidateSize());
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, destination, truckPos, checkpoints, trip.dropoff]);

  const zoomBy = (delta: number) => {
    mapRef.current?.setZoom((mapRef.current.getZoom() ?? 12) + delta);
  };

  return (
    <div className="relative h-full min-h-[280px] w-full sm:min-h-[419px]">
      <div ref={mapEl} className="absolute inset-0 z-0" />
      <div className="absolute top-4 right-4 z-[500] flex flex-col overflow-hidden rounded-md border border-[#e2e5e9] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          className="grid h-9 w-9 place-items-center border-b border-[#e2e5e9] text-[#344256] hover:bg-slate-50"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          className="grid h-9 w-9 place-items-center text-[#344256] hover:bg-slate-50"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>
      <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-3 rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-medium text-[#5C6470] shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#0ACF83]" /> Truck
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#F99E1F]" /> Checkpoint
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ED351D]" /> Destination
        </span>
      </div>
    </div>
  );
}

/**
 * Deterministic text→coords for Nigerian locations. Hashes the place name into
 * a stable offset around a named-city anchor so pins are consistent between
 * renders (no external geocoder dependency; checkpoints pin near their city).
 */
const CITY_ANCHORS: Array<[RegExp, [number, number]]> = [
  [/abuja|kubwa|kurudu|gwagwalada|kute|airport road/i, [9.0765, 7.3986]],
  [/lagos|ikeja|apapa|victoria island|lekki/i, [6.5244, 3.3792]],
  [/warri|benin|asaba|sapele|ughelli/i, [5.5167, 5.75]],
  [/kano|kaduna|zaria/i, [12.0022, 8.592]],
  [/port harcourt|portharcourt|abia|owerri|aba\b/i, [4.8156, 7.0498]],
  [/bauchi|jalingo|yola|gombe/i, [10.3157, 9.8442]],
  [/ibadan|ilorin|osogbo|akure|ado/i, [7.3775, 3.947]],
  [/enugu|nsukka|makurdi|jos|lokoja/i, [6.4667, 7.5]],
  [/sokoto|birnin|kebbi|minna|bida/i, [13.0533, 5.2389]],
  [/calabar|uyo|yenagoa|brass/i, [4.9757, 8.3417]],
];

function geocodeDeterministic(place: string): [number, number] | null {
  const clean = place.trim();
  if (!clean) return null;
  const anchor = CITY_ANCHORS.find(([re]) => re.test(clean))?.[1] ?? FALLBACK_DEPOT;
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  // Deterministic ±0.18° scatter around the anchor (~20km spread)
  const latOffset = ((hash % 1000) / 1000 - 0.5) * 0.36;
  const lngOffset = (((hash >> 10) % 1000) / 1000 - 0.5) * 0.36;
  return [anchor[0] + latOffset, anchor[1] + lngOffset];
}
