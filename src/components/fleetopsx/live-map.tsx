import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crosshair, Layers, Maximize2, Navigation } from "lucide-react";
import type { Trip } from "@/lib/fleetopsx/types";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Simulated live operations map. Swap projection/markers for Maps JS later.
 */
const BOUNDS = { minLat: 4.2, maxLat: 13.2, minLng: 2.8, maxLng: 13.8 };

function project(lat: number, lng: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = (1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x: Math.min(96, Math.max(4, x)), y: Math.min(94, Math.max(6, y)) };
}

const DOT: Record<string, string> = {
  "En Route": "bg-[#1d1d1f]",
  Loaded: "bg-[#64d2ff]",
  Offloading: "bg-[#64d2ff]",
  Returning: "bg-[#34c759]",
  Delayed: "bg-[#ff9f0a]",
  Stopped: "bg-[#ff3b30]",
  Scheduled: "bg-[#86868b]",
  Completed: "bg-[#86868b]",
};

export function LiveOperationsMap({ trips }: { trips: Trip[] }) {
  const active = trips.filter((t) => t.status !== "Completed").slice(0, 26);
  const [selected, setSelected] = useState<Trip | null>(active[0] ?? null);

  return (
    <div className="relative h-[460px] overflow-hidden rounded-[24px] border border-black/[0.05] bg-[linear-gradient(160deg,#fbfbfd_0%,#f0f0f2_50%,#e8e8ed_100%)] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
      <div className="grid-backdrop absolute inset-0 opacity-30" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {active.slice(0, 10).map((t, i) => {
          const a = project(t.lat, t.lng);
          const b = project(t.lat + (i % 3) - 1, t.lng + ((i % 4) - 1.5));
          return (
            <line
              key={t.id}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="currentColor"
              className="text-black/15"
              strokeWidth="0.25"
              strokeDasharray="1.5 1.2"
            />
          );
        })}
      </svg>

      {active.map((t) => {
        const p = project(t.lat, t.lng);
        const isSel = selected?.id === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            aria-label={`${t.truckReg} ${t.status}`}
          >
            <span className={cn("block h-2.5 w-2.5 rounded-full ring-2 ring-white", DOT[t.status] ?? "bg-[#86868b]")} />
            {isSel && <span className="absolute -inset-2 animate-ping rounded-full border border-[#1d1d1f]/40" />}
          </button>
        );
      })}

      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
        {["En Route", "Loaded", "Offloading", "Returning", "Delayed", "Stopped"].map((s) => (
          <span
            key={s}
            className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06]"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", DOT[s])} />
            {s}
          </span>
        ))}
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        {[Layers, Crosshair, Maximize2].map((Icon, i) => (
          <Button
            key={i}
            size="sm"
            variant="outline"
            className="h-8 w-8 rounded-full bg-white p-0 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 w-[290px] rounded-[22px] border border-black/[0.05] bg-white p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between gap-2">
            <p className="num text-sm font-semibold text-foreground">{selected.truckReg}</p>
            <StatusBadge status={selected.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.pickup} â†’ {selected.dropoff}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Driver</dt>
            <dd className="truncate text-right text-foreground">{selected.driverName}</dd>
            <dt className="text-muted-foreground">Cargo</dt>
            <dd className="truncate text-right text-foreground">{selected.cargo}</dd>
            <dt className="text-muted-foreground">Distance</dt>
            <dd className="num text-right text-foreground">{selected.distanceKm} km</dd>
            <dt className="text-muted-foreground">ETA</dt>
            <dd className="num text-right text-foreground">{selected.eta}</dd>
          </dl>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[#1d1d1f]" style={{ width: `${selected.progress}%` }} />
          </div>
          <Button asChild size="sm" className="mt-3 h-8 w-full gap-1.5 text-[12px]">
            <Link to="/workspace/app/trips/$tripId" params={{ tripId: selected.id }}>
              <Navigation className="h-3 w-3" />
              Open trip {selected.id}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

