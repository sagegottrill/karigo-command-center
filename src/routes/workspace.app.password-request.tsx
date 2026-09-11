import { createFileRoute } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { humanCode } from "@/lib/fleetopsx/display-ids";
import { adminService } from "@/lib/fleetopsx/services";
import type { User } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/password-request")({
  component: AdminPasswordRequest,
});

type RequestStatus = "Pending" | "Approved" | "Declined";

interface PasswordRequest {
  id: string;
  userId: string;
  name: string;
  department: string;
  staffId: string;
  username: string;
  date: string;
  status: RequestStatus;
}

function statusClass(status: RequestStatus) {
  switch (status) {
    case "Pending":
      return "bg-[rgba(249,158,31,0.8)]";
    case "Approved":
      return "bg-[#0ACF83]";
    case "Declined":
      return "bg-[#ED351D]";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function displayStaffId(user: User): string {
  const code = humanCode(user.id, user.username);
  return code ? `ID:${code}` : "ID:—";
}

function AdminPasswordRequest() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [requests, setRequests] = useState<PasswordRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void adminService
      .users()
      .then((users: User[]) => {
        const reqs = users
          .filter((u) => u.passwordResetRequired && u.status !== "Deleted")
          .map((u) => ({
            id: `PWR-${u.id}`,
            userId: u.id,
            name: u.name,
            department: u.department || "Fleet Operation",
            staffId: displayStaffId(u),
            username: u.username || u.name.split(" ").map((p) => p[0]).join("."),
            date: u.lastActive || "",
            status: "Pending" as RequestStatus,
          }));
        setRequests(reqs);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load password requests"))
      .finally(() => setLoading(false));
  }, []);

  const handleAction = (id: string, action: "Approved" | "Declined") => {
    setActiveMenu(null);
    const req = requests.find((r) => r.id === id);
    if (!req) return;

    if (action === "Approved") {
      void adminService
        .resetPassword(req.userId)
        .then((tempPassword) => {
          setRequests((prev) => prev.filter((r) => r.id !== id));
          toast.success(
            typeof tempPassword === "string" && tempPassword
              ? `Temporary password for ${req.name}: ${tempPassword}`
              : `Password reset approved for ${req.name}.`,
            { duration: 12_000 },
          );
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Password reset failed"));
      return;
    }

    // Decline is UI-only until the API supports canceling reset flags.
    setRequests((prev) => prev.filter((r) => r.id !== id));
    toast.message(`Dismissed password request for ${req.name}.`, {
      description: "Staff can request again if they still need a reset.",
    });
  };

  return (
    <>
      {/* Figma desktop rows `150:5144` · mobile cards `155:2549` */}
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[30px] md:p-[30px]">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[24px] md:font-medium md:leading-8">
            Manage Password Request
          </h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            approve or decline password requests
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {loading && <FigmaLoadingState label="Loading password requests…" />}
          {!loading && requests.length === 0 && (
            <FigmaEmptyState
              title="No password requests yet"
              body="Staff who require a password reset will list here from the live accounts API."
            />
          )}

          {requests.map((req) => (
            <div key={req.id} className="relative">
              {/* Mobile card — Figma Request-Card-mobile `155:2549` */}
              <div className="flex flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 md:hidden">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-[rgba(92,100,112,0.6)]">{req.date || "—"}</p>
                  <button
                    type="button"
                    className="grid size-5 place-items-center"
                    aria-label="Request options"
                    onClick={() => setActiveMenu((id) => (id === req.id ? null : req.id))}
                  >
                    <MoreVertical className="size-5 text-[#1B2432]" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[16px] font-semibold tracking-[0.4px] text-[#303D50]">{req.name}</p>
                  <span
                    className={cn(
                      "flex h-[18px] w-[68px] shrink-0 items-center justify-center rounded px-2.5 text-[10px] font-medium text-white",
                      statusClass(req.status),
                    )}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-[12px]">
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-[#5C6470]">Department:</span>
                    <span className="min-w-0 flex-1 text-[#344256]">{req.department}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-[#5C6470]">Staff ID:</span>
                    <span className="min-w-0 flex-1 font-semibold text-[#ED351D]">{req.staffId}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-[#5C6470]">Username:</span>
                    <span className="min-w-0 flex-1 text-[#344256]">{req.username}</span>
                  </div>
                </div>
              </div>

              {/* Desktop row — Figma Password Request `150:5144` */}
              <div className="relative hidden items-center gap-10 rounded-[10px] bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.15),0px_1px_2px_rgba(0,0,0,0.3)] md:flex">
                <div className="flex min-w-0 flex-1 items-center text-[14px] font-normal capitalize tracking-[0.4px] text-[#5C6470]">
                  <span className="w-[167px] shrink-0 leading-5">{req.name}</span>
                  <span className="w-[219px] shrink-0 leading-5">{req.department}</span>
                  <span className="w-[179px] shrink-0 leading-5">{req.staffId}</span>
                  <span className="w-[167px] shrink-0 leading-5">{req.username}</span>
                  <span className="w-[140px] shrink-0 leading-5">{req.date || "—"}</span>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    className="grid size-5 place-items-center"
                    aria-label="Request options"
                    onClick={() => setActiveMenu((id) => (id === req.id ? null : req.id))}
                  >
                    <MoreVertical className="size-5 text-[#1B2432]" />
                  </button>
                  <span
                    className={cn(
                      "flex h-[22px] w-[68px] items-center justify-center rounded px-3 text-[10px] font-medium text-white",
                      statusClass(req.status),
                    )}
                  >
                    {req.status}
                  </span>
                </div>
              </div>

              {activeMenu === req.id && req.status === "Pending" && (
                <div className="absolute right-3 top-10 z-40 w-[150px] rounded border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.1)] md:right-5 md:top-14">
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                    onClick={() => handleAction(req.id, "Approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-[14px] text-[#141A1F] hover:bg-[#F1F2F4]"
                    onClick={() => handleAction(req.id, "Declined")}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {activeMenu ? <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)} /> : null}
    </>
  );
}
