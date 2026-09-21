import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { Trip } from "@/lib/fleetopsx/types";
import { displayCapFromTrip, displayPlateFromTrip } from "@/lib/fleetopsx/display-ids";
import { getTrackingDelayStatus, partnerOf, TRACKING_DELAY_COLOR } from "@/lib/fleetopsx/tracking-ops";
import "leaflet/dist/leaflet.css";

/**
 * City coordinates for placing a truck we have no GPS for.
 *
 * Trips carry no live latitude/longitude from the API, so a marker is placed at
 * the most specific place we actually know — where the truck is heading, or
 * where it loaded. Claiming a GPS fix we do not have would be worse than saying
 * "we know it is going to Kano".
 */
const CITY_COORDS: Record<string, [number, number]> = {
  Lagos: [6.5244, 3.3792],
  Apapa: [6.4489, 3.3594],
  Ikorodu: [6.6194, 3.5105],
  "Tin Can": [6.44, 3.34],
  Kirikiri: [6.4556, 3.3214],
  Abuja: [9.0765, 7.3986],
  Kubwa: [9.1517, 7.3232],
  Gwagwalada: [8.9434, 7.0809],
  "Port Harcourt": [4.8156, 7.0498],
  Kano: [12.0022, 8.592],
  Ibadan: [7.3775, 3.947],
  Warri: [5.5167, 5.75],
  Onitsha: [6.1667, 6.7833],
  Kaduna: [10.5222, 7.4384],
  "Benin City": [6.335, 5.6037],
  Bauchi: [10.3103, 9.8439],
  Enugu: [6.4584, 7.5464],
  Calabar: [4.9757, 8.3417],
  Jos: [9.8965, 8.8583],
  Aba: [5.1066, 7.3667],
  Maiduguri: [11.8333, 13.15],
  Ogun: [6.998, 3.473],
  Edo: [6.6342, 5.9303],
  Anambra: [6.2109, 6.936],
  Lokoja: [7.8023, 6.7333],
};

const NIGERIA_CENTER: [number, number] = [9.1, 8.0];
const NIGERIA_ZOOM = 6;

type Placed = {
  trip: Trip;
  point: [number, number];
  /** Where the truck is, in words — the basis for its marker. */
  where: string;
};

function resolveCoords(trip: Trip): Omit<Placed, "trip"> | null {
  if (Number(trip.lat) && Number(trip.lng)) {
    return { point: [Number(trip.lat), Number(trip.lng)], where: "Live position" };
  }
  const candidates = [
    { value: trip.dropoff, where: `${trip.dropoff} (destination)` },
    { value: trip.pickup, where: `${trip.pickup} (loading)` },
  ];
  for (const candidate of candidates) {
    const key = Object.keys(CITY_COORDS).find((city) =>
      String(candidate.value ?? "")
        .toLowerCase()
        .includes(city.toLowerCase()),
    );
    if (key && candidate.value) return { point: CITY_COORDS[key]!, where: candidate.where };
  }
  return null;
}

/** The Figma's map marker: a round truck badge tinted by delay status. */
function truckBadge(color: string) {
  return `
    <span style="
      display:grid;place-items:center;width:30px;height:30px;border-radius:999px;
      background:${color};border:3px solid #fff;
      box-shadow:0 3px 10px rgba(12,12,13,.35);
    ">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 18V6a1 1 0 0 0-1-1H2v12h12z"/>
        <path d="M15 18h1a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 11.382 8H14"/>
        <circle cx="6" cy="18" r="2"/>
        <circle cx="17" cy="18" r="2"/>
      </svg>
    </span>
  `;
}

function popupHtml(trip: Trip, status: string, color: string, where: string) {
  const cap = displayCapFromTrip(trip);
  const plate = displayPlateFromTrip(trip);
  const truck = [cap, plate].filter(Boolean).join(" · ") || trip.truckReg || "—";
  const row = (label: string, value: string) =>
    value
      ? `<div style="display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:3px 0">
           <span style="color:#9CA3AF">${label}</span>
           <span style="color:#F3F4F6;font-weight:500;text-align:right">${value}</span>
         </div>`
      : "";
  return `
    <div style="background:#1B2432;color:#fff;padding:12px;border-radius:8px;width:252px;font-family:Inter,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-weight:600;font-size:13px">${truck}</span>
        <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:#D1D5DB;white-space:nowrap">
          <span style="display:block;width:8px;height:8px;border-radius:999px;background:${color}"></span>${status}
        </span>
      </div>
      ${row("Driver", trip.driverName || "—")}
      ${row("Partner", partnerOf(trip) || "—")}
      ${row("Heading to", trip.dropoff || "—")}
      ${row("Shown at", where || "—")}
    </div>
  `;
}

/**
 * Live Tracking map for the Transport Manager's dashboard.
 *
 * Coloured by the shared delay rule (`trip-duration` → `getTrackingDelayStatus`),
 * so a truck that is amber here is amber on the Tracking board too.
 */
export function DashboardLiveMap({ trips }: { trips: Trip[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const placed = useMemo<Placed[]>(
    () =>
      trips
        .map((trip) => {
          const resolved = resolveCoords(trip);
          return resolved ? { trip, ...resolved } : null;
        })
        .filter((entry): entry is Placed => entry !== null),
    [trips],
  );

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
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);

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

      const style = document.createElement("style");
      style.innerHTML = `
        .fleetopsx-dash-popup .leaflet-popup-content-wrapper {
          padding: 0; background: transparent; border-radius: 8px;
          box-shadow: 0 6px 24px rgba(0,0,0,.28);
        }
        .fleetopsx-dash-popup .leaflet-popup-content { margin: 0; width: auto !important; }
        .fleetopsx-dash-popup .leaflet-popup-tip { display: none; }
      `;
      document.head.appendChild(style);

      const seen: [number, number][] = [];
      const bounds: [number, number][] = [];

      for (const { trip, point, where } of placed) {
        const status = getTrackingDelayStatus(trip);
        const color = TRACKING_DELAY_COLOR[status];
        // Nudge coincident markers so two trucks in one city both stay visible.
        const spread = seen.filter((p) => p[0] === point[0] && p[1] === point[1]).length;
        const at: [number, number] = [point[0] + spread * 0.035, point[1] + spread * 0.035];
        seen.push(point);
        bounds.push(at);

        L.marker(at, {
          icon: L.divIcon({
            className: "fleetopsx-map-marker",
            html: truckBadge(color),
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        })
          .addTo(layers)
          .bindPopup(popupHtml(trip, status, color, where), {
            className: "fleetopsx-dash-popup",
            offset: [0, -12],
          });
      }

      if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 9 });
      } else if (bounds.length === 1) {
        map.setView(bounds[0]!, 9);
      }
      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, placed]);

  const zoomBy = (delta: number) => {
    mapRef.current?.setZoom((mapRef.current.getZoom() ?? NIGERIA_ZOOM) + delta);
  };

  return (
    <div>
      <div className="relative h-[380px] w-full overflow-hidden rounded-[8px] bg-[#EEF1F4] md:h-[460px]">
        <div ref={mapEl} className="z-0 h-full w-full" />
        <div className="absolute right-3 top-3 z-[500] flex flex-col overflow-hidden rounded-[6px] border border-[#E2E5E9] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            aria-label="Zoom in"
            className="grid size-9 place-items-center border-b border-[#E2E5E9] text-[#3C4653] transition-colors hover:bg-[#F7F8FA]"
          >
            <Plus className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            aria-label="Zoom out"
            className="grid size-9 place-items-center text-[#3C4653] transition-colors hover:bg-[#F7F8FA]"
          >
            <Minus className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-normal leading-4 text-[#8E95A1]">
        {placed.length > 0
          ? `${placed.length} of ${trips.length} active ${trips.length === 1 ? "dispatch" : "dispatches"} plotted. Trucks are placed at the route city we know them to be on — destinations come from the request, not a live GPS fix.`
          : "No truck on the road belongs to a city we can place yet."}
      </p>
    </div>
  );
}
