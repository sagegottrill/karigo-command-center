import { useEffect, useMemo, useRef, useState } from "react";
import type { Trip } from "@/lib/fleetopsx/types";
import { Plus, Minus } from "lucide-react";
import "leaflet/dist/leaflet.css";

const STATUS_COLOR: Record<string, string> = {
  "On Schedule": "#34c759", // Green
  "Slight delay": "#ff9f0a", // Orange
  "Significant Delay": "#ff3b30", // Red
};

// Map status from trips to our 3 states for demo purposes
function getDelayStatus(status: string) {
  if (status === "Delayed") return "Significant Delay";
  if (status === "Stopped") return "Slight delay";
  return "On Schedule"; // En Route, Loaded, Returning etc
}

const NIGERIA_CENTER: [number, number] = [9.0765, 7.3986]; // Abuja
const NIGERIA_ZOOM = 13; // closer zoom to see streets

function statusDot(color: string) {
  return `
    <span style="
      display:block;width:16px;height:16px;border-radius:999px;
      background:${color};border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.3);
    "></span>
  `;
}

function popupHtml(trip: Trip, status: string, color: string) {
  // We mock a street address for the design requirement
  const mockAddress = "Street 5 ABC, Orijako Avenue";
  return `
    <div style="background-color: #1B2432; color: white; padding: 12px; border-radius: 8px; width: 260px; font-family: Inter, sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 600; font-size: 13px;">${trip.headId || trip.truckReg || "—"}</span>
        <span style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: #d1d5db;">
          <span style="display: block; width: 8px; height: 8px; border-radius: 999px; background-color: ${color};"></span>
          ${status}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: 80px 1fr; gap: 6px; font-size: 11px;">
        <span style="color: #9ca3af;">Registration:</span>
        <span style="color: #f3f4f6; font-weight: 500;">${trip.truckReg || "LAG-223-XA"}</span>
        
        <span style="color: #9ca3af;">Driver:</span>
        <span style="color: #f3f4f6;">${trip.driverName || "—"}</span>
        
        <span style="color: #9ca3af;">Location:</span>
        <span style="color: #f3f4f6;">${mockAddress}</span>
      </div>
    </div>
  `;
}

export function DispatchLiveMap({ trips }: { trips: Trip[] }) {
  const activeTrips = useMemo(() => trips.slice(0, 4), [trips]); // limit to a few for demo (badge says 4 in mockup)
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;

      const map = L.map(mapEl.current, {
        center: NIGERIA_CENTER,
        zoom: NIGERIA_ZOOM,
        zoomControl: false,
        attributionControl: false,
      });

      // Using a light detailed street map similar to the mockup
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
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
      const style = document.createElement('style');
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

      // Define some hardcoded points near Abuja to ensure they show up in the zoom
      const demoPoints: [number, number][] = [
        [9.0765, 7.3986],
        [9.0820, 7.4100],
        [9.0700, 7.3900],
        [9.0850, 7.3850],
      ];

      activeTrips.forEach((t, i) => {
        const point = demoPoints[i % demoPoints.length]!;
        const statusStr = getDelayStatus(t.status);
        const color = STATUS_COLOR[statusStr]!;
        
        const icon = L.divIcon({
          className: "fleetopsx-map-marker",
          html: statusDot(color),
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        
        L.marker(point, { icon })
          .addTo(layers)
          .bindPopup(popupHtml(t, statusStr, color), {
            className: 'fleetopsx-custom-popup',
            offset: [0, -10]
          });
      });

      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, activeTrips]);

  const zoomBy = (delta: number) => {
    mapRef.current?.setZoom((mapRef.current.getZoom() ?? NIGERIA_ZOOM) + delta);
  };

  return (
    <div className="w-full mt-2 md:mt-4">
      {/* Mobile Active Dispatch Header */}
      <div className="flex items-center gap-2 mb-4 md:hidden">
        <h2 className="text-[16px] font-bold text-[#141a1f]">Active Dispatch</h2>
        <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px] flex items-center justify-center">
          2
        </span>
      </div>

      <div className="w-full rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center p-4 md:border-b border-[#e2e5e9] gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold text-[#141a1f]">Dispatch Overview</h2>
            <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-6 px-2 rounded-[4px] flex items-center justify-center">
              4
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {Object.entries(STATUS_COLOR).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] md:text-[12px] font-semibold text-[#5c6470]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                {label}
              </div>
            ))}
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
