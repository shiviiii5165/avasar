import Link from "next/link";

import { Denied } from "@/components/admin/denied";
import { CategoryPicker } from "@/components/admin/category-picker";
import { OpportunityForm } from "@/components/admin/opportunity-form";
import { Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { categoryDef } from "@/server/domain/categories";

export const metadata = { title: "New opportunity" };

export default async function NewOpportunity({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (!(await adminGate("opportunity.create"))) return <Denied />;
  const def = categoryDef((await searchParams).category ?? "");
  return (
    <div className="max-w-4xl">
      <PageHeader title={def ? `New ${def.label.toLowerCase()}` : "New opportunity"} description="Saved as a draft. Send it to review, approve and publish from the next screen." />
      <Card>
        {def ? (
          <>
            <Link href="/admin/opportunities/new" className="mb-4 inline-block text-sm font-semibold text-purple hover:underline">← Choose a different kind</Link>
            <OpportunityForm category={def.key} />
          </>
        ) : <CategoryPicker base="/admin/opportunities/new" />}
      </Card>
    </div>
  );
}