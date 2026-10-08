import { useEffect, useMemo, useRef } from "react";
import { displayCapPlateFromTrip, displayPlateFromTrip } from "@/lib/fleetopsx/display-ids";
import { geocodeDeterministic } from "@/lib/fleetopsx/geo";
import {
  getTrackingDelayStatus,
  TRACKING_DELAY_COLOR,
  type TrackingDelayStatus,
} from "@/lib/fleetopsx/tracking-ops";
import type { Trip } from "@/lib/fleetopsx/types";
import type * as MapLibreGL from "maplibre-gl";
import { Car, MapPin, Flag } from "lucide-react";
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MapRoute,
  RouteProgress,
  RouteMarker,
} from "@/components/ui/map";

/**
 * LIVE DISPATCH MAP — every active dispatch, plotted from its OWN data, on
 * MapLibre GL via the mapcn components (src/components/ui/map).
 *
 * The platform's location facts are words: the loading site the load starts
 * from, the drop-off it is heading to, and the progress the boards already
 * compute from the TM's duration promise. Each truck rides ITS route between
 * ITS real origin and destination — the covered part of the line is painted
 * in the same delay colour the stats above this map count, and the truck
 * marker sits at the exact progress point. No demo points, no mock addresses.
 */

function tripOrigin(trip: Trip): string {
  return trip.loadingSite?.[0] || trip.pickup || "";
}

/** geo.ts answers [lat, lng] (Leaflet order); MapLibre wants [lng, lat]. */
function toLngLat(point: [number, number] | null): [number, number] | null {
  return point ? [point[1], point[0]] : null;
}

function tripEndpoints(trip: Trip): {
  origin: string;
  destination: string;
  from: [number, number] | null;
  to: [number, number] | null;
} {
  const origin = tripOrigin(trip);
  const destination = trip.dropoff || "";
  const from =
    toLngLat(geocodeDeterministic(origin)) ?? toLngLat(geocodeDeterministic(trip.dropoff));
  const to = toLngLat(geocodeDeterministic(destination));
  return { origin, destination, from, to };
}

/** The truck sits along its own route at the real progress figure, clamped. */
function progressFraction(trip: Trip): number {
  return Math.min(0.95, Math.max(0.05, (trip.progress ?? 0) / 100));
}

function positionAt(
  from: [number, number],
  to: [number, number],
  fraction: number,
): [number, number] {
  return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
}

function TripPopup({
  trip,
  status,
  origin,
  destination,
}: {
  trip: Trip;
  status: TrackingDelayStatus;
  origin: string;
  destination: string;
}) {
  const truck = displayCapPlateFromTrip(trip) || "—";
  const plate = displayPlateFromTrip(trip);
  return (
    <div className="w-64 space-y-2 p-0">
      <div className="flex items-center justify-between rounded-t-md bg-[#1B2432] px-3 py-2">
        <span className="text-[13px] font-semibold text-white">{truck}</span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-300">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: TRACKING_DELAY_COLOR[status] }}
          />
          {status}
        </span>
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 px-3 pb-3 text-[11px]">
        <span className="text-gray-500">Registration</span>
        <span className="font-medium text-gray-900">{plate || "—"}</span>
        <span className="text-gray-500">Driver</span>
        <span className="text-gray-900">{trip.driverName || "—"}</span>
        <span className="text-gray-500">From</span>
        <span className="text-gray-900">{origin || "—"}</span>
        <span className="text-gray-500">To</span>
        <span className="text-gray-900">{destination || "—"}</span>
        <span className="text-gray-500">Progress</span>
        <span className="font-semibold text-gray-900">{Math.round(trip.progress ?? 0)}%</span>
      </div>
    </div>
  );
}

export function DispatchLiveMap({ trips }: { trips: Trip[] }) {
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const fitDoneRef = useRef(false);

  // One plotted row per active dispatch: its real route and real position.
  const plotted = useMemo(() => {
    return trips.map((trip) => {
      const { origin, destination, from, to } = tripEndpoints(trip);
      const status = getTrackingDelayStatus(trip);
      const fraction = progressFraction(trip);
      const route = from && to ? [from, to] : null;
      return {
        trip,
        origin,
        destination,
        status,
        fraction,
        route,
        position: route ? positionAt(from!, to!, fraction) : from,
      };
    });
  }, [trips]);

  // The view follows the fleet: one truck or fifty, the map frames the real
  // routes instead of staring at one city.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitDoneRef.current) return;
    const points = plotted.flatMap((p) => p.route ?? (p.position ? [p.position] : []));
    if (!points.length) return;
    fitDoneRef.current = true;
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 60, duration: 0 },
    );
  }, [plotted]);

  return (
    <div className="mt-2 w-full md:mt-4">
      {/* Mobile Tracking Operations header — the badge is the real trip count. */}
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <h2 className="text-[16px] font-bold text-[#141a1f]">Tracking Operations</h2>
        <span className="flex h-5 items-center justify-center rounded-[4px] bg-[#ea3a3d] px-1.5 text-[11px] font-bold text-white">
          {trips.length}
        </span>
      </div>

      <div className="w-full overflow-hidden rounded-[12px] border border-[#e2e5e9] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center md:gap-4 md:border-b md:border-[#e2e5e9]">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold text-[#141a1f]">Dispatch Overview</h2>
            <span className="flex h-6 items-center justify-center rounded-[4px] bg-[#ea3a3d] px-2 text-[11px] font-bold text-white">
              {trips.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {(Object.entries(TRACKING_DELAY_COLOR) as [TrackingDelayStatus, string][]).map(
              ([label, color]) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5c6470] md:text-[12px]"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="relative h-[400px] w-full bg-white md:h-[500px]">
          <Map
            ref={mapRef}
            center={[7.3986, 9.0765]} // Abuja; fitBounds tightens to the real routes
            zoom={6}
            attributionControl={false}
            className="h-full w-full"
          >
            <MapControls position="top-right" showCompass showFullscreen />

            {plotted.map(({ trip, origin, destination, status, fraction, route, position }) => {
              if (!position) return null;
              const color = TRACKING_DELAY_COLOR[status];
              return (
                <div key={trip.id}>
                  {/* The route itself, origin → destination, so a truck always sits ON a road. */}
                  {route && (
                    <MapRoute
                      coordinates={route}
                      progress={fraction}
                      color="#1B2432"
                      width={2}
                      opacity={0.25}
                      dashArray={[0.5, 1.5]}
                    >
                      {/* Covered distance paints in the delay colour the stats count. */}
                      <RouteProgress color={color} width={3} opacity={0.9} />
                      <RouteMarker at="start">
                        <MarkerContent>
                          <MapPin
                            className="size-3.5 fill-[#1B2432] text-white"
                            strokeWidth={1.5}
                          />
                        </MarkerContent>
                      </RouteMarker>
                      <RouteMarker at="end">
                        <MarkerContent>
                          <Flag className="size-3.5 fill-[#1B2432] text-white" strokeWidth={1.5} />
                        </MarkerContent>
                      </RouteMarker>
                    </MapRoute>
                  )}

                  {/* The truck, at the exact progress point on its own route. */}
                  <MapMarker longitude={position[0]} latitude={position[1]}>
                    <MarkerContent>
                      <div
                        className="grid size-6 place-items-center rounded-full shadow-md ring-2 ring-white transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                      >
                        <Car className="size-3.5 text-white" />
                      </div>
                    </MarkerContent>
                    <MarkerPopup className="rounded-[8px] p-0 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                      <TripPopup
                        trip={trip}
                        status={status}
                        origin={origin}
                        destination={destination}
                      />
                    </MarkerPopup>
                  </MapMarker>
                </div>
              );
            })}
          </Map>
        </div>
      </div>
    </div>
  );
}
