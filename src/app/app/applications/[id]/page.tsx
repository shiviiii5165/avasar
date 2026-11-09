import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { withdrawAction } from "@/app/actions/candidate";
import { candidateReplyAction } from "@/app/actions/employer";
import { ActionForm, Input, Textarea } from "@/components/forms/action-form";
import { Badge, Card } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { APPLICATION_STATUS_LABEL, canTransitionApplication } from "@/server/domain/workflows";
import { STATUS_TONE } from "@/components/opportunity/status";
import { getApplicationForProfile } from "@/server/services/applications";
import { candidateRecruitmentView } from "@/server/services/employer";

export const metadata = { title: "Application" };

export default async function ApplicationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { id } = await params;
  const session = await requireCandidate(`/app/applications/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const data = await getApplicationForProfile(db, session.profileId, id);
  const rec = await candidateRecruitmentView(db, session.profileId, id);
  const when = (d: Date | null) => (d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "");
  if (!data) notFound(); // another person's application looks exactly like a missing one
  const { application: a, opportunity: o, events, answers } = data;
  const { submitted } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {submitted && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Your application was submitted{o.isSample ? " (sample listing: not sent to any employer)" : ""}. We&apos;ll notify you when it changes.
        </p>
      )}
      <div>
        <Link href="/app/applications" className="text-sm font-medium text-muted hover:text-navy">← All applications</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl text-navy">{o.title}</h1>
          <Badge tone={STATUS_TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>
        </div>
        <p className="text-muted">{o.organizationName} · <Link href={`/opportunities/${o.slug}`} className="text-purple hover:underline">view listing</Link></p>
      </div>

      <Card>
        <h2 className="font-semibold text-navy">Progress</h2>
        <ol className="mt-4 space-y-4 border-l-2 border-purple-soft pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span aria-hidden className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-surface bg-purple" />
              <p className="text-sm font-semibold text-navy">{APPLICATION_STATUS_LABEL[e.toStatus]}</p>
              <p className="text-xs text-muted">{e.at.toLocaleString("en-IN")} · by {e.actorRole === "candidate" ? "you" : e.actorRole === "system" ? "Avsar" : "the hiring team"}</p>
              {e.reason && e.actorRole === "candidate" && <p className="mt-1 text-sm text-ink/80">{e.reason}</p>}
            </li>
          ))}
        </ol>
      </Card>

      {rec && (rec.interviews.length > 0 || rec.assessments.length > 0) && (
        <Card>
          <h2 className="font-semibold text-navy">Next steps from {o.organizationName}</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {rec.interviews.map((i) => (
              <li key={i.id} className="rounded-lg border border-line p-3">
                <p className="font-medium text-navy">Interview · {when(i.scheduledAt)} ({i.durationMinutes} min, {i.mode})</p>
                {i.location && <p className="break-all text-muted">{i.location}</p>}
                {i.status !== "scheduled" && <p className="text-muted">{i.status === "cancelled" ? "Cancelled" : "Completed"}</p>}
              </li>
            ))}
            {rec.assessments.map((x) => (
              <li key={x.id} className="rounded-lg border border-line p-3">
                <p className="font-medium text-navy">Assessment · {x.title}{x.dueAt ? ` · due ${when(x.dueAt)}` : ""}</p>
                {x.instructions && <p className="mt-1 whitespace-pre-line text-ink/80">{x.instructions}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rec && rec.messages.length > 0 && (
        <Card>
          <h2 className="font-semibold text-navy">Messages</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {rec.messages.map((m) => (
              <li key={m.id} className={`rounded-lg p-3 ${m.fromCandidate ? "bg-purple-soft" : "bg-surface-muted"}`}>
                <p className="text-xs text-muted">{m.fromCandidate ? "You" : o.organizationName} · {when(m.createdAt)}</p>
                <p className="whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ul>
          <ActionForm action={candidateReplyAction.bind(null, a.id)} submitLabel="Send reply" className="mt-3" resetOnSuccess>
            <Textarea name="body" label="Reply" required maxLength={4000} rows={3} />
          </ActionForm>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-navy">What you submitted</h2>
        <p className="mt-1 text-xs text-muted">Snapshot from {a.submittedAt.toLocaleString("en-IN")} (listing version {a.opportunityVersion}). Later profile edits don&apos;t change it.</p>
        <dl className="mt-3 space-y-3 text-sm">
          {answers.map((ans) => (
            <div key={ans.questionKey}><dt className="font-medium text-navy">{ans.question}</dt><dd className="mt-0.5 whitespace-pre-line text-ink/80">{ans.answer}</dd></div>
          ))}
          <div><dt className="font-medium text-navy">Resume</dt><dd className="text-ink/80">{a.resumeDocumentId ? "Attached" : "Not attached"}</dd></div>
          <div><dt className="font-medium text-navy">Declaration</dt><dd className="text-ink/80">{a.consentText}</dd></div>
        </dl>
      </Card>

      {canTransitionApplication(a.status, "withdrawn", "candidate") && (
        <Card>
          <h2 className="font-semibold text-navy">Withdraw application</h2>
          <p className="mt-1 text-sm text-muted">The organization will see that you withdrew. This can&apos;t be undone.</p>
          <ActionForm action={withdrawAction.bind(null, a.id)} submitLabel="Withdraw" className="mt-3">
            <Input name="reason" label="Reason (optional)" maxLength={300} />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
