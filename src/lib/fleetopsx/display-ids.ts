/**
 * Production display helpers — never surface raw API UUIDs for caps, salary, tickets, or tails.
 */
import {
  PETROLINE_BODIES,
  PETROLINE_CABS,
  type PetrolineBody,
  type PetrolineCab,
} from "./petroline-roster";
import { PETROLINE_DRIVERS, type PetrolineDriver } from "./petroline-drivers";
import type { Driver, TruckHead, TruckTail } from "./types";

import { displayRequestId } from "./request-id";
import { PARTNER_TRUCK_TYPE_OPTIONS } from "./partner-request-options";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

/** Prefer human codes (P002, B001, REQ-01311); drop UUIDs. */
export function humanCode(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (!v || looksLikeUuid(v)) continue;
    return v;
  }
  return "";
}

export function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const cabByPlate = new Map(
  PETROLINE_CABS.map((c) => [normalizePlate(c.plate), c] as const).filter(([p]) => Boolean(p)),
);

const cabById = new Map(PETROLINE_CABS.map((c) => [c.cabId.toUpperCase(), c]));

const driverByPhone = new Map<string, PetrolineDriver>();
const driverByName = new Map<string, PetrolineDriver>();
const driverBySalary = new Map<string, PetrolineDriver>();

for (const d of PETROLINE_DRIVERS) {
  driverBySalary.set(d.salaryNumber.toUpperCase(), d);
  const phone = normalizePhone(d.phone);
  if (phone) driverByPhone.set(phone, d);
  const name = normalizePersonName(d.name);
  if (name) driverByName.set(name, d);
}

export function findRosterCabByPlate(plate: string | null | undefined): PetrolineCab | undefined {
  const key = normalizePlate(plate);
  if (!key) return undefined;
  return cabByPlate.get(key);
}

export function findRosterCabById(cabId: string | null | undefined): PetrolineCab | undefined {
  const key = (cabId ?? "").trim().toUpperCase();
  if (!key || looksLikeUuid(key)) return undefined;
  return cabById.get(key);
}

export function findRosterDriver(input: {
  phone?: string | null;
  name?: string | null;
  salaryNumber?: string | null;
}): PetrolineDriver | undefined {
  const salary = humanCode(input.salaryNumber);
  if (salary) {
    const hit = driverBySalary.get(salary.toUpperCase());
    if (hit) return hit;
  }
  const phone = normalizePhone(input.phone);
  if (phone) {
    const hit = driverByPhone.get(phone);
    if (hit) return hit;
  }
  const name = normalizePersonName(input.name);
  if (name) {
    const hit = driverByName.get(name);
    if (hit) return hit;
  }
  return undefined;
}

export function rosterBodiesAsTails(): TruckTail[] {
  return PETROLINE_BODIES.map((b: PetrolineBody) => ({
    id: b.bodyId,
    number: b.bodyId,
    registration: b.plate || b.bodyId,
    type: b.type || "Trailer",
    status: "Available" as const,
    location: b.destination || "Depot",
    lat: 6.5244,
    lng: 3.3792,
  }));
}

/** Cap / NEW CAB code for a truck head (never UUID). */
export function displayHeadCap(head?: TruckHead | null, fallbackId?: string | null): string {
  if (!head && !fallbackId) return "";
  const plate = head?.registration;
  const roster =
    findRosterCabByPlate(plate) ||
    findRosterCabById(head?.capNumber) ||
    findRosterCabById(head?.number) ||
    findRosterCabById(fallbackId);
  // Last resort: derive cap from the plate alone so an unmatched head object
  // can never blank the Cap column ("where is the Cap?" bug).
  return (
    humanCode(head?.capNumber, head?.number, roster?.cabId, fallbackId) ||
    roster?.cabId ||
    ""
  );
}

/** Dropdown label: `P002 (KSF 72 YF)`. */
export function displayHeadOption(head: TruckHead): string {
  const cap = displayHeadCap(head);
  const plate = head.registration?.trim();
  if (cap && plate) return `${cap} (${plate})`;
  if (cap) return cap;
  if (plate) return plate;
  return "Unknown head";
}

/** Salary / staff code for a driver (never UUID). */
export function displayDriverSalary(driver?: Driver | null, fallbackId?: string | null): string {
  if (!driver && !fallbackId) return "";
  const roster = findRosterDriver({
    phone: driver?.phone ?? null,
    name: driver?.name ?? null,
    salaryNumber: driver?.salaryNumber ?? driver?.employeeId ?? null,
  });
  return humanCode(driver?.salaryNumber, driver?.employeeId, roster?.salaryNumber, fallbackId);
}

export function displayDriverOption(driver: Driver): string {
  const salary = displayDriverSalary(driver);
  return salary || driver.name || "Unknown driver";
}

export function displayDriverAssigned(driver?: Driver | null, nameFallback?: string | null): string {
  const name = (nameFallback || driver?.name || "").trim();
  const salary = displayDriverSalary(driver);
  if (name && salary) return `${name} (${salary})`;
  return name || salary || "";
}

export function displayTailOption(tail: TruckTail): string {
  const code = humanCode(tail.number, tail.id);
  const plate = humanCode(tail.registration);
  if (code && plate && plate !== code) return `${code} (${plate})`;
  return code || plate || "Unknown tail";
}

/** `a · b · c`, skipping anything blank — the one join every spec below uses. */
function specJoin(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" · ");
}

/**
 * What a truck TAIL actually is: its BODY first — Full Sided, Semi Sided,
 * Flatbed Tail… — then whether it is free and where it is standing.
 *
 * Choosing a tail by its code alone ("B010") told the operator nothing about the
 * body they were hitching to the truck, so a request for a full-sided body could
 * be dispatched with a flatbed and nobody saw it until the cargo was loaded.
 */
export function truckTailSpec(tail?: TruckTail | null): string {
  if (!tail) return "";
  return specJoin([tail.type, tail.status, tail.location]);
}

/**
 * What a truck HEAD actually is: its category (UPCOUNTRY, …) and where it stands.
 * The heads carry no body of their own — the body lives on the tail — so this is
 * the head's own detail rather than the cargo-fitting one.
 */
export function truckHeadSpec(head?: TruckHead | null): string {
  if (!head) return "";
  return specJoin([
    head.make && head.make !== "Unknown" ? head.make : "",
    head.status,
    head.location,
  ]);
}

/** Dropdown label where a truck is PICKED: `B010 · Flatbed Tail`. */
export function truckTailChoice(tail: TruckTail): string {
  const body = tail.type?.trim();
  const code = displayTailOption(tail);
  return body && body !== code ? `${code} · ${body}` : code;
}

/** Dropdown label where a head is PICKED: `P017 (GRR171XA) · UPCOUNTRY`. */
export function truckHeadChoice(head: TruckHead): string {
  const category = head.make?.trim();
  const code = displayHeadOption(head);
  return category && category !== "Unknown" && category !== code ? `${code} · ${category}` : code;
}

/**
 * The truck type a transport REQUEST was made for — distinct from `tailType`,
 * which is the tail Fleet Ops actually assigned ("Flatbed Tail").
 *
 * Rows created before `requestedTruckType` existed stored the request in
 * `tailType`; those still match a request option, so accept them as fallback and
 * return "" once the assignment overwrote the value.
 */
export function displayRequestedTruckType(trip: {
  requestedTruckType?: string | null;
  tailType?: string | null;
}): string {
  const requested = (trip.requestedTruckType || "").trim();
  if (requested) return requested;
  const legacy = (trip.tailType || "").trim();
  return (PARTNER_TRUCK_TYPE_OPTIONS as readonly string[]).includes(legacy) ? legacy : "";
}

export function displayTicket(tripOrId: { id: string } | string): string {
  return displayRequestId(typeof tripOrId === "string" ? tripOrId : tripOrId.id);
}

/** Cap from trip + optional resolved head (never UUID). */
export function displayCapFromTrip(
  trip: { headId?: string | null; truckReg?: string | null },
  head?: TruckHead | null,
): string {
  if (head) return displayHeadCap(head, trip.headId);
  const plate = (trip.truckReg || "").split("/")[0]?.trim() ?? "";
  const roster = findRosterCabByPlate(plate) || findRosterCabById(trip.headId);
  // The plate→roster lookup is the whole point: truckReg is the only assignment
  // signal Fleet Ops' historical writes left behind, and it ALWAYS pairs with a
  // cap code in the roster (NEW CAB ↔ REG.).
  return humanCode(roster?.cabId, trip.headId) || roster?.cabId || "";
}

export function displayPlateFromTrip(
  trip: { truckReg?: string | null },
  head?: TruckHead | null,
): string {
  if (head?.registration?.trim()) return head.registration.trim();
  const plate = (trip.truckReg || "").split("/")[0]?.trim() ?? "";
  if (plate && !looksLikeUuid(plate)) return plate;
  return "";
}

/** Resolve plate → roster cab when API omitted cabId. */
export function enrichTruckHead(head: TruckHead): TruckHead {
  const roster = findRosterCabByPlate(head.registration) || findRosterCabById(head.capNumber) || findRosterCabById(head.number);
  const cap = humanCode(head.capNumber, head.number, roster?.cabId);
  const next: TruckHead = {
    ...head,
    number: cap || head.number,
    make: head.make && head.make !== "Unknown" ? head.make : roster?.category || head.make,
    location: head.location && head.location !== "Depot" ? head.location : roster?.destination || head.location,
  };
  if (cap) next.capNumber = cap;
  else if (head.capNumber) next.capNumber = head.capNumber;
  return next;
}

export function enrichDriver(driver: Driver): Driver {
  const roster = findRosterDriver({
    phone: driver.phone ?? null,
    name: driver.name ?? null,
    salaryNumber: driver.salaryNumber ?? driver.employeeId ?? null,
  });
  const salary = humanCode(driver.salaryNumber, driver.employeeId, roster?.salaryNumber);
  const next: Driver = {
    ...driver,
    employeeId: salary || (looksLikeUuid(driver.employeeId) ? "" : driver.employeeId) || driver.employeeId,
    name: driver.name?.trim() || roster?.name || driver.name,
    phone: driver.phone?.trim() || roster?.phone || driver.phone,
  };
  if (salary) next.salaryNumber = salary;
  else if (driver.salaryNumber) next.salaryNumber = driver.salaryNumber;
  return next;
}
