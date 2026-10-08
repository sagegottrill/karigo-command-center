import { useEffect, useMemo, useRef, useState } from "react";
import { displayCapPlateFromTrip, displayPlateFromTrip } from "@/lib/fleetopsx/display-ids";
import { geocodeDeterministic } from "@/lib/fleetopsx/geo";
import {
  getTrackingDelayStatus,
  TRACKING_DELAY_COLOR,
  type TrackingDelayStatus,
} from "@/lib/fleetopsx/tracking-ops";
import type { Trip } from "@/lib/fleetopsx/types";
import { Plus, Minus } from "lucide-react";
import "leaflet/dist/leaflet.css";

/**
 * LIVE DISPATCH MAP — every active dispatch, plotted from its OWN data.
 *
 * The platform's location facts are words: the loading site the load starts
 * from, the drop-off it is heading to, the Tracking Ops checkpoints logged
 * along the way, and the progress the boards already compute from the TM's
 * own duration promise. Each truck plots on ITS route between ITS real
 * origin and destination — moved along by the real progress figure — and
 * wears the same delay colour the stats above this map count. No demo
 * points, no mock addresses.
 */

function tripOrigin(trip: Trip): string {
  return trip.loadingSite?.[0] || trip.pickup || "";
}

function tripPosition(trip: Trip, origin: string, destination: string): [number, number] {
  const o = geocodeDeterministic(origin) ?? geocodeDeterministic(trip.dropoff);
  const d = geocodeDeterministic(destination);
  const from = o ?? d;
  if (!from) return [9.0765, 7.3986];
  if (!d) return from;
  // The truck sits along its own route, at the progress the boards compute
  // from the departure stamp and the TM's duration — clamped so a rounding
  // oddity can never park a truck outside its road.
  const progress = Math.min(0.95, Math.max(0.05, (trip.progress ?? 0) / 100));
  return [from[0] + (d[0] - from[0]) * progress, from[1] + (d[1] - from[1]) * progress];
}

function popupHtml(
  trip: Trip,
  status: TrackingDelayStatus,
  origin: string,
  destination: string,
) {
  // The cap number leads, exactly as on the gate log and the TM's boards.
  const truck = displayCapPlateFromTrip(trip) || "—";
  const plate = displayPlateFromTrip(trip);
  // Popup values are database text; Leaflet drops them into innerHTML, so each
  // is HTML-escaped before interpolation.
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return `
    <div style="background-color: #1B2432; color: white; padding: 12px; border-radius: 8px; width: 260px; font-family: Inter, sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 600; font-size: 13px;">${esc(truck)}</span>
        <span style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: #d1d5db;">
          <span style="display: block; width: 8px; height: 8px; border-radius: 999px; background-color: ${TRACKING_DELAY_COLOR[status]};"></span>
          ${esc(status)}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: 80px 1fr; gap: 6px; font-size: 11px;">
        <span style="color: #9ca3af;">Registration:</span>
        <span style="color: #f3f4f6; font-weight: 500;">${esc(plate || "—")}</span>

        <span style="color: #9ca3af;">Driver:</span>
        <span style="color: #f3f4f6;">${esc(trip.driverName || "—")}</span>

        <span style="color: #9ca3af;">From:</span>
        <span style="color: #f3f4f6;">${esc(origin || "—")}</span>

        <span style="color: #9ca3af;">To:</span>
        <span style="color: #f3f4f6;">${esc(destination || "—")}</span>

        <span style="color: #9ca3af;">Progress:</span>
        <span style="color: #f3f4f6;">${esc(Math.round(trip.progress ?? 0) + "%")}</span>
      </div>
    </div>
  `;
}

export function DispatchLiveMap({ trips }: { trips: Trip[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const fitDoneRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // One plotted row per active dispatch: its real route and real position.
  const plotted = useMemo(() => {
    return trips.map((trip) => {
      const origin = tripOrigin(trip);
      const destination = trip.dropoff || "";
      const position = tripPosition(trip, origin, destination);
      const status = getTrackingDelayStatus(trip);
      return { trip, origin, destination, position, status };
    });
  }, [trips]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;

      const map = L.map(mapEl.current, {
        center: [9.0765, 7.3986],
        zoom: 6, // country view — fitBounds tightens to the real routes
        zoomControl: false,
        attributionControl: false,
      });

      // Using a light detailed street map similar to the mockup
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const layers = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layers;

      requestAnimationFrame(() => {
        map.invalidateSize();
        if (!cancelled) setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      fitDoneRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;

    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || !layerRef.current) return;

      layers.clearLayers();

      // Ensure custom popup styles are injected for leaflet
      const style = document.createElement("style");
      style.innerHTML = `
        .fleetopsx-custom-popup .leaflet-popup-content-wrapper {
          padding: 0;
          background: transparent;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .fleetopsx-custom-popup .leaflet-popup-content {
          margin: 0;
          width: auto !important;
        }
        .fleetopsx-custom-popup .leaflet-popup-tip-container {
          display: none;
        }
      `;
      document.head.appendChild(style);

      const points: [number, number][] = [];
      for (const { trip, origin, destination, position, status } of plotted) {
        const color = TRACKING_DELAY_COLOR[status];
        const icon = L.divIcon({
          className: "fleetopsx-map-marker",
          html: `<span style="display:block;width:16px;height:16px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        // The route itself, origin → destination, so a pin always sits ON a road.
        if (origin && destination) {
          const o = geocodeDeterministic(origin);
          const d = geocodeDeterministic(destination);
          if (o && d) {
            L.polyline([o, d], { color: "#1B2432", weight: 2, opacity: 0.25, dashArray: "6 8" }).addTo(layers);
            points.push(o, d);
          }
        }

        L.marker(position, { icon })
          .addTo(layers)
          .bindPopup(popupHtml(trip, status, origin, destination), {
            className: "fleetopsx-custom-popup",
            offset: [0, -10],
          });
        points.push(position);
      }

      // The view follows the fleet: one truck or fifty, the map frames the
      // real routes instead of staring at one city.
      if (points.length && !fitDoneRef.current) {
        fitDoneRef.current = true;
        map.fitBounds(L.latLngBounds(points).pad(0.2));
      }

      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, plotted]);

  const zoomBy = (delta: number) => {
    mapRef.current?.setZoom((mapRef.current.getZoom() ?? 6) + delta);
  };

  return (
    <div className="w-full mt-2 md:mt-4">
      {/* Mobile Tracking Operations header — the badge is the real trip count. */}
      <div className="flex items-center gap-2 mb-4 md:hidden">
        <h2 className="text-[16px] font-bold text-[#141a1f]">Tracking Operations</h2>
        <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px] flex items-center justify-center">
          {trips.length}
        </span>
      </div>

      <div className="w-full rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center p-4 md:border-b border-[#e2e5e9] gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold text-[#141a1f]">Dispatch Overview</h2>
            <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-6 px-2 rounded-[4px] flex items-center justify-center">
              {trips.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {(Object.entries(TRACKING_DELAY_COLOR) as [TrackingDelayStatus, string][]).map(
              ([label, color]) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 text-[11px] md:text-[12px] font-semibold text-[#5c6470]"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  ></span>
                  {label}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="relative h-[400px] md:h-[500px] w-full p-2 md:p-4 bg-white">
          <div className="absolute top-6 right-6 z-[500] flex flex-col rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-[#e2e5e9] overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => zoomBy(1)}
              className="grid h-10 w-10 place-items-center bg-white text-slate-700 hover:bg-slate-50 transition-colors border-b border-[#e2e5e9]"
              aria-label="Zoom in"
            >
              <Plus className="h-5 w-5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(-1)}
              className="grid h-10 w-10 place-items-center bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              aria-label="Zoom out"
            >
              <Minus className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
          <div ref={mapEl} className="h-full w-full rounded-[8px] ring-1 ring-[#e2e5e9] z-0" />
        </div>
      </div>
    </div>
  );
}
