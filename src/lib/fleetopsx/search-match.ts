/**
 * How a typed search finds a row.
 *
 * Operators search for what is written on the truck, not for what the database
 * stores: they type "KSF 72 YF" for a plate held as "KSF72YF", "p-017" for cap
 * code "P017", or "GRR 171XA" for a registration. A plain `includes` on the raw
 * strings answers "no results" to all three — which is exactly what "search is
 * not working" looks like from the other side of the screen.
 *
 * So a match is either the literal substring OR the same comparison with case,
 * spaces and punctuation stripped from BOTH sides.
 */

/** Comparison key: lower-case, alphanumerics only. */
export function searchKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * True when the query is found in the haystack.
 *
 * An empty query matches everything (the caller is not filtering). A query of
 * nothing but punctuation matches nothing — it must never accidentally match
 * every row.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const typed = query.trim();
  if (!typed) return true;
  if (haystack.toLowerCase().includes(typed.toLowerCase())) return true;
  const loose = searchKey(typed);
  if (!loose) return false;
  return searchKey(haystack).includes(loose);
}

/**
 * The searchable text for one dispatch: request id, partner, consignee, cargo,
 * the truck's own numbers (cap code and plate, as the operators say them), the
 * tail, the driver and both ends of the run.
 *
 * Shared so a truck number finds a request here AND on the dispatch board —
 * looking for the same truck on two screens must not give two answers.
 */
export function dispatchSearchText(trip: {
  customer?: string | null;
  customerConsignee?: string | null;
  cargo?: string | null;
  dropoff?: string | null;
  dropoffAddress?: string | null;
  pickup?: string | null;
  loadingSite?: string[] | string | null;
  status?: string | null;
  truckReg?: string | null;
  headId?: string | null;
  tailNumber?: string | null;
  tailType?: string | null;
  requestedTruckType?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}): string {
  const sites = Array.isArray(trip.loadingSite)
    ? trip.loadingSite.join(" ")
    : (trip.loadingSite ?? trip.pickup ?? "") || "";
  // The record's uuid is deliberately left out: with punctuation stripped it
  // matches almost any short numeric query and would make a truck number
  // unsearchable. Callers add the display id the operators actually read.
  return [
    trip.customer,
    trip.customerConsignee,
    trip.cargo,
    trip.requestedTruckType,
    trip.tailType,
    trip.tailNumber,
    trip.truckReg,
    trip.headId,
    trip.driverName,
    trip.driverPhone,
    sites,
    trip.dropoff,
    trip.dropoffAddress,
    trip.status,
  ]
    .filter(Boolean)
    .join(" ");
}
