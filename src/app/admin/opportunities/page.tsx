import Link from "next/link";

import { Denied, Table } from "@/components/admin/denied";
import { SampleBadge } from "@/components/opportunity/opportunity-card";
import { Badge, buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { can } from "@/server/domain/permissions";
import { listOpportunitiesAdmin } from "@/server/services/admin";

export const metadata = { title: "Opportunities" };
const STATUSES = ["draft", "imported", "in_review", "approved", "published", "paused", "closed", "expired", "rejected", "suspended"];
const TONE: Record<string, "neutral" | "purple" | "success" | "warning" | "danger"> = { published: "success", in_review: "warning", approved: "purple", rejected: "danger", suspended: "danger" };

export default async function AdminOpportunities({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await adminGate("opportunity.review");
  if (!s) return <Denied />;
  const { status } = await searchParams;
  const filter = status && STATUSES.includes(status) ? status : undefined;
  const rows = await listOpportunitiesAdmin(await getDb(), filter);
  return (
    <div className="space-y-4">
      <PageHeader title="Opportunities" description="Draft → review → approve → publish. Nothing is published without a person approving it." actions={can(s.roles, "opportunity.create") ? <Link href="/admin/opportunities/new" className={buttonClass("primary", "sm")}>New opportunity</Link> : undefined} />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        <Link href="/admin/opportunities" className={buttonClass(filter ? "ghost" : "secondary", "sm")}>All</Link>
        {STATUSES.map((st) => <Link key={st} href={`/admin/opportunities?status=${st}`} className={buttonClass(filter === st ? "secondary" : "ghost", "sm")}>{st.replace("_", " ")}</Link>)}
      </nav>
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No opportunities with this status" />
      ) : (
        <Table head={["Title", "Organization", "Category", "Status", "Deadline", "Updated"]} caption="Opportunities">
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3"><Link href={`/admin/opportunities/${o.id}`} className="font-medium text-navy hover:underline">{o.title}</Link> {o.isSample && <SampleBadge />}</td>
              <td className="px-4 py-3 text-muted">{o.organizationName}</td>
              <td className="px-4 py-3">{o.category}</td>
              <td className="px-4 py-3"><Badge tone={TONE[o.status] ?? "neutral"}>{o.status.replace("_", " ")}</Badge></td>
              <td className="px-4 py-3 text-muted">{o.deadline?.toLocaleDateString("en-IN") ?? "—"}</td>
              <td className="px-4 py-3 text-muted">{o.updatedAt.toLocaleDateString("en-IN")}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
