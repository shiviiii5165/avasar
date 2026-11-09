import { inviteAction, memberRoleAction, removeMemberAction, requestVerificationAction, revokeInviteAction, updateOrgAction } from "@/app/actions/employer";
import { OrgNav } from "@/components/employer/org-nav";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/forms/action-form";
import { Badge, buttonClass, Card } from "@/components/ui";
import { ORG_ROLE_LABEL, orgDenialReason, type OrgVerification } from "@/server/domain/org-permissions";
import { latestVerification, listInvitations, listMembers } from "@/server/services/employer";

import { studioPage } from "../context";

export const metadata = { title: "Organization" };

const ROLES = Object.entries(ORG_ROLE_LABEL);

export default async function OrgSettings({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ created?: string; verification?: string }> }) {
  const { orgId } = await params;
  const { ctx, session, db } = await studioPage(orgId, "/settings");
  const { created, verification: requested } = await searchParams;
  const o = ctx.org;
  const manage = ctx.can("member.manage");
  const [members, invites, verification] = await Promise.all([
    listMembers(db, session.identity.id, orgId),
    manage ? listInvitations(db, session.identity.id, orgId) : Promise.resolve([]),
    latestVerification(db, orgId),
  ]);

  return (
    <div className="space-y-6">
      <OrgNav ctx={ctx} active="settings" />
      {created && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Organization created. Next: request verification so your listings can be reviewed.</p>}

      <Card>
        <h2 className="text-lg font-semibold text-navy">Organization profile</h2>
        {ctx.can("org.edit") ? (
          <ActionForm action={updateOrgAction.bind(null, orgId)} submitLabel="Save profile" className="mt-4 max-w-2xl">
            <Input name="name" label="Organization name" required defaultValue={o.name} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="website" label="Official website" type="url" defaultValue={o.website ?? ""} />
              <Input name="domain" label="Official email domain" defaultValue={o.domain ?? ""} />
              <Input name="industry" label="Industry" defaultValue={o.industry ?? ""} />
              <Input name="city" label="City" defaultValue={o.city ?? ""} />
            </div>
            <Textarea name="description" label="About" defaultValue={o.description ?? ""} maxLength={2000} />
          </ActionForm>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted">Website</dt><dd>{o.website ?? "—"}</dd></div><div><dt className="text-muted">Domain</dt><dd>{o.domain ?? "—"}</dd></div></dl>
        )}
      </Card>

      <Card id="verification">
        <h2 className="text-lg font-semibold text-navy">Verification</h2>
        <p className="mt-1 text-sm text-muted">Avsar checks your official domain or website, registration and an authorized representative by hand. A Verified badge records that check; it isn&apos;t a guarantee.</p>
        {requested && <p role="status" className="mt-3 rounded-md bg-success-soft px-3 py-2 text-sm text-success">Verification requested. Avsar reviews the evidence by hand; the decision will appear here.</p>}
        <p className="mt-3 text-sm">Status: <Badge tone={o.verificationStatus === "verified" ? "success" : "neutral"}>{o.verificationStatus.replace("_", " ")}</Badge>{verification?.decisionNote && o.verificationStatus === "rejected" ? <span className="ml-2 text-muted">Reason: {verification.decisionNote}</span> : null}</p>
        {["unverified", "rejected", "expired"].includes(o.verificationStatus) && (ctx.can("org.request_verification") ? (
          <ActionForm action={requestVerificationAction.bind(null, orgId)} submitLabel="Request verification" className="mt-4 max-w-2xl">
            <Input name="representative" label="Authorized representative (name and position)" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="registration" label="Registration number (CIN, GSTIN or similar)" />
              <Input name="officialEmailDomain" label="Official email domain" defaultValue={o.domain ?? ""} />
            </div>
            <Textarea name="notes" label="Anything else that helps us verify you" maxLength={1000} />
          </ActionForm>
        ) : <p className="mt-3 text-sm text-muted">{orgDenialReason(ctx.role, "org.request_verification", o.verificationStatus as OrgVerification)}</p>)}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Members</h2>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {members.map((m) => (
            <li key={m.identityId} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span><span className="font-medium text-navy">{m.name ?? "Member"}</span>{m.identityId === session.identity.id ? <span className="text-muted"> (you)</span> : null}</span>
              {manage ? (
                <span className="flex flex-wrap items-end gap-2">
                  <ActionForm action={memberRoleAction.bind(null, orgId, m.identityId)} className="flex items-end gap-2 space-y-0">
                    <Select id={`role-${m.identityId}`} name="role" label={`Role for ${m.name ?? "member"}`} defaultValue={m.role}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                    <SubmitButton label="Change" variant="secondary" />
                  </ActionForm>
                  {m.identityId !== session.identity.id && <ActionForm action={removeMemberAction.bind(null, orgId, m.identityId)} className="space-y-0"><SubmitButton label="Remove" variant="danger" /></ActionForm>}
                </span>
              ) : <Badge>{ORG_ROLE_LABEL[m.role]}</Badge>}
            </li>
          ))}
        </ul>
        {manage && (
          <div className="mt-6">
            <h3 className="font-semibold text-navy">Invite a teammate</h3>
            <p className="mt-1 text-xs text-muted">They accept with the one-time link while signed in with their own AI Tathastu account. The link expires in 7 days.</p>
            <ActionForm action={inviteAction.bind(null, orgId)} submitLabel="Send invitation" className="mt-3 max-w-2xl" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input id="invite-email" name="email" label="Teammate's email" type="email" required />
                <Select id="invite-role" name="role" label="Role" defaultValue="recruiter">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              </div>
            </ActionForm>
            {invites.length > 0 && (
              <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                    <span>{i.email} · {ORG_ROLE_LABEL[i.role]} · expires {i.expiresAt.toLocaleDateString("en-IN")}</span>
                    <form action={revokeInviteAction.bind(null, orgId, i.id)}><button className={buttonClass("ghost", "sm")}>Revoke</button></form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
