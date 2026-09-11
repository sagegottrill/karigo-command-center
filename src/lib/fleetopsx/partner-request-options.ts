/** Shared Partner New Request / Modify Request option lists (Figma Partner Request). */

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

export const PARTNER_LOADING_SITE_OPTIONS = [
  "Comfortoboh",
  "Happy Home",
  "Ijesha.1",
  "Babangida.1",
  "Babangida.2",
  "Ijesha.2",
  "Babangida.3",
  "Metalberg.K",
  "Saba Factory",
  "Others",
] as const;

export type PartnerLoadingSiteDraft = {
  id: string;
  type: string;
  customValue: string;
};

export function resolvePartnerLoadingSite(site: PartnerLoadingSiteDraft): string {
  if (site.type === "Others") return site.customValue.trim();
  return site.type.trim();
}
