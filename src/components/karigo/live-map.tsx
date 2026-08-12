import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crosshair, Layers, Maximize2, Navigation } from "lucide-react";
import type { Trip } from "@/lib/karigo/types";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Simulated live operations map. The projection and marker layer are built to
 * be swapped for a Google Maps JS API surface without changing the panel API.
 */
const BOUNDS = { minLat: 4.2, maxLat: 13.2, minLng: 2.8, maxLng: 13.8 };

function project(lat: number, lng: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = (1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x: Math.min(96, Math.max(4, x)), y: Math.min(94, Math.max(6, y)) };
}

const DOT: Record<string, string> = {
  "En Route": "bg-primary",
  Loaded: "bg-info",
  Offloading: "bg-info",
  Returning: "bg-success",
  Delayed: "bg-warning",
  Stopped: "bg-critical",
  Scheduled: "bg-neutral",
  Completed: "bg-neutral",
};

export function LiveOperationsMap({ trips }: { trips: Trip[] }) {
  const active = trips.filter((t) => t.status !== "Completed").slice(0, 26);
  const [selected, setSelected] = useState<Trip | null>(active[0] ?? null);

  return (
    <div className="relative h-[460px] overflow-hidden rounded-lg border border-border bg-[oklch(0.18_0.024_252)]">
      <div className="grid-backdrop absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_35%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_62%)]" />

      {/* route lines */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {active.slice(0, 10).map((t, i) => {
          const a = project(t.lat, t.lng);
          const b = project(t.lat + (i % 3) - 1, t.lng + ((i % 4) - 1.5));
          return (
            <line
              key={t.id}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="currentColor"
              className="text-primary/25"
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
            <span className={cn("block h-2.5 w-2.5 rounded-full ring-2 ring-background", DOT[t.status] ?? "bg-neutral")} />
            {isSel && <span className="absolute -inset-2 animate-ping rounded-full border border-primary/60" />}
          </button>
        );
      })}

      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
        {["En Route", "Loaded", "Offloading", "Returning", "Delayed", "Stopped"].map((s) => (
          <span key={s} className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
            <span className={cn("h-1.5 w-1.5 rounded-full", DOT[s])} />
            {s}
          </span>
        ))}
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        {[Layers, Crosshair, Maximize2].map((Icon, i) => (
          <Button key={i} size="sm" variant="outline" className="h-7 w-7 bg-background/80 p-0 backdrop-blur">
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 w-[290px] rounded-lg border border-border bg-background/92 p-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <p className="num text-sm font-semibold text-foreground">{selected.truckReg}</p>
            <StatusBadge status={selected.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.pickup} → {selected.dropoff}
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
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${selected.progress}%` }} />
          </div>
          <Button asChild size="sm" className="mt-3 h-7 w-full gap-1.5 text-xs">
            <Link to="/app/trips/$tripId" params={{ tripId: selected.id }}>
              <Navigation className="h-3 w-3" />
              Open trip {selected.id}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
