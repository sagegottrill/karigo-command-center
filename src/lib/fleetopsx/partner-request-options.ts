/**
 * A partner's OWN loading sites.
 *
 * The request form used to offer one hardcoded list to every customer, so the
 * yards Saba Steel loads from (Saba Factory, Ijesha, Babangida…) were shown to
 * every other partner — and a partner with its own yard had no way to record it.
 *
 * Each site now belongs to a partner COMPANY and is stored on the company's own
 * account (`GET/POST/DELETE /api/partner-sites`). The form shows that partner's
 * list and nothing else:
 *
 *   - a partner with sites picks one from the dropdown;
 *   - a partner with none gets "Add your loading site" and types it;
 *   - anything typed is saved back to the company, so the next request offers it.
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

/** The one entry a partner with no sites yet is offered. */
export const ADD_LOADING_SITE_LABEL = "Add your loading site";

export type PartnerLoadingSiteDraft = {
  id: string;
  type: string;
  customValue: string;
};

/**
 * The list a partner may pick from: their own sites, plus the "add" entry.
 * The add entry is always last — the saved sites are the fast path.
 */
export function loadingSiteChoices(sites: string[]): string[] {
  return [...sites, ADD_LOADING_SITE_LABEL];
}

/** True when a site is being added rather than picked from the saved list. */
export function isAddingLoadingSite(type: string): boolean {
  return type === ADD_LOADING_SITE_LABEL;
}

/**
 * The stored name for a draft row: the typed value for an added site, otherwise
 * the picked one.
 */
export function resolvePartnerLoadingSite(site: PartnerLoadingSiteDraft): string {
  if (isAddingLoadingSite(site.type)) return site.customValue.trim();
  return site.type.trim();
}

/**
 * A partner's list in the shape the request form holds while editing: a saved
 * site is a plain pick, and anything NOT in the saved list opens as an added
 * site holding its own name — so correcting a request never silently drops a
 * yard the request was raised with.
 */
export function loadingSiteDraftFor(
  name: string,
  saved: string[],
  id: () => string,
): PartnerLoadingSiteDraft {
  const known = saved.some((s) => s.toLowerCase() === name.trim().toLowerCase());
  return known
    ? { id: id(), type: name, customValue: "" }
    : { id: id(), type: ADD_LOADING_SITE_LABEL, customValue: name };
}
