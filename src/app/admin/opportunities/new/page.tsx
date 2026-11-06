import { Denied } from "@/components/admin/denied";
import { OpportunityForm } from "@/components/admin/opportunity-form";
import { Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";

export const metadata = { title: "New opportunity" };

export default async function NewOpportunity() {
  if (!(await adminGate("opportunity.create"))) return <Denied />;
  return (
    <div className="max-w-4xl">
      <PageHeader title="New opportunity" description="Saved as a draft. Send it to review, approve and publish from the next screen." />
      <Card><OpportunityForm /></Card>
    </div>
  );
}
