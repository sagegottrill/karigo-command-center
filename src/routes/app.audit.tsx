import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { AUDIT_LOGS } from "@/lib/karigo/mock-data";
import type { AuditLog } from "@/lib/karigo/types";

export const Route = createFileRoute("/app/audit")({
  head: () => ({
    meta: [
      { title: "Audit Logs | Karigo" },
      { name: "description", content: "Immutable record of who changed what, when and from which device across every Karigo module." },
      { property: "og:title", content: "Audit Logs | Karigo" },
      { property: "og:description", content: "Immutable record of every operational action across Karigo modules." },
    ],
  }),
  component: AuditPage,
});

const columns: Column<AuditLog>[] = [
  { key: "ts", header: "Timestamp", sortValue: (r) => r.timestamp, cell: (r) => <span className="num text-muted-foreground">{r.timestamp}</span> },
  { key: "user", header: "User", sortValue: (r) => r.user, cell: (r) => r.user },
  { key: "module", header: "Module", sortValue: (r) => r.module, cell: (r) => r.module },
  { key: "action", header: "Action", sortValue: (r) => r.action, cell: (r) => <span className="font-medium">{r.action}</span> },
  { key: "record", header: "Record", cell: (r) => <span className="num font-semibold text-foreground">{r.record}</span> },
  { key: "device", header: "IP / Device", align: "right", cell: (r) => <span className="num text-muted-foreground">{r.ip} · {r.device}</span> },
];

function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Historical, read-only accountability trail. Records cannot be edited or deleted."
      />
      <SectionPanel title="System Audit Trail" description={`${AUDIT_LOGS.length} records`} bodyClassName="p-0">
        <DataTable rows={AUDIT_LOGS} columns={columns} pageSize={14} searchKeys={(r) => `${r.user} ${r.module} ${r.action} ${r.record}`} />
      </SectionPanel>
    </>
  );
}
