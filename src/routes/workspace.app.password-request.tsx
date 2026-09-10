import { createFileRoute } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminService } from "@/lib/fleetopsx/services";
import type { User } from "@/lib/fleetopsx/types";

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

function AdminPasswordRequest() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [requests, setRequests] = useState<PasswordRequest[]>([]);

  useEffect(() => {
    void adminService.users().then((users: User[]) => {
      const statuses: RequestStatus[] = ["Pending", "Approved", "Declined", "Approved"];
      const reqs = users.slice(0, Math.max(4, users.filter((u) => u.passwordResetRequired).length)).map((u, i) => ({
        id: `PWR-${String(i + 1).padStart(3, "0")}`,
        userId: u.id,
        name: u.name,
        department: u.department || "Fleet Operation",
        staffId: `ID:${u.id}`,
        username: u.username || u.name.split(" ").map((p) => p[0]).join("."),
        date: "31st Aug 2026",
        status: (u.passwordResetRequired ? "Pending" : statuses[i % statuses.length]) as RequestStatus,
      }));
      setRequests(reqs);
    });
  }, []);

  const handleAction = (id: string, action: "Approved" | "Declined") => {
    setActiveMenu(null);
    const req = requests.find((r) => r.id === id);
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: action } : r)));
    if (action === "Approved" && req) {
      void adminService.resetPassword(req.userId);
      toast.success(`Password reset approved for ${req.name}.`);
    } else if (action === "Declined" && req) {
      toast.warning(`Password reset declined for ${req.name}.`);
    }
  };

  return (
    <>
      {/* Figma 134:4394 */}
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Manage Password Request</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            approve or decline password requests
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {requests.map((req) => (
            <div
              key={req.id}
              className="relative flex flex-wrap items-center gap-4 rounded-[10px] bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.15),0px_1px_2px_rgba(0,0,0,0.3)] md:flex-nowrap md:gap-10"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-2 text-[14px] font-normal capitalize tracking-[0.4px] text-[#5C6470]">
                <span className="w-[140px] shrink-0 leading-5 md:w-[167px]">{req.name}</span>
                <span className="w-[140px] shrink-0 leading-5 md:w-[219px]">{req.department}</span>
                <span className="w-[120px] shrink-0 leading-5 md:w-[179px]">{req.staffId}</span>
                <span className="w-[100px] shrink-0 leading-5 md:w-[167px]">{req.username}</span>
                <span className="w-[120px] shrink-0 leading-5 md:w-[140px]">{req.date}</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  className="grid size-5 place-items-center"
                  onClick={() => setActiveMenu((id) => (id === req.id ? null : req.id))}
                >
                  <MoreVertical className="size-5 text-[#1B2432]" />
                </button>
                <span
                  className={`flex h-[22px] w-[68px] items-center justify-center rounded px-3 text-[10px] font-medium text-white ${statusClass(req.status)}`}
                >
                  {req.status}
                </span>
              </div>
              {activeMenu === req.id && req.status === "Pending" && (
                <div className="absolute top-14 right-5 z-40 w-[150px] rounded border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
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
      {activeMenu && <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)} />}
    </>
  );
}
