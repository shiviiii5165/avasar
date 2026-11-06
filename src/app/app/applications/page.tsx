import Link from "next/link";

import { SampleBadge } from "@/components/opportunity/opportunity-card";
import { Badge, buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { STATUS_TONE } from "@/components/opportunity/status";
import { APPLICATION_STATUS_LABEL } from "@/server/domain/workflows";
import { listApplicationsForProfile } from "@/server/services/applications";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const session = await requireCandidate("/app/applications");
  const apps = await listApplicationsForProfile(await getDb(), session.profileId);
  return (
    <div>
      <PageHeader title="Applications" description="Applications you submitted on Avsar. Applications made on other sites can't be tracked here." />
      {apps.length === 0 ? (
        <StateMessage kind="empty" title="No applications yet" body="When you apply to an opportunity on Avsar, you'll follow every step here." action={<Link href="/app/discover" className={buttonClass("primary")}>Find opportunities</Link>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {apps.map(({ application: a, opportunity: o }) => (
            <li key={a.id}>
              <Link href={`/app/applications/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-muted">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{o.title}</p>
                  <p className="text-sm text-muted">{o.organizationName} · applied {a.submittedAt.toLocaleDateString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-2">{o.isSample && <SampleBadge />}<Badge tone={STATUS_TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</Badge></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
