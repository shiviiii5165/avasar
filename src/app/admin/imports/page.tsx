import Link from "next/link";

import { importAction } from "@/app/actions/admin";
import { Denied, Table } from "@/components/admin/denied";
import { ActionForm, Select, Textarea } from "@/components/forms/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listSources, recentImportIssues, reviewQueue } from "@/server/services/admin";

export const metadata = { title: "Import Review" };

const EXAMPLE = `[
  {
    "title": "Junior Data Analyst",
    "organization": "Example Org",
    "category": "job",
    "description": "At least forty characters describing the role and what the person will do.",
    "location": "Hyderabad",
    "workMode": "hybrid",
    "applyUrl": "https://example.org/careers/123",
    "sourceUrl": "https://example.org/careers",
    "deadline": "2026-12-31",
    "skills": ["SQL", "Excel"]
  }
]`;

export default async function ImportsPage() {
  if (!(await adminGate("import.review"))) return <Denied />;
  const db = await getDb();
  const [sources, issues, queue] = await Promise.all([listSources(db), recentImportIssues(db), reviewQueue(db)]);
  const imported = queue.filter((o) => o.importedAt);
  return (
    <div className="space-y-6">
      <PageHeader title="Import Review" description="Imported → normalized → deduplicated → validated → review queue. Valid items arrive as listings in review; a person must approve and publish each one." />
      <Card>
        <h2 className="mb-4 font-semibold text-navy">Import a batch</h2>
        <ActionForm action={importAction} submitLabel="Import into review queue">
          <Select name="sourceId" label="Approved source" required defaultValue="">
            <option value="" disabled>Choose a source</option>
            {sources.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Textarea name="payload" label="Items (JSON array)" required rows={10} placeholder={EXAMPLE} className="font-mono" />
        </ActionForm>
      </Card>

      <Card>
        <h2 className="font-semibold text-navy">Imported listings awaiting review ({imported.length})</h2>
        <ul className="mt-3 divide-y divide-line">
          {imported.map((o) => <li key={o.id} className="flex justify-between py-2 text-sm"><Link href={`/admin/opportunities/${o.id}`} className="font-medium text-navy hover:underline">{o.title}</Link><span className="text-muted">{o.sourceProvider} · {o.status.replace("_", " ")}</span></li>)}
          {!imported.length && <li className="py-2 text-sm text-muted">Nothing waiting.</li>}
        </ul>
      </Card>

      <section>
        <h2 className="mb-3 font-semibold text-navy">Rejected by validation or deduplication</h2>
        <Table head={["Item", "Status", "Issues", "When"]} caption="Import issues">
          {issues.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3">{String((r.normalized as { title?: string } | null)?.title ?? (r.rawPayload as { title?: string })?.title ?? "(unreadable)")}</td>
              <td className="px-4 py-3"><Badge tone={r.status === "duplicate" ? "warning" : "danger"}>{r.status}</Badge></td>
              <td className="px-4 py-3 text-xs text-muted">{r.issues.join("; ")}</td>
              <td className="px-4 py-3 text-muted">{r.createdAt.toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
