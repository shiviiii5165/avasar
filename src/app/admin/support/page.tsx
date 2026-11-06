import { ticketStatusAction } from "@/app/actions/admin";
import { Denied } from "@/components/admin/denied";
import { Badge, buttonClass, Card, PageHeader, StateMessage } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listTickets } from "@/server/services/admin";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  if (!(await adminGate("support.handle"))) return <Denied />;
  const tickets = await listTickets(await getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Support" description="Messages from the Contact page. Reply by email from the support mailbox; status changes are audited." />
      {tickets.length === 0 ? (
        <StateMessage kind="empty" title="No support messages" />
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-navy">{t.subject}</p>
                  <Badge tone={t.status === "closed" ? "neutral" : "warning"}>{t.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{t.createdAt.toLocaleString("en-IN")} · {t.identityId ? "signed-in user" : t.email}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-ink/90">{t.body}</p>
                <div className="mt-3 flex gap-2">
                  {(["open", "pending", "closed"] as const).filter((st) => st !== t.status).map((st) => (
                    <form key={st} action={ticketStatusAction.bind(null, t.id, st)}><button className={buttonClass("ghost", "sm")}>Mark {st}</button></form>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
