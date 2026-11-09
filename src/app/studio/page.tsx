import Link from "next/link";
import { Building2 } from "lucide-react";

import { createOrgAction } from "@/app/actions/employer";
import { ActionForm, Input, Textarea } from "@/components/forms/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ORG_ROLE_LABEL } from "@/server/domain/org-permissions";
import { listMemberships } from "@/server/services/employer";

export const metadata = { title: "Your organizations" };

export default async function StudioHome() {
  const s = await requireUser("/studio");
  const orgs = await listMemberships(await getDb(), s.identity.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Your organizations" description="Manage listings and applicants for organizations you belong to. Avsar reviews every listing before it's published." />
      {orgs.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orgs.map(({ org, role }) => (
            <li key={org.id}>
              <Link href={`/studio/${org.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 hover:border-purple">
                <span className="flex items-center gap-3"><Building2 aria-hidden className="size-5 text-purple" /><span className="font-semibold text-navy">{org.name}</span></span>
                <span className="flex gap-2"><Badge tone={org.verificationStatus === "verified" ? "success" : "neutral"}>{org.verificationStatus.replace("_", " ")}</Badge><Badge>{ORG_ROLE_LABEL[role]}</Badge></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <h2 className="text-lg font-semibold text-navy">{orgs.length ? "Register another organization" : "Register your organization"}</h2>
        <p className="mt-1 text-sm text-muted">You become its owner. You can draft listings straight away; submitting them for review needs Avsar to verify the organization first. Joining an existing organization? Ask its owner for an invitation link.</p>
        <ActionForm action={createOrgAction} submitLabel="Create organization" className="mt-4 max-w-2xl">
          <Input name="name" label="Organization name" required maxLength={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="website" label="Official website" type="url" placeholder="https://" />
            <Input name="domain" label="Official email domain" placeholder="example.com" />
            <Input name="industry" label="Industry" />
            <Input name="city" label="City" />
          </div>
          <Textarea name="description" label="About the organization" maxLength={2000} />
        </ActionForm>
      </Card>
    </div>
  );
}
