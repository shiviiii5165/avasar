import { notFound } from "next/navigation";

import { saveListingAction } from "@/app/actions/employer";
import { OpportunityForm } from "@/components/admin/opportunity-form";
import { OrgNav } from "@/components/employer/org-nav";
import { Card } from "@/components/ui";

import { studioPage } from "../../context";

export const metadata = { title: "New listing" };

export default async function NewListing({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { ctx } = await studioPage(orgId, "/listings/new");
  if (!ctx.can("opportunity.draft")) notFound();
  return (
    <div>
      <OrgNav ctx={ctx} active="listings" />
      <Card><OpportunityForm action={saveListingAction.bind(null, orgId, null)} lockedOrganization={ctx.org.name} /></Card>
    </div>
  );
}
