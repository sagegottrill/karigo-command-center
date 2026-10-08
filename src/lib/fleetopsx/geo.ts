/**
 * One text→coords geocoder for every map in the app.
 *
 * The platform's location data is WORDS (loading sites, drop-off towns,
 * Tracking Ops checkpoint names) — no GPS feed exists yet. Rather than scatter
 * fake pins, this resolves a place name to the city anchor it names, with a
 * deterministic hash offset so the same place always plots at the same point
 * (no external geocoder dependency, no per-render drift).
 *
 * When a real GPS/checkpoint feed lands, this is the single file to replace.
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

export function geocodeDeterministic(place: string): [number, number] | null {
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
