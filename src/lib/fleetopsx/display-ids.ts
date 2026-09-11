/**
 * Production display helpers — never surface raw API UUIDs for caps, salary, tickets, or tails.
 */
import {
  PETROLINE_BODIES,
  PETROLINE_CABS,
  PETROLINE_DRIVERS,
  type PetrolineBody,
  type PetrolineCab,
  type PetrolineDriver,
} from "./petroline-roster";
import type { Driver, TruckHead, TruckTail } from "./types";
import { displayRequestId } from "./request-id";

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
  return humanCode(head?.capNumber, head?.number, roster?.cabId, fallbackId);
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
  return humanCode(roster?.cabId, trip.headId);
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
  if (roster?.cabId && !driver.assignedTruck) next.assignedTruck = roster.cabId;
  return next;
}
