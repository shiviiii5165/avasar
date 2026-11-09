import Link from "next/link";
import { notFound } from "next/navigation";

import { saveListingAction } from "@/app/actions/employer";
import { OpportunityForm } from "@/components/admin/opportunity-form";
import { CategoryPicker } from "@/components/admin/category-picker";
import { OrgNav } from "@/components/employer/org-nav";
import { categoryDef } from "@/server/domain/categories";
import { Card } from "@/components/ui";

import { studioPage } from "../../context";

export const metadata = { title: "New listing" };

export default async function NewListing({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ category?: string }> }) {
  const { orgId } = await params;
  const { ctx } = await studioPage(orgId, "/listings/new");
  if (!ctx.can("opportunity.draft")) notFound();
  const def = categoryDef((await searchParams).category ?? "");
  return (
    <div>
      <OrgNav ctx={ctx} active="listings" />
      <Card>
        {def ? (
          <>
            <Link href={`/studio/${orgId}/listings/new`} className="mb-4 inline-block text-sm font-semibold text-purple hover:underline">← Choose a different kind</Link>
            <OpportunityForm category={def.key} action={saveListingAction.bind(null, orgId, null)} lockedOrganization={ctx.org.name} />
          </>
        ) : <CategoryPicker base={`/studio/${orgId}/listings/new`} />}
      </Card>
    </div>
  );
}
