import { useEffect, useMemo, useRef, useState } from "react";
import type { Trip } from "@/lib/fleetopsx/types";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
} from "@/lib/fleetopsx/display-ids";
import {
  getTrackingDelayStatus,
  partnerOf,
  TRACKING_DELAY_COLOR,
} from "@/lib/fleetopsx/tracking-ops";
import {
  geocode,
  geocodeDeterministic,
  lngLatOf,
  type GeoPoint,
} from "@/lib/fleetopsx/geo";
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
import { Car, MapPin, Flag } from "lucide-react";

/**
 * THE DASHBOARD'S MAP — the same live map the Tracking board uses.
 *
 * One map engine across the portal: the mapcn (MapLibre GL) components with
 * REAL geocoding — places resolve through OpenStreetMap's Nominatim, cached in
 * localStorage, with the deterministic city-anchor scatter only as a fallback.
 * The old Leaflet implementation with its hardcoded CITY_COORDS table is gone:
 * one code path, one geocoder, no second cache to drift.
 *
 * Presentation stays the dashboard's: clustered trucks tinted by the shared
 * delay rule, a compact popup, and the partner filter above feeding it trips.
 */

function tripOrigin(trip: Trip): string {
  return trip.loadingSite?.[0] || trip.pickup || "";
}

/** geo.ts answers [lat, lng] (Leaflet order); MapLibre wants [lng, lat]. */
function toLngLat(point: [number, number] | null): [number, number] | null {
  return point ? [point[1], point[0]] : null;
}

function TripPopup({
  trip,
  status,
  origin,
  destination,
}: {
  trip: Trip;
  status: ReturnType<typeof getTrackingDelayStatus>;
  origin: string;
  destination: string;
}) {
  const truck = displayCapFromTrip(trip) || trip.truckReg || "—";
  const plate = displayPlateFromTrip(trip);
  return (
    <div className="w-60 space-y-2 p-0">
      <div className="flex items-center justify-between rounded-t-md bg-[#1B2432] px-3 py-2">
        <span className="max-w-[150px] truncate text-[13px] font-semibold text-white">
          {truck}
        </span>
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
        <span className="text-gray-500">Partner</span>
        <span className="text-gray-900">{partnerOf(trip) || "—"}</span>
        <span className="text-gray-500">From</span>
        <span className="text-gray-900">{origin || "—"}</span>
        <span className="text-gray-500">To</span>
        <span className="text-gray-900">{destination || "—"}</span>
        <span className="text-gray-500">Progress</span>
        <span className="font-semibold text-gray-900">
          {Math.round(trip.progress ?? 0)}%
        </span>
      </div>
    </div>
  );
}

export function DashboardLiveMap({ trips }: { trips: Trip[] }) {
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const fitDoneRef = useRef(false);

  /**
   * REAL PLACES: origins/destinations resolve through Nominatim (cached), and
   * the map sharpens from the fallback scatter onto true coordinates.
   */
  const [resolved, setResolved] = useState<Record<string, GeoPoint>>({});
  useEffect(() => {
    let cancelled = false;
    const places = Array.from(
      new Set(
        trips
          .flatMap((t) => [tripOrigin(t), t.dropoff || ""].map((p) => p.trim()))
          .filter(Boolean),
      ),
    );
    if (!places.length) return;
    void (async () => {
      const next: Record<string, GeoPoint> = {};
      for (const place of places) {
        const point = await geocode(place);
        if (cancelled) return;
        if (point && point.source === "nominatim") next[place.toLowerCase()] = point;
      }
      if (!cancelled && Object.keys(next).length) setResolved(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [trips]);

  /** Trucks sit on their own origin→destination route at their progress. */
  const plotted = useMemo(() => {
    return trips.map((trip) => {
      const origin = tripOrigin(trip);
      const destination = trip.dropoff || "";
      const from =
        toLngLat(
          resolved[origin.toLowerCase()]
            ? lngLatOf(resolved[origin.toLowerCase()]!)
            : null,
        ) ??
        toLngLat(
          resolved[destination.toLowerCase()]
            ? lngLatOf(resolved[destination.toLowerCase()]!)
            : null,
        ) ??
        toLngLat(geocodeDeterministic(origin));
      const to =
        toLngLat(
          resolved[destination.toLowerCase()]
            ? lngLatOf(resolved[destination.toLowerCase()]!)
            : null,
        ) ?? toLngLat(geocodeDeterministic(destination));
      const status = getTrackingDelayStatus(trip);
      const fraction = Math.min(0.95, Math.max(0.05, (trip.progress ?? 0) / 100));
      const route = from && to ? [from, to] : null;
      const position = route
        ? ([
            from![0] + (to![0] - from![0]) * fraction,
            from![1] + (to![1] - from![1]) * fraction,
          ] as [number, number])
        : from;
      return { trip, origin, destination, status, fraction, route, position };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, resolved]);

  // Frame the real routes once data is on the board.
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
    <div>
      <div className="relative h-[380px] w-full overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white md:h-[460px]">
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
                {route && (
                  <MapRoute
                    coordinates={route}
                    progress={fraction}
                    color="#1B2432"
                    width={2}
                    opacity={0.25}
                    dashArray={[0.5, 1.5]}
                  >
                    <RouteProgress color={color} width={3} opacity={0.9} />
                    <RouteMarker at="start">
                      <MarkerContent>
                        <MapPin className="size-3.5 fill-[#1B2432] text-white" strokeWidth={1.5} />
                      </MarkerContent>
                    </RouteMarker>
                    <RouteMarker at="end">
                      <MarkerContent>
                        <Flag className="size-3.5 fill-[#1B2432] text-white" strokeWidth={1.5} />
                      </MarkerContent>
                    </RouteMarker>
                  </MapRoute>
                )}
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
      <p className="mt-2 text-[11px] font-normal leading-4 text-[#8E95A1]">
        {trips.length > 0
          ? `${trips.length} active ${trips.length === 1 ? "dispatch" : "dispatches"} plotted between their real loading site and destination — positions resolve through OpenStreetMap.`
          : "No truck on the road yet."}
      </p>
    </div>
  );
}
