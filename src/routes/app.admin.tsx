import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ROLES, TENANT, USERS } from "@/lib/fleetopsx/mock-data";
import type { User } from "@/lib/fleetopsx/types";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin")({
  head: () => ({
    meta: [
      { title: "Administration | FleetOpsX" },
      { name: "description", content: "Organisation profile, users, roles, permissions and system configuration for the FleetOpsX workspace." },
      { property: "og:title", content: "Administration | FleetOpsX" },
      { property: "og:description", content: "Organisation, users, roles and system configuration." },
    ],
  }),
  component: AdminPage,
});

const userColumns: Column<User>[] = [
  { key: "name", header: "User", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "email", header: "Email", cell: (r) => <span className="text-muted-foreground">{r.email}</span> },
  { key: "role", header: "Role", sortValue: (r) => r.roleName, cell: (r) => r.roleName },
  { key: "dept", header: "Department", cell: (r) => r.department },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  { key: "last", header: "Last active", align: "right", cell: (r) => <span className="num text-muted-foreground">{r.lastActive}</span> },
];

function AdminPage() {
  return (
    <>
      <PageHeader
        title="Administration"
        description="Tenant configuration, access control and operational thresholds."
        meta={<span className="num text-[11px] text-muted-foreground">Workspace {TENANT.workspaceId}</span>}
      />

      <Tabs defaultValue="org">
        <TabsList className="h-9">
          {([["org", "Organization"], ["users", "Users"], ["roles", "Roles & Permissions"], ["config", "System Configuration"]] as const).map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="text-xs">{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="org" className="mt-4 grid gap-5 lg:grid-cols-2">
          <SectionPanel title="Company Profile" bodyClassName="pt-1">
            <FieldRow label="Legal name" value={TENANT.name} />
            <FieldRow label="Workspace ID" value={TENANT.workspaceId} />
            <FieldRow label="Industry" value={TENANT.industry} />
            <FieldRow label="Country" value={TENANT.country} />
            <FieldRow label="Contact email" value={TENANT.contactEmail} />
            <FieldRow label="Contact phone" value={TENANT.contactPhone} />
          </SectionPanel>
          <SectionPanel title="Operating Locations" bodyClassName="space-y-2">
            {TENANT.locations.map((l) => (
              <div key={l} className="flex items-center justify-between rounded-[14px] border border-black/[0.05] bg-white px-3 py-2 text-[12px]">
                <span>{l}</span><StatusBadge status="Active" />
              </div>
            ))}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <SectionPanel title="User Management" description={`${USERS.length} users`} bodyClassName="p-0">
            <DataTable rows={USERS} columns={userColumns} pageSize={10} searchKeys={(r) => `${r.name} ${r.email} ${r.roleName}`} />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="roles" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.key} className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.035)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <span className="num text-[11px] text-muted-foreground">{r.users} users</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.modules.map((m) => <StatusBadge key={m} status={m} dot={false} tone="neutral" />)}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="config" className="mt-4 grid gap-5 lg:grid-cols-2">
          <SectionPanel title="Operational Thresholds" bodyClassName="space-y-3">
            {([["Standard fuel rate (₦/L)", "1,195"], ["Standard efficiency (Km/L)", "3.2"], ["Approval threshold — Level 2 (₦)", "250,000"], ["Approval threshold — Level 3 (₦)", "750,000"], ["Trip delay tolerance (mins)", "45"]] as const).map(([l, v]) => (
              <div key={l} className="space-y-1.5">
                <Label className="text-xs">{l}</Label>
                <Input defaultValue={v} className="num h-8 text-xs" />
              </div>
            ))}
            <Button size="sm" className="h-8 text-xs" onClick={() => toast.success("System configuration saved")}>Save configuration</Button>
          </SectionPanel>
          <SectionPanel title="Notification Settings" bodyClassName="space-y-2">
            {["Critical defect alerts", "Expense approval escalations", "Licence expiry warnings", "Gate movement digests", "Sync failure alerts"].map((n) => (
              <div key={n} className="flex items-center justify-between rounded-[14px] border border-black/[0.05] bg-white px-3 py-2 text-[12px]">
                <span>{n}</span><StatusBadge status="Active" />
              </div>
            ))}
          </SectionPanel>
        </TabsContent>
      </Tabs>
    </>
  );
}
