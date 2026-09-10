/**
 * Live API mappers + calls.
 * Contract expected from Hetzner backend (extend as endpoints land).
 */
import { api, allowMockFallback, setToken, clearSession, setStoredUser } from "./apiClient";
import type { Driver, Trip, TruckHead, User } from "./types";

export type LoginResponse = {
  token: string;
  user: User & { roles?: string[] };
};

export function mapTruckHead(t: Record<string, unknown>): TruckHead {
  const statusRaw = String(t.status ?? "Available");
  const status: TruckHead["status"] =
    statusRaw === "Active" || statusRaw === "Available"
      ? "Available"
      : statusRaw === "Assigned" ||
          statusRaw === "In Transit" ||
          statusRaw === "Maintenance" ||
          statusRaw === "Out of Service"
        ? statusRaw
        : "Out of Service";

  return {
    id: String(t.id ?? t.cabId ?? ""),
    number: String(t.cabId ?? t.number ?? t.id ?? ""),
    capNumber: t.capNumber ? String(t.capNumber) : undefined,
    registration: String(t.registration ?? ""),
    make: String(t.category ?? t.make ?? "Unknown"),
    year: Number(t.year ?? 2024),
    status,
    location: String(t.destination ?? t.location ?? "Depot"),
    odometer: Number(t.odometer ?? 0),
    standardEfficiency: Number(t.standardEfficiency ?? 0),
    lat: Number(t.lat ?? 6.5244),
    lng: Number(t.lng ?? 3.3792),
  };
}

export function mapDriver(d: Record<string, unknown>): Driver {
  const name = String(d.name ?? "");
  return {
    id: String(d.id ?? d.employeeId ?? d.staffId ?? ""),
    name,
    employeeId: String(d.employeeId ?? d.staffId ?? d.id ?? ""),
    salaryNumber: d.salaryNumber ? String(d.salaryNumber) : undefined,
    phone: String(d.phone ?? ""),
    department: String(d.department ?? "Transport Operations"),
    dateJoined: String(d.dateJoined ?? ""),
    licenseNumber: String(d.licenseNumber ?? d.license ?? ""),
    licenseCategory: String(d.licenseCategory ?? d.category ?? "Professional"),
    licenseExpiry: String(d.licenseExpiry ?? ""),
    compliance: (d.compliance as Driver["compliance"]) || "Valid",
    experienceYears: Number(d.experienceYears ?? 0),
    status: (d.status as Driver["status"]) || "Available",
    assignedTruck: d.assignedTruck ? String(d.assignedTruck) : null,
    currentTripId: d.currentTripId ? String(d.currentTripId) : null,
    tripsCompleted: Number(d.tripsCompleted ?? 0),
    safetyScore: Number(d.safetyScore ?? 100),
    initials:
      name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "—",
  };
}

export async function liveLogin(username: string, password: string): Promise<LoginResponse> {
  const body = { email: username, username, password };
  // Prefer /auth/login; some stacks use /login
  try {
    return await api.post<LoginResponse>("/auth/login", body);
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : 0;
    if (status === 404) {
      return await api.post<LoginResponse>("/login", body);
    }
    throw err;
  }
}

export async function liveListTrucks(): Promise<TruckHead[]> {
  const raw = await api.get<unknown>("/trucks");
  const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data;
  if (!Array.isArray(list)) return [];
  return list.map((t) => mapTruckHead(t as Record<string, unknown>));
}

export async function liveCreateTruck(body: Record<string, unknown>): Promise<TruckHead> {
  const raw = await api.post<Record<string, unknown>>("/trucks", body);
  return mapTruckHead(raw);
}

export async function liveUpdateTruck(id: string, body: Record<string, unknown>): Promise<void> {
  await api.patch(`/trucks/${id}`, body);
}

export async function liveDeleteTruck(id: string): Promise<void> {
  await api.delete(`/trucks/${id}`);
}

export async function liveListDrivers(): Promise<Driver[]> {
  const raw = await api.get<unknown>("/drivers");
  const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data;
  if (!Array.isArray(list)) return [];
  return list.map((d) => mapDriver(d as Record<string, unknown>));
}

export async function liveCreateDriver(body: Record<string, unknown>): Promise<Driver> {
  const raw = await api.post<Record<string, unknown>>("/drivers", body);
  return mapDriver(raw);
}

export async function liveUpdateDriver(id: string, body: Record<string, unknown>): Promise<void> {
  await api.patch(`/drivers/${id}`, body);
}

export async function liveDeleteDriver(id: string): Promise<void> {
  await api.delete(`/drivers/${id}`);
}

export async function liveListTrips(): Promise<Trip[]> {
  const raw = await api.get<unknown>("/trips");
  const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data;
  if (!Array.isArray(list)) return [];
  return list as Trip[];
}

export async function liveGetTrip(id: string): Promise<Trip | null> {
  try {
    return await api.get<Trip>(`/trips/${id}`);
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : 0;
    if (status === 404) return null;
    throw err;
  }
}

export async function liveCreateTrip(body: Partial<Trip>): Promise<Trip> {
  return await api.post<Trip>("/trips", body);
}

export async function liveUpdateTrip(id: string, body: Partial<Trip>): Promise<Trip | void> {
  return await api.patch<Trip>(`/trips/${id}`, body);
}

export async function liveDeleteTrip(id: string): Promise<void> {
  await api.delete(`/trips/${id}`);
}

export function applyLoginSession(token: string, user: User & { roles?: string[] }) {
  setToken(token);
  setStoredUser(user);
  if (typeof window === "undefined") return;
  localStorage.setItem("fleetopsx_user_id", user.id);
  localStorage.setItem("fleetopsx_roles", JSON.stringify(user.roles ?? []));
}

export function logoutLive() {
  clearSession();
}

export { allowMockFallback };
