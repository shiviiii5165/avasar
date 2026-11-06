import { Denied, Table } from "@/components/admin/denied";
import { Badge, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listCandidates } from "@/server/services/admin";

export const metadata = { title: "Candidates" };

/** Minimal directory for support. Detailed profiles and documents are not browsable here by design. */
export default async function CandidatesPage() {
  if (!(await adminGate("candidate.view"))) return <Denied />;
  const rows = await listCandidates(await getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Candidates" description={`${rows.length} candidate profile${rows.length === 1 ? "" : "s"}. Shown with minimal fields; private profile details and documents aren't browsable from here.`} />
      <Table head={["Name", "City", "Stage", "Visibility", "Onboarded", "Sign-in", "Joined"]} caption="Candidates">
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-3 font-medium text-navy">{c.fullName ?? "(no name yet)"}</td>
            <td className="px-4 py-3 text-muted">{c.city ?? "—"}</td>
            <td className="px-4 py-3">{c.careerStage ?? "—"}</td>
            <td className="px-4 py-3"><Badge>{c.visibility}</Badge></td>
            <td className="px-4 py-3">{c.onboarded ? "Yes" : "In progress"}</td>
            <td className="px-4 py-3">{c.provider === "dev" ? <Badge tone="orange">dev persona</Badge> : "AI Tathastu"}</td>
            <td className="px-4 py-3 text-muted">{c.createdAt.toLocaleDateString("en-IN")}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
