import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, LayoutDashboard, ListFilter, LogOut, MoreVertical, Search, Truck, X } from "lucide-react";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, tenantService, tripService } from "@/lib/fleetopsx/services";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";
import type { PlatformTenant, Trip, TripStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import { Route as RootRoute } from "./__root";

export const Route = createFileRoute("/workspace/customer-portal/_auth/dashboard")({
  component: PartnerPortalDashboard,
});

type PartnerUiStatus = "Pending" | "Declined" | "In transit" | "Completed";

function toPartnerStatus(status: TripStatus): PartnerUiStatus {
  switch (status) {
    case "Requested":
    case "Awaiting Approval":
      return "Pending";
    case "Stopped":
      return "Declined";
    case "Completed":
      return "Completed";
    case "Scheduled":
    case "En Route":
    case "Loaded":
    case "Offloading":
    case "Returning":
    case "Delayed":
      return "In transit";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function partnerStatusClass(status: PartnerUiStatus) {
  switch (status) {
    case "Pending":
      return "bg-[#FC0] text-white";
    case "Declined":
      return "bg-[#ED351D] text-white";
    case "In transit":
      return "bg-[#CB30E0] text-white";
    case "Completed":
      return "bg-[#34C759] text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatTripDate(value: string | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isPartnerTrip(trip: Trip, companyName: string | undefined) {
  if (trip.customer === "Customer Portal") return true;
  if (companyName && trip.customer === companyName) return true;
  return false;
}

function PartnerPortalDashboard() {
  const navigate = useNavigate();
  const { tenantLogo, tenantName } = RootRoute.useRouteContext();
  const currentUser = authService.getCurrentUser();
  const [requests, setRequests] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogout, setShowLogout] = useState(false);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<string | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"Ascending" | "Descending">("Ascending");
  const [tenant, setTenant] = useState<PlatformTenant | null>(null);

  const companyName = currentUser?.partnerCompanyName || currentUser?.name || "Partner";
  const userEmail = currentUser?.email || "";
  const userInitials = currentUser?.initials || "PT";
  const logoSrc = tenant?.logo || tenantLogo || "/figma/petroline-logo.png";

  const refresh = async () => {
    const allTrips = await tripService.list();
    setRequests(allTrips.filter((t) => isPartnerTrip(t, currentUser?.partnerCompanyName)));
  };

  useEffect(() => {
    void refresh()
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug && slug !== "localhost" && slug !== "fleetopsx") {
      void tenantService.getBySlug(slug).then(setTenant).catch(() => setTenant(null));
    }
  }, []);

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.customerConsignee && r.customerConsignee.toLowerCase().includes(q)) ||
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.dropoff && r.dropoff.toLowerCase().includes(q)) ||
          (r.cargo && r.cargo.toLowerCase().includes(q)),
      );
    }
    return [...result].sort((a, b) =>
      sortOrder === "Descending" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id),
    );
  }, [requests, searchQuery, sortOrder]);

  const totalRequests = requests.length;
  const inTransit = requests.filter((r) => toPartnerStatus(r.status) === "In transit").length;
  const pending = requests.filter((r) => toPartnerStatus(r.status) === "Pending").length;
  const declined = requests.filter((r) => toPartnerStatus(r.status) === "Declined").length;
  const completed = requests.filter((r) => toPartnerStatus(r.status) === "Completed").length;

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/workspace/customer-portal/login" });
  };

  const handleDelete = async () => {
    if (!deleteModalOpen) return;
    await tripService.delete(deleteModalOpen);
    setDeleteModalOpen(null);
    await refresh();
  };

  const statCards = [
    { label: "Total Requests", value: totalRequests },
    { label: "In transit", value: inTransit, hint: inTransit > 0 ? "Look out for your delivery" : undefined },
    { label: "Pending", value: pending },
    { label: "Declined", value: declined },
    { label: "Completed", value: completed },
  ] as const;

  return (
    <div className="flex min-h-screen w-full bg-[#F1F2F4]">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-[#1B2432] lg:flex">
        <Link to="/workspace/account-type" className="flex w-full items-end justify-end px-5 py-2">
          <img src={logoSrc} alt={tenant?.name || tenantName || "Petroline"} className="h-[60px] w-[107px] object-contain" />
        </Link>
        <nav className="flex flex-1 flex-col items-center py-5">
          <div className="flex w-[224px] flex-col gap-[5px]">
            <span className="text-[11.4px] uppercase tracking-[0.4px] text-white/70">Transport Request</span>
            <Link
              to="/workspace/customer-portal/dashboard"
              className="flex h-8 items-center gap-2 rounded bg-[#ED351D] p-2"
            >
              <LayoutDashboard className="size-4 text-white" strokeWidth={1.5} />
              <span className="text-[14px] tracking-[0.4px] text-white">Dashboard</span>
            </Link>
            <Link
              to="/workspace/customer-portal/request"
              className="flex h-8 items-center gap-2 rounded p-2 hover:bg-white/5"
            >
              <Truck className="size-4 text-white" strokeWidth={1.5} />
              <span className="text-[14px] tracking-[0.4px] text-white">New Request</span>
            </Link>
          </div>
        </nav>
        <div className="p-2">
          {showLogout && (
            <button
              type="button"
              onClick={handleLogout}
              className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded border border-[#ED351D] bg-[#ED351D]/10 text-[14px] font-medium text-[#ED351D]"
            >
              <LogOut className="size-3.5" />
              Log Out
            </button>
          )}
          <div className="flex h-12 items-center gap-2 rounded p-2">
            <div className="grid size-8 place-items-center rounded-md bg-[#F1F2F4] text-[14px] text-[#5C6470]">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-white">{companyName}</p>
              <p className="truncate text-[12px] text-[#5C6470]">{userEmail}</p>
            </div>
            <button type="button" onClick={() => setShowLogout((v) => !v)} className="p-0.5">
              <MoreVertical className="size-4 text-white/70" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex w-full flex-col bg-white px-5 pb-2.5 pt-5 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)]">
          <h1 className="text-[24px] font-medium leading-8 text-[#1B2432]">Partner Portal</h1>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Manage the lifecycle of every account within the company to maintain data integrity.
          </p>
        </header>

        <main className="flex flex-col gap-[30px] p-[30px] max-md:px-4 max-md:py-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[10px] bg-white p-[15px] shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]"
              >
                <p className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">{card.label}</p>
                <p className="mt-2.5 font-space-grotesk text-[36px] font-bold leading-9 text-[#1B2432]">{card.value}</p>
                {"hint" in card && card.hint ? (
                  <p className="mt-3.5 text-[10px] font-medium text-[#34C759]">{card.hint}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Recent Requests</h2>
              <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
                Track your transport requests and their current statuses
              </p>
            </div>
            <Link
              to="/workspace/customer-portal/request"
              className="flex h-10 w-full items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white sm:w-[235px]"
            >
              + New Request
            </Link>
          </div>

          <div className="flex max-w-[600px] items-center gap-5">
            <div className="flex h-10 flex-1 items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] bg-transparent px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
              <Search className="size-[22px] text-[#5C6470]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortModalOpen(true)}
              className="grid size-10 place-items-center rounded bg-[#ED351D]"
            >
              <ListFilter className="size-5 text-white" />
            </button>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-6 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_32px_rgba(12,12,13,0.1)]">
            {loading ? (
              <FigmaLoadingState label="Loading requests…" />
            ) : filteredRequests.length === 0 ? (
              <FigmaEmptyState
                title={searchQuery ? "No matching requests" : "No transport requests yet"}
                body="Submit a new request — live trips from the API will list here."
              />
            ) : (
              <div className="w-full overflow-x-auto">
                <div className="mb-2 flex min-w-[1000px] gap-[30px] border-b border-[#E2E5E9] py-2.5 text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  <span className="w-[81px]">ID No.</span>
                  <span className="w-[167px]">Date</span>
                  <span className="w-[219px]">Consignee</span>
                  <span className="w-[150px]">Product</span>
                  <span className="w-[119px]">Truck Type</span>
                  <span className="w-[158px]">Destination</span>
                  <span className="w-[120px]">Status</span>
                </div>
                {filteredRequests.map((r) => {
                  const uiStatus = toPartnerStatus(r.status);
                  return (
                    <div
                      key={r.id}
                      className="flex min-w-[1000px] cursor-pointer items-center gap-[30px] border-b border-[#E2E5E9] py-2.5 last:border-0"
                      onClick={() =>
                        navigate({ to: "/workspace/customer-portal/$requestId", params: { requestId: r.id } })
                      }
                    >
                      <span className="w-[81px] text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{r.id}</span>
                      <span className="w-[167px] text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {formatTripDate(r.scheduledDate)}
                      </span>
                      <span className="w-[219px] truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.customerConsignee || "—"}
                      </span>
                      <span className="w-[150px] truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.cargo || "—"}
                      </span>
                      <span className="w-[119px] truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.tailType || "—"}
                      </span>
                      <span className="w-[158px] truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.dropoff || "—"}
                      </span>
                      <div className="flex w-[120px] items-center justify-between gap-2">
                        <span
                          className={cn(
                            "inline-flex h-[22px] min-w-[68px] items-center justify-center rounded px-3 text-[10px] font-medium text-white",
                            partnerStatusClass(uiStatus),
                          )}
                        >
                          {uiStatus}
                        </span>
                        <div className="relative">
                          <button
                            type="button"
                            className="p-0.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRowMenuOpen(rowMenuOpen === r.id ? null : r.id);
                            }}
                          >
                            <MoreVertical className="size-5 text-[#5C6470]" />
                          </button>
                          {rowMenuOpen === r.id && (
                            <div className="absolute right-0 top-7 z-10 w-[160px] rounded-[10px] border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_24px_rgba(0,0,0,0.08)]">
                              <button
                                type="button"
                                className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#1B2432] hover:bg-[#F1F2F4]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRowMenuOpen(null);
                                  navigate({
                                    to: "/workspace/customer-portal/$requestId",
                                    params: { requestId: r.id },
                                  });
                                }}
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#ED351D] hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRowMenuOpen(null);
                                  setDeleteModalOpen(r.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {sortModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[400px] rounded-lg bg-white p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#1B2432]">Sort Requests</h3>
              <button type="button" onClick={() => setSortModalOpen(false)}>
                <X className="size-5 text-[#5C6470]" />
              </button>
            </div>
            <div className="space-y-4">
              {(["Ascending", "Descending"] as const).map((order) => (
                <button
                  key={order}
                  type="button"
                  className={cn(
                    "w-full rounded border p-4 text-left text-[14px] font-semibold",
                    sortOrder === order ? "border-[#ED351D] bg-[#ED351D]/5" : "border-[#E2E5E9]",
                  )}
                  onClick={() => {
                    setSortOrder(order);
                    setSortModalOpen(false);
                  }}
                >
                  {order === "Ascending" ? "Ascending (Oldest First)" : "Descending (Newest First)"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-[420px] flex-col items-center rounded-lg bg-white p-8 text-center">
            <AlertCircle className="mb-6 size-12 text-[#ED351D]" strokeWidth={1.5} />
            <p className="mb-8 max-w-[240px] text-[15px] font-medium text-[#5C6470]">
              Are you sure you want to delete this request?
            </p>
            <div className="flex w-full justify-center gap-4">
              <button type="button" onClick={() => setDeleteModalOpen(null)} className="h-10 px-6 text-[14px] font-medium text-[#ED351D]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="h-10 rounded bg-[#ED351D] px-6 text-[14px] font-medium text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
