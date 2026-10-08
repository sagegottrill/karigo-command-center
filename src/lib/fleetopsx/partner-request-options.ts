/**
 * Loading-site choices for the partner request forms.
 *
 * A partner no longer types a yard by hand: the selector offers the platform's
 * NAMED loading locations — the Apapa and Tincan yards the register added —
 * grouped under the port each one works from, plus (when the company has
 * recorded its own yards) the sites saved on that company's account. Anything
 * outside these names has to be added to the company account by the Transport
 * Manager, so a request can no longer arrive with a location nobody filed.
 */

export const PARTNER_TRUCK_TYPE_OPTIONS = [
  "Full Sided",
  "Semi Sided",
  "Flat",
  "Side Guide",
  "Low Bed",
  "6 Meter Truck",
  "8 Meter Truck",
  "Pick Up",
] as const;

/**
 * The named loading locations, grouped by the port they sit in. The port name
 * is the heading the dropdown shows — "Tincan", "Apapa" — and the sites under
 * it are what the request stores.
 */
export const PARTNER_LOADING_LOCATION_GROUPS: { port: string; sites: string[] }[] = [
  { port: "Apapa", sites: ["ENL", "Eco Support", "Dangote"] },
  { port: "Tincan", sites: ["Port and Cargo", "Niger Dock", "Joseph Dam"] },
];

/**
 * The dropdown's contents: the named locations first (grouped under their
 * port), then the company's own saved sites under their own heading. A
 * company with no saved sites sees the named locations and nothing else.
 */
export function loadingSiteChoiceGroups(
  savedSites: string[],
): { heading: string | null; options: string[] }[] {
  const groups: { heading: string | null; options: string[] }[] =
    PARTNER_LOADING_LOCATION_GROUPS.map((g) => ({ heading: g.port, options: [...g.sites] }));
  const named = new Set(PARTNER_LOADING_LOCATION_GROUPS.flatMap((g) => g.sites));
  const own = savedSites.filter((s) => !named.has(s));
  if (own.length > 0) groups.push({ heading: "Your saved sites", options: own });
  return groups;
}

/** The flat list a draft row may hold: every named location + saved sites. */
export function partnerLoadingSiteNames(savedSites: string[]): string[] {
  return loadingSiteChoiceGroups(savedSites).flatMap((g) => g.options);
}

export type PartnerLoadingSiteDraft = {
  id: string;
  /** The picked site's stored name — or ADD_LOADING_SITE_LABEL while typing. */
  type: string;
  /** The typed yard when the row is an "add" row; empty on a pick. */
  customValue: string;
  /**
   * The requester's explicit say-so that a TYPED-IN site should join the
   * saved list (internal raise-on-behalf form only).
   */
  saveToSites?: boolean;
};

/* ------------------------------------------------------------------ *
 * Free-typing support — INTERNAL raise-on-behalf form ONLY.
 *
 * The partner portal no longer offers typed yards: its selector lists the
 * named locations (Apapa / Tincan) plus the company's own saved sites. The
 * internal form still lets Fleet Ops record a yard the register does not
 * carry yet, so these stay exported for it.
 * ------------------------------------------------------------------ */

/** The one entry a partner with no sites yet is offered (internal form). */
export const ADD_LOADING_SITE_LABEL = "Add your loading site";

/** The list the internal form offers: saved sites, then the "add" entry. */
export function loadingSiteChoices(sites: string[]): string[] {
  return [...sites, ADD_LOADING_SITE_LABEL];
}

/** True when a row is being typed rather than picked from a list. */
export function isAddingLoadingSite(type: string): boolean {
  return type === ADD_LOADING_SITE_LABEL;
}

/** The stored name for a draft row: the typed value for an added site, otherwise
 * the picked one.
 */
export function resolvePartnerLoadingSite(site: PartnerLoadingSiteDraft): string {
  if (isAddingLoadingSite(site.type)) return site.customValue.trim();
  return site.type.trim();
}

/**
 * A partner's list in the shape the request form holds while editing: an
 * editing request always opens with the sites it was raised with, even one
 * that has since left the dropdown — correcting a request never silently
 * drops a yard the request was raised with.
 */
export function loadingSiteDraftFor(
  name: string,
  _saved: string[],
  id: () => string,
): PartnerLoadingSiteDraft {
  // The row always carries the request's own site name — even one that has
  // since left the dropdown — so correcting a request never silently drops
  // the yard it was raised with.
  return { id: id(), type: name, customValue: "" };
}
