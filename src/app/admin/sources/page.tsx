import { addSourceAction, toggleSourceAction } from "@/app/actions/admin";
import { Denied, Table } from "@/components/admin/denied";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listSources } from "@/server/services/admin";

export const metadata = { title: "Source Manager" };

export default async function SourcesPage() {
  if (!(await adminGate("source.manage"))) return <Denied />;
  const sources = await listSources(await getDb());
  return (
    <div className="space-y-6">
      <PageHeader title="Source Manager" description="Approved places listings come from. Record how each may be used; Avsar never scrapes against a site's terms, access restrictions or rate limits." />
      <Table head={["Source", "Kind", "Usage terms", "Imports", "Last import", "Status"]} caption="Opportunity sources">
        {sources.map((s) => (
          <tr key={s.id}>
            <td className="px-4 py-3 font-medium text-navy">{s.name}{s.url && <p className="text-xs text-muted">{s.url}</p>}</td>
            <td className="px-4 py-3">{s.kind}</td>
            <td className="max-w-xs px-4 py-3 text-xs text-muted">{s.termsNote}</td>
            <td className="px-4 py-3 text-xs">{Object.entries(s.imports).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</td>
            <td className="px-4 py-3 text-muted">{s.lastImportAt?.toLocaleString("en-IN") ?? "Never"}</td>
            <td className="px-4 py-3">
              <form action={toggleSourceAction.bind(null, s.id, !s.active)} className="flex items-center gap-2">
                <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Inactive"}</Badge>
                <button className={buttonClass("ghost", "sm")}>{s.active ? "Deactivate" : "Activate"}</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
      <Card className="max-w-2xl">
        <h2 className="mb-4 font-semibold text-navy">Add an approved source</h2>
        <ActionForm action={addSourceAction} submitLabel="Add source" resetOnSuccess>
          <Input name="name" label="Name" required />
          <Select name="kind" label="Kind" defaultValue="feed"><option value="manual">Manual</option><option value="feed">Feed (file or URL)</option><option value="api">API</option></Select>
          <Input name="url" label="URL" type="url" />
          <Textarea name="termsNote" label="Usage terms and permission" required hint="e.g. Partner agreement dated …, public RSS feed allowed for redistribution, rate limit 1 request/minute." />
        </ActionForm>
      </Card>
    </div>
  );
}
