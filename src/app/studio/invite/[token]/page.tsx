import { acceptInviteAction } from "@/app/actions/employer";
import { ActionForm } from "@/components/forms/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Accept invitation", robots: { index: false } };

/** Accepting requires the one-time token and the signed-in person's own identity. Emails are never matched. */
export default async function AcceptInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await requireUser(`/studio/invite/${token}`);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Join an organization" description={`You're signed in as ${s.identity.name ?? "your AI Tathastu account"}. Accepting adds this account to the organization with the role it was invited for.`} />
      <Card><ActionForm action={acceptInviteAction.bind(null, token)} submitLabel="Accept invitation" /></Card>
    </div>
  );
}
