/**
 * One text→coords geocoder for every map in the app — REAL, not synthetic.
 *
 * The maps now resolve actual place names through OpenStreetMap's Nominatim
 * service (free, no key, attribution required by their usage policy). Results
 * are cached in localStorage so a place is geocoded once, ever, and every map
 * in the portal reuses it; an in-flight queue keeps us inside Nominatim's
 * 1-request-per-second courtesy limit.
 *
 * When Nominatim can't answer (offline, blocked, unknown village), the
 * deterministic city-anchor fallback from the original implementation still
 * returns a nearby point so a pin is never lost — and the caller can tell the
 * difference via `source: "nominatim" | "fallback"`.
 *
 * Everything is async now. `geocode()` is the real resolver; the old sync
 * `geocodeDeterministic` stays only as the fallback builder.
 */

export const FALLBACK_DEPOT: [number, number] = [9.0765, 7.3986]; // Abuja

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
  [/sagamu|shagamu|ogere/i, [6.8443, 3.6447]],
  [/ore\b|ondo\b/i, [6.7833, 5.4]],
  [/agbara|ota|sango/i, [6.4833, 3.0667]],
];

/** Deterministic ±0.18° scatter around the anchor — the fallback of last resort. */
export function geocodeDeterministic(place: string): [number, number] | null {
  const clean = place.trim();
  if (!clean) return null;
  const anchor = CITY_ANCHORS.find(([re]) => re.test(clean))?.[1] ?? FALLBACK_DEPOT;
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  const latOffset = ((hash % 1000) / 1000 - 0.5) * 0.36;
  const lngOffset = (((hash >> 10) % 1000) / 1000 - 0.5) * 0.36;
  return [anchor[0] + latOffset, anchor[1] + lngOffset];
}

/* --------------------------------------------------------------- cache ---- */

const CACHE_KEY = "fleetopsx_geocode_cache_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // a place does not move in 30 days

type CacheEntry = { lat: number; lng: number; label?: string; at: number; source: "nominatim" };

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* full or blocked storage — caching is an optimisation, not a requirement */
  }
}

function cacheKey(place: string) {
  return place.trim().toLowerCase();
}

/* --------------------------------------------------------- rate limiter ---- */

/** Nominatim asks for at most 1 request/second; serialise through a chain. */
let chain: Promise<unknown> = Promise.resolve();
const MIN_GAP_MS = 1100;
let lastStart = 0;

function rateLimited<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    return work();
  });
  chain = run.catch(() => {});
  return run as Promise<T>;
}

/* -------------------------------------------------------------- resolver ---- */

export type GeoPoint = {
  lat: number;
  lng: number;
  label?: string;
  source: "nominatim" | "fallback";
};

/** The exact URL Nominatim saw — kept in one place for the usage-policy UA. */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const UA = "FleetOpsX/1.0 (fleet operations portal; contact@fleetopsx.com)";

async function nominatim(place: string): Promise<GeoPoint | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(place)}, Nigeria&format=jsonv2&limit=1&countrycodes=ng`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  const hit = rows[0];
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: hit.display_name, source: "nominatim" };
}

/**
 * Resolve a place to REAL coordinates. Order:
 *   1. localStorage cache (instant, free, offline),
 *   2. Nominatim (rate-limited, 5s timeout),
 *   3. deterministic city-anchor fallback so the pin is never lost.
 */
export async function geocode(place: string): Promise<GeoPoint | null> {
  const clean = place.trim();
  if (!clean) return null;
  const key = cacheKey(clean);

  const cached = readCache()[key];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { lat: cached.lat, lng: cached.lng, label: cached.label, source: "nominatim" };
  }

  const hit = await rateLimited(() =>
    Promise.race([
      nominatim(clean).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]),
  );

  if (hit) {
    const cache = readCache();
    cache[key] = { lat: hit.lat, lng: hit.lng, label: hit.label, at: Date.now(), source: "nominatim" };
    writeCache(cache);
    return hit;
  }

  const fallback = geocodeDeterministic(clean);
  return fallback ? { lat: fallback[0], lng: fallback[1], source: "fallback" } : null;
}

/** Resolve every place in a list, feeding the shared cache and rate limiter. */
export async function geocodeAll(places: string[]): Promise<Map<string, GeoPoint>> {
  const out = new Map<string, GeoPoint>();
  await Promise.all(
    Array.from(new Set(places.filter(Boolean))).map(async (place) => {
      const point = await geocode(place);
      if (point) out.set(cacheKey(place), point);
    }),
  );
  return out;
}

/** [lat, lng] — the Leaflet order — from a GeoPoint. */
export function latLngOf(point: GeoPoint): [number, number] {
  return [point.lat, point.lng];
}

/** [lng, lat] — the MapLibre order — from a GeoPoint. */
export function lngLatOf(point: GeoPoint): [number, number] {
  return [point.lng, point.lat];
}
