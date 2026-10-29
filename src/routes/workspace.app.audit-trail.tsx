import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ListFilter,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/fleetopsx/apiClient";
import { authService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { downloadCsvBlob } from "@/lib/fleetopsx/table-export";

/**
 * THE AUDIT TRAIL — the platform's own custody record.
 *
 * Everything that ever changed anything is written here by the server itself:
 * every POST/PATCH/PUT/DELETE across every module is recorded by the API's
 * audit middleware with the actor, the record, the device and the IP; the
 * self-heal sweeps record THEIR writes as "System · Server"; the sign-in
 * ledger records every accepted, failed, suspended and logged-out session.
 *
 * This page is the reading desk for that record. It never writes: the trail
 * must be the one part of the platform nobody (including an admin) can edit
 * from the web, so there is deliberately no add/edit/delete here — only
 * filters, facets, detail and export.
 */
export const Route = createFileRoute("/workspace/app/audit-trail")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Platform Admin", "HR"];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Audit Trail | FleetOpsX" },
      {
        name: "description",
        content:
          "Every change, every actor, every sign-in — the platform's full custody record, categorized and searchable.",
      },
    ],
  }),
  component: AuditTrailPage,
});

const inputClass =
  "h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]";
const selectClass = `${inputClass} appearance-none`;

interface AuditRow {
  id: string;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  record: string;
  device: string;
  ip: string;
}

interface AuditResponse {
  rows: AuditRow[];
  total: number;
  modules: { name: string; count: number }[];
  users: { name: string; count: number }[];
  limit: number;
  offset: number;
}

interface LoginRow {
  id: string;
  userId: string;
  name: string;
  role: string;
  timestamp: string;
  device: string;
  ip: string;
  status: string;
}

const PAGE = 300;

/** What an action means, in the language the trail's colours already speak. */
function actionTone(action: string): {
  label: string;
  cls: string;
} {
  const a = action.toLowerCase();
  if (a.includes("deleted") || a.includes("removed"))
    return { label: "Deleted", cls: "bg-[#FDECEA] text-[#B32312]" };
  if (a.includes("system") || a.startsWith("system"))
    return { label: "System", cls: "bg-[#EEF2F7] text-[#3D4B5C]" };
  if (a.includes("created") || a.includes("logged out"))
    return { label: "Created", cls: "bg-[#E8F7EE] text-[#0F7A38]" };
  if (a.includes("updated") || a.includes("freed") || a.includes("closed"))
    return { label: "Updated", cls: "bg-[#FFF6E5] text-[#8A5A00]" };
  return { label: "Action", cls: "bg-[#EEF2F7] text-[#3D4B5C]" };
}

function loginTone(status: string): { cls: string } {
  const s = status.toLowerCase();
  if (s === "failed") return { cls: "bg-[#FDECEA] text-[#B32312]" };
  if (s === "success") return { cls: "bg-[#E8F7EE] text-[#0F7A38]" };
  if (s === "logout") return { cls: "bg-[#FFF6E5] text-[#8A5A00]" };
  return { cls: "bg-[#EEF2F7] text-[#3D4B5C]" };
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "?";
  return (first + (parts[1]?.[0] ?? "")).toUpperCase();
}

function fmtTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActorCell({ name }: { name: string }) {
  const isSystem = /^system/i.test(name) || /^return self-heal/i.test(name);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={
          isSystem
            ? "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#EEF2F7] text-[10px] font-bold text-[#3D4B5C]"
            : "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1B2432] text-[10px] font-bold text-white"
        }
      >
        {isSystem ? "⚙" : initials(name)}
      </span>
      <span className="truncate text-[13px] font-medium text-[#1B2432]">{name || "Unknown"}</span>
    </div>
  );
}

function AuditTrailPage() {
  const [tab, setTab] = useState<"changes" | "signins">("changes");

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6">
      {/* Page head — the same calm custody-desk framing every admin page opens with */}
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="text-[20px] font-semibold tracking-[0.2px] text-[#1B2432]">Audit Trail</h1>
        <p className="text-[13px] text-[#5C6470]">
          Every change, every actor, every sign-in — recorded server-side, categorized, and
          searchable here. The trail itself is read-only by design.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-lg border border-[#E2E5E9] bg-white p-1">
        {(
          [
            ["changes", "Change Trail"],
            ["signins", "Sign-in Reports"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors " +
              (tab === key ? "bg-[#1B2432] text-white" : "text-[#5C6470] hover:text-[#1B2432]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "changes" ? <ChangeTrailTab /> : <SignInTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TAB 1 — the change trail                                            */
/* ------------------------------------------------------------------ */

const KINDS = [
  { value: "", label: "All actions" },
  { value: "Created", label: "Created" },
  { value: "Updated", label: "Updated" },
  { value: "Deleted", label: "Deleted" },
  { value: "Logged Out", label: "Logged Out" },
  { value: "System", label: "System (machine)" },
];

function ChangeTrailTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [modules, setModules] = useState<{ name: string; count: number }[]>([]);
  const [users, setUsers] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  // Filters — all of them are applied server-side, so the endpoint does the
  // work and the browser never holds more than a page of rows.
  const [q0, setQ0] = useState("");
  const [q, setQ] = useState(""); // debounced copy of the search text
  const [module, setModule] = useState("");
  const [user, setUser] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQ(q0), 350);
    return () => window.clearTimeout(t);
  }, [q0]);

  const load = useCallback(
    async (opts?: { append?: boolean }) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (module) params.set("module", module);
      if (user) params.set("user", user);
      if (kind) params.set("kind", kind);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(PAGE));
      params.set("offset", String(opts?.append ? rows.length : 0));
      setLoading(true);
      try {
        const res = await fetchApi<AuditResponse>(`/audit?${params.toString()}`);
        setRows((prev) => (opts?.append ? [...prev, ...(res.rows || [])] : res.rows || []));
        setTotal(res.total || 0);
        setModules(res.modules || []);
        setUsers(res.users || []);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the audit trail.");
        if (!opts?.append) setRows([]);
      } finally {
        setLoading(false);
      }
    },
    // rows.length is read for append mode; the eslint-known trade-off of the
    // append caller is fine because load() is rebuilt whenever filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, module, user, kind, from, to],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, module, user, kind, from, to]);

  useAutoRefresh(() => void load(), [load], { interval: 15_000, enabled: auto });

  const filtersActive = Boolean(q || module || user || kind || from || to);

  const exportCsv = () => {
    const header = ["Timestamp", "Actor", "Module", "Action", "Record", "Device", "IP Address"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) =>
      [r.timestamp, r.user, r.module, r.action, r.record, r.device, r.ip].map(esc).join(","),
    );
    const csv = [header.map(esc).join(","), ...body].join("\n");
    downloadCsvBlob(csv, "audit-trail");
  };

  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = rows.filter((r) => new Date(r.timestamp) >= today).length;
    const systemCount = rows.filter((r) => /^system/i.test(r.user)).length;
    return { shown: rows.length, total, todayCount, systemCount, moduleCount: modules.length };
  }, [rows, total, modules]);

  return (
    <div className="space-y-4">
      {/* Summary tiles — the custody desk's at-a-glance state */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Total entries", summary.total.toLocaleString()],
            ["On this page", summary.shown.toLocaleString()],
            ["Today's entries", summary.todayCount.toLocaleString()],
            ["System (machine) rows", summary.systemCount.toLocaleString()],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#E2E5E9] bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.6px] text-[#5C6470]">
              {label}
            </div>
            <div className="mt-1 text-[20px] font-semibold text-[#1B2432]">{value}</div>
          </div>
        ))}
      </div>

      {/* Filter toolbar */}
      <div className="rounded-lg border border-[#E2E5E9] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#1B2432]">Search everything</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6470]" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="record, action, person, module…"
                value={q0}
                onChange={(e) => setQ0(e.target.value)}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#1B2432]">Actor</span>
            <select className={selectClass} value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">Everyone (facets on the right show all)</option>
              {users.map((u) => (
                <option key={u.name} value={u.name}>
                  {u.name} ({u.count.toLocaleString()})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#1B2432]">Action type</span>
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#1B2432]">From</span>
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#1B2432]">To</span>
              <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>

        {/* Module chips — categorized exactly as the server records them, with live counts */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-[#5C6470]">Modules:</span>
          <button
            onClick={() => setModule("")}
            className={
              "rounded-full px-3 py-1 text-[12px] font-medium " +
              (module === "" ? "bg-[#1B2432] text-white" : "bg-[#F1F2F4] text-[#3D4B5C] hover:bg-[#E2E5E9]")
            }
          >
            All
          </button>
          {modules.map((m) => (
            <button
              key={m.name}
              onClick={() => setModule(module === m.name ? "" : m.name)}
              className={
                "rounded-full px-3 py-1 text-[12px] font-medium " +
                (module === m.name
                  ? "bg-[#1B2432] text-white"
                  : "bg-[#F1F2F4] text-[#3D4B5C] hover:bg-[#E2E5E9]")
              }
            >
              {m.name} · {m.count.toLocaleString()}
            </button>
          ))}
          {filtersActive && (
            <button
              onClick={() => {
                setQ0("");
                setModule("");
                setUser("");
                setKind("");
                setFrom("");
                setTo("");
              }}
              className="ml-1 text-[12px] font-semibold text-[#ED351D] hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white" data-export-card>
        <div className="flex items-center justify-between gap-2 border-b border-[#E2E5E9] px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#1B2432]">
            <ListFilter className="h-4 w-4" />
            Showing {rows.length.toLocaleString()} of {total.toLocaleString()} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuto((v) => !v)}
              className={
                "inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[12px] font-medium " +
                (auto
                  ? "border-[#0F7A38] text-[#0F7A38]"
                  : "border-[#E2E5E9] text-[#5C6470]")
              }
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {auto ? "Live (15s)" : "Paused"}
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded border border-[#E2E5E9] px-2.5 py-1.5 text-[12px] font-medium text-[#1B2432] hover:bg-[#F1F2F4]"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="px-4 py-14 text-center text-[13px] text-[#5C6470]">Opening the trail…</div>
        ) : error && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-[13px] text-[#B32312]">
            <CircleAlert className="h-4 w-4" />
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center text-[13px] text-[#5C6470]">
            No entries match these filters — widen the dates or clear a chip.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-[#E2E5E9] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Module</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Record</th>
                  <th className="px-4 py-2.5">Origin</th>
                  <th className="px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tone = actionTone(r.action);
                  const open = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : r.id)}
                        className="cursor-pointer border-b border-[#E2E5E9] align-top hover:bg-[#FAFBFC]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#5C6470]">
                          {fmtTime(r.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <ActorCell name={r.user} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full bg-[#F1F2F4] px-2.5 py-0.5 text-[12px] font-medium text-[#3D4B5C]">
                            {r.module || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${tone.cls}`}
                          >
                            {r.action || "—"}
                          </span>
                        </td>
                        <td className="max-w-[420px] px-4 py-3">
                          <div className={"text-[13px] text-[#1B2432] " + (open ? "" : "line-clamp-2")}>
                            {r.record || "—"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#5C6470]">
                          {r.device || "—"}
                          <div className="text-[11px] text-[#5C6470]/80">{r.ip || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-[#5C6470]">
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[#E2E5E9] bg-[#FAFBFC]">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              {(
                                [
                                  ["Entry ID", r.id],
                                  ["Full record", r.record],
                                  ["Device", r.device],
                                  ["IP address", r.ip],
                                ] as const
                              ).map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">
                                    {label}
                                  </div>
                                  <div className="mt-1 break-words text-[13px] text-[#1B2432]">
                                    {value || "—"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length < total ? (
          <div className="flex justify-center border-t border-[#E2E5E9] px-4 py-3">
            <button
              onClick={() => void load({ append: true })}
              disabled={loading}
              className="rounded border border-[#E2E5E9] px-4 py-2 text-[13px] font-medium text-[#1B2432] hover:bg-[#F1F2F4] disabled:opacity-50"
            >
              {loading ? "Loading…" : `Load older entries (${(total - rows.length).toLocaleString()} remaining)`}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-[#E2E5E9] bg-white px-4 py-3 text-[12px] text-[#5C6470]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0F7A38]" />
        <span>
          Rows written by the machine carry actor "System" and device "Server" — the auto-return
          sweep and duty-sync record themselves. Failed sign-ins are recorded in the Sign-in
          Reports tab. The trail cannot be edited or deleted from the web by design.
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TAB 2 — sign-in reports                                             */
/* ------------------------------------------------------------------ */

function SignInTab() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [q0, setQ0] = useState("");
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(q0), 350);
    return () => window.clearTimeout(t);
  }, [q0]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    setLoading(true);
    try {
      const res = await fetchApi<LoginRow[]>(`/login-reports?${params.toString()}`);
      setRows(Array.isArray(res) ? res : []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sign-in reports.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => void load(), [load], { interval: 30_000 });

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        String(r.name || "").toLowerCase().includes(needle) ||
        String(r.role || "").toLowerCase().includes(needle) ||
        String(r.ip || "").toLowerCase().includes(needle) ||
        String(r.status || "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const summary = useMemo(() => {
    const c = { total: rows.length, success: 0, failed: 0, logout: 0 };
    for (const r of rows) {
      const s = String(r.status || "").toLowerCase();
      if (s === "failed") c.failed++;
      else if (s === "logout") c.logout++;
      else c.success++;
    }
    return c;
  }, [rows]);

  const exportCsv = () => {
    const header = ["Timestamp", "Person", "Role", "Status", "Device", "IP Address"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = filtered.map((r) =>
      [r.timestamp, r.name, r.role, r.status, r.device, r.ip].map(esc).join(","),
    );
    const csv = [header.map(esc).join(","), ...body].join("\n");
    downloadCsvBlob(csv, "sign-in-reports");
  };

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["All sessions", summary.total.toLocaleString()],
            ["Signed in", summary.success.toLocaleString()],
            ["Failed / refused", summary.failed.toLocaleString()],
            ["Logged out", summary.logout.toLocaleString()],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#E2E5E9] bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.6px] text-[#5C6470]">
              {label}
            </div>
            <div className="mt-1 text-[20px] font-semibold text-[#1B2432]">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[#E2E5E9] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#1B2432]">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6470]" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="person, role, IP, status…"
                value={q0}
                onChange={(e) => setQ0(e.target.value)}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#1B2432]">Status</span>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
              <option value="Logout">Logout</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              onClick={exportCsv}
              className="inline-flex h-10 items-center gap-1.5 rounded border border-[#E2E5E9] px-3 text-[13px] font-medium text-[#1B2432] hover:bg-[#F1F2F4]"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white" data-export-card>
        {loading && rows.length === 0 ? (
          <div className="px-4 py-14 text-center text-[13px] text-[#5C6470]">Loading sessions…</div>
        ) : error && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-[13px] text-[#B32312]">
            <CircleAlert className="h-4 w-4" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-14 text-center text-[13px] text-[#5C6470]">
            No sign-in rows match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-[#E2E5E9] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Person</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Device</th>
                  <th className="px-4 py-2.5">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((r) => {
                  const tone = loginTone(r.status);
                  const open = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : r.id)}
                        className="cursor-pointer border-b border-[#E2E5E9] hover:bg-[#FAFBFC]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#5C6470]">
                          {fmtTime(r.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <ActorCell name={r.name} />
                        </td>
                        <td className="px-4 py-3 text-[13px] text-[#1B2432]">{r.role || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${tone.cls}`}
                          >
                            {r.status || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#5C6470]">{r.device || "—"}</td>
                        <td className="px-4 py-3 text-[12px] text-[#5C6470]">{r.ip || "—"}</td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[#E2E5E9] bg-[#FAFBFC]">
                          <td colSpan={6} className="px-4 py-3 text-[12px] text-[#5C6470]">
                            Session user id: <span className="font-medium text-[#1B2432]">{r.userId || "— (failed attempt)"}</span>
                            {" · "}Recorded: {fmtTime(r.timestamp)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <div className="border-t border-[#E2E5E9] px-4 py-3 text-center text-[12px] text-[#5C6470]">
                Showing the 200 most recent of {filtered.length} — export CSV for the full set.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
