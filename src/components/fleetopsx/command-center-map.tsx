import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crosshair, Minus, MoreVertical, Plus } from "lucide-react";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

const FOCUS = ["En Route", "Returning", "Loaded", "Delayed"] as const;

const STATUS_COLOR: Record<string, string> = {
  "En Route": "#0071e3",
  Returning: "#34c759",
  Loaded: "#5ac8fa",
  Delayed: "#ff3b30",
  Offloading: "#af52de",
  Stopped: "#ff9f0a",
};

const CITY_COORDS: Record<string, [number, number]> = {
  Lagos: [6.5244, 3.3792],
  Abuja: [9.0765, 7.3986],
  "Port Harcourt": [4.8156, 7.0498],
  Kano: [12.0022, 8.592],
  Ibadan: [7.3775, 3.947],
  Warri: [5.5167, 5.75],
  Onitsha: [6.1667, 6.7833],
  Kaduna: [10.5222, 7.4384],
  "Benin City": [6.335, 5.6037],
  Enugu: [6.4584, 7.5464],
  Calabar: [4.9757, 8.3417],
  Jos: [9.8965, 8.8583],
  Aba: [5.1066, 7.3667],
  Maiduguri: [11.8333, 13.15],
};

const NIGERIA_CENTER: [number, number] = [9.1, 8.0];
const NIGERIA_ZOOM = 6;

function statusDot(color: string, pulse = false) {
  return `
    <span style="
      display:block;width:12px;height:12px;border-radius:999px;
      background:${color};border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.25);
      ${pulse ? `box-shadow:0 0 0 8px ${color}33, 0 1px 4px rgba(0,0,0,.25);` : ""}
    "></span>
  `;
}

function statusPill(label: string, color: string) {
  return `
    <div style="
      display:flex;align-items:center;gap:8px;
      background:#fff;border-radius:999px;padding:8px 14px;
      font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#1d1d1f;white-space:nowrap;
      box-shadow:0 8px 24px rgba(0,0,0,.12);border:1px solid rgba(0,0,0,.06);
      cursor:pointer;
    ">
      <span style="width:8px;height:8px;border-radius:999px;background:${color}"></span>
      ${label}
    </div>
  `;
}

export function CommandCenterMap({
  trips,
  activeTrips,
  trucks,
  approvals,
}: {
  trips: Trip[];
  activeTrips: number;
  trucks: number;
  approvals: number;
}) {
  const live = useMemo(
    () =>
      trips.filter((t) =>
        ["En Route", "Returning", "Loaded", "Delayed", "Offloading", "Stopped"].includes(t.status),
      ),
    [trips],
  );

  const [selected, setSelected] = useState<Trip | null>(
    () => live.find((t) => t.status === "Delayed") ?? live[0] ?? null,
  );

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const featured = useMemo(() => {
    return FOCUS.map((status) => {
      const trip = trips.find((t) => t.status === status) ?? null;
      return { status, trip };
    });
  }, [trips]);

  // Init map once (client-only)
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
        attributionControl: true,
        minZoom: 5,
        maxZoom: 12,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
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

  // Draw markers / routes when data or selection changes
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

      live.slice(0, 5).forEach((t) => {
        const from = CITY_COORDS[t.pickup];
        const to = CITY_COORDS[t.dropoff];
        if (!from || !to) return;
        L.polyline([from, [t.lat, t.lng], to], {
          color: t.status === "Delayed" ? "#ff3b30" : "#ff9f0a",
          weight: 3,
          opacity: 0.75,
          dashArray: t.status === "Delayed" ? "6 6" : undefined,
        }).addTo(layers);
      });

      live.slice(0, 18).forEach((t) => {
        const color = STATUS_COLOR[t.status] ?? "#86868b";
        const isSel = selected?.id === t.id;
        const icon = L.divIcon({
          className: "fleetopsx-map-marker",
          html: statusDot(color, isSel || t.status === "En Route"),
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        L.marker([t.lat, t.lng], { icon })
          .addTo(layers)
          .on("click", () => setSelected(t));
      });

      featured.forEach(({ status, trip }) => {
        if (!trip) return;
        const color = STATUS_COLOR[status]!;
        const icon = L.divIcon({
          className: "fleetopsx-map-pill",
          html: statusPill(status, color),
          iconSize: [120, 36],
          iconAnchor: [60, 18],
        });
        L.marker([trip.lat, trip.lng], { icon, zIndexOffset: 500 })
          .addTo(layers)
          .on("click", () => setSelected(trip));
      });

      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, live, featured, selected]);

  const zoomBy = (delta: number) => {
    mapRef.current?.setZoom((mapRef.current.getZoom() ?? NIGERIA_ZOOM) + delta);
  };

  const recenter = () => {
    mapRef.current?.setView(NIGERIA_CENTER, NIGERIA_ZOOM, { animate: true });
  };

  return (
    <section className="overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0071e3] text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,113,227,0.35)]">
            K
          </span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">Command Center</h2>
            <p className="text-[11px] text-muted-foreground">Nigeria · OpenStreetMap</p>
          </div>
        </div>
        <p className="text-[12px] font-semibold text-[#34c759]">Online · PTL-001</p>
      </div>

      <div className="grid grid-cols-3 gap-3 px-5">
        {[
          { label: "Active Trips", value: activeTrips },
          { label: "Trucks", value: trucks },
          { label: "Approvals", value: approvals },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-[18px] border border-black/[0.05] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <p className="num text-[28px] leading-none font-semibold tracking-[-0.04em] text-foreground">{m.value}</p>
            <p className="mt-1.5 text-[12px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="relative mx-5 mt-4 mb-5 h-[380px] overflow-hidden rounded-[20px] ring-1 ring-black/[0.06] sm:h-[460px]">
        <div className="absolute top-3 left-3 z-[500] flex items-center gap-2">
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-foreground shadow-sm ring-1 ring-black/[0.06]">
            Route map
          </span>
        </div>
        <button
          type="button"
          className="absolute top-3 right-3 z-[500] grid h-9 w-9 place-items-center rounded-full bg-white/95 text-foreground shadow-sm ring-1 ring-black/[0.06]"
          aria-label="Map options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        <div ref={mapEl} className="absolute inset-0 z-0 h-full w-full bg-[#e8eef4]" />

        <div className="absolute top-1/2 right-3 z-[500] flex -translate-y-1/2 flex-col gap-2">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow-sm ring-1 ring-black/[0.08] active:scale-95"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow-sm ring-1 ring-black/[0.08] active:scale-95"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-3 left-3 z-[500] grid h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow-sm ring-1 ring-black/[0.08] active:scale-95"
          aria-label="Recenter Nigeria"
        >
          <Crosshair className="h-4 w-4" />
        </button>

        <div className="absolute bottom-3 left-14 z-[500] flex flex-wrap gap-1.5">
          {FOCUS.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-black/[0.05]"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {s}
            </span>
          ))}
        </div>

        {selected && (
          <div className="absolute right-3 bottom-3 z-[500] max-w-[230px] rounded-[16px] bg-white/95 p-3 shadow-[0_10px_28px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]">
            <p className="num text-[12px] font-semibold">{selected.id}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {selected.pickup} → {selected.dropoff}
            </p>
            <p
              className={cn("mt-1 text-[11px] font-semibold")}
              style={{ color: STATUS_COLOR[selected.status] ?? "#1d1d1f" }}
            >
              {selected.status}
            </p>
            <Link
              to="/app/trips/$tripId"
              params={{ tripId: selected.id }}
              className="mt-2 inline-block text-[11px] font-semibold underline-offset-2 hover:underline"
            >
              Open trip
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
