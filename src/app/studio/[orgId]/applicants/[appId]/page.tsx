import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { applicantStatusAction, assessmentAction, assessmentResultAction, interviewAction, interviewFeedbackAction, messageAction, noteAction } from "@/app/actions/employer";
import { OrgNav } from "@/components/employer/org-nav";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import { Badge, Card } from "@/components/ui";
import { orgDenialReason, type OrgVerification } from "@/server/domain/org-permissions";
import { APPLICATION_STATUS_LABEL, canTransitionApplication, type ApplicationStatus } from "@/server/domain/workflows";
import { EmployerError, getApplicant, markViewed } from "@/server/services/employer";

import { studioPage } from "../../context";

export const metadata = { title: "Applicant" };

type Snap = {
  fullName?: string | null; headline?: string | null; city?: string | null;
  education?: { institution: string; level: string | null; degree: string | null; field: string | null; graduationYear: number | null }[];
  experiences?: { organization: string; title: string; startDate: string | null; endDate: string | null; current: boolean }[];
  projects?: { title: string; url: string | null; skills: string[] }[];
  skills?: string[]; certifications?: string[]; links?: Record<string, string | null>;
};
const fmt = (d: Date | null) => (d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "");

export default async function ApplicantPage({ params }: { params: Promise<{ orgId: string; appId: string }> }) {
  const { orgId, appId } = await params;
  const { ctx, session, db } = await studioPage(orgId, `/applicants/${appId}`);
  const guard = (e: unknown) => { if (e instanceof EmployerError) notFound(); throw e; };
  await markViewed(db, session.identity.id, orgId, appId).catch(guard);
  const d = await getApplicant(db, session.identity.id, orgId, appId).catch(guard);
  const a = d.application;
  const s = a.profileSnapshot as Snap;
  const v = ctx.org.verificationStatus as OrgVerification;
  const next = (Object.keys(APPLICATION_STATUS_LABEL) as ApplicationStatus[]).filter((t) => canTransitionApplication(a.status, t, "employer"));
  const closed = ["rejected", "withdrawn", "closed", "selected"].includes(a.status);
  const history = [
    ...d.events.map((e) => ({ at: e.at, text: `${e.fromStatus ? `${APPLICATION_STATUS_LABEL[e.fromStatus]} → ` : ""}${APPLICATION_STATUS_LABEL[e.toStatus]}${e.reason ? ` (${e.reason})` : ""}`, who: e.actorRole })),
    ...d.interviews.map((i) => ({ at: i.createdAt, text: `Interview scheduled for ${fmt(i.scheduledAt)}`, who: "employer" })),
    ...d.assessments.map((x) => ({ at: x.createdAt, text: `Assessment assigned: ${x.title}`, who: "employer" })),
    ...d.messages.map((m) => ({ at: m.createdAt, text: m.fromCandidate ? "Candidate replied" : "Message sent to candidate", who: m.fromCandidate ? "candidate" : "employer" })),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());

  return (
    <div className="space-y-6">
      <OrgNav ctx={ctx} active="applicants" />
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold text-navy">{s.fullName ?? "Applicant"}</h2>
        <Badge tone="purple">{APPLICATION_STATUS_LABEL[a.status]}</Badge>
        <span className="text-sm text-muted">{d.opportunity.title} · applied {a.submittedAt.toLocaleDateString("en-IN")}</span>
      </div>
      <p className="text-xs text-muted">This is what the candidate submitted (a snapshot). Their contact email isn&apos;t shared; use messages. Every decision is yours: Avsar never accepts or rejects candidates automatically.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold text-navy">Submitted profile</h3>
            <dl className="mt-3 space-y-3 text-sm">
              {s.headline && <div><dt className="text-muted">Headline</dt><dd>{s.headline}{s.city ? ` · ${s.city}` : ""}</dd></div>}
              <div><dt className="text-muted">Education</dt><dd>{s.education?.length ? s.education.map((e, i) => <p key={i}>{e.institution}{[e.degree, e.field].filter(Boolean).length ? `, ${[e.degree, e.field].filter(Boolean).join(" ")}` : ""}{e.graduationYear ? ` (${e.graduationYear})` : ""}</p>) : "Not shared"}</dd></div>
              <div><dt className="text-muted">Experience</dt><dd>{s.experiences?.length ? s.experiences.map((e, i) => <p key={i}>{e.title}, {e.organization}</p>) : "None listed"}</dd></div>
              <div><dt className="text-muted">Projects</dt><dd>{s.projects?.length ? s.projects.map((p, i) => <p key={i}>{p.title}{p.skills.length ? ` (${p.skills.join(", ")})` : ""}</p>) : "None listed"}</dd></div>
              <div><dt className="text-muted">Skills</dt><dd>{s.skills?.join(", ") || "None listed"}</dd></div>
              {s.certifications?.length ? <div><dt className="text-muted">Certifications</dt><dd>{s.certifications.join(", ")}</dd></div> : null}
              {s.links && Object.values(s.links).some(Boolean) && <div><dt className="text-muted">Links</dt><dd className="flex flex-wrap gap-3">{Object.entries(s.links).filter(([, u]) => u).map(([k, u]) => <a key={k} href={u!} target="_blank" rel="noopener noreferrer nofollow" className="capitalize text-purple hover:underline">{k}</a>)}</dd></div>}
            </dl>
            {d.resumeUrl ? (
              <a href={d.resumeUrl} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-purple hover:underline"><FileText aria-hidden className="size-4" /> Open resume (link valid 5 minutes)</a>
            ) : a.resumeDocumentId ? <p className="mt-4 text-xs text-muted">A resume was attached. {orgDenialReason(ctx.role, "applicant.document", v)}</p> : <p className="mt-4 text-xs text-muted">No resume attached.</p>}
          </Card>

          {d.answers.length > 0 && (
            <Card>
              <h3 className="font-semibold text-navy">Answers</h3>
              <dl className="mt-3 space-y-3 text-sm">{d.answers.map((x) => <div key={x.questionKey}><dt className="font-medium text-navy">{x.question}</dt><dd className="whitespace-pre-line text-ink/80">{x.answer}</dd></div>)}</dl>
            </Card>
          )}

          <Card>
            <h3 className="font-semibold text-navy">Messages</h3>
            {d.messages.length ? (
              <ul className="mt-3 space-y-2 text-sm">{d.messages.map((m) => <li key={m.id} className={`rounded-lg p-3 ${m.fromCandidate ? "bg-surface-muted" : "bg-purple-soft"}`}><p className="text-xs text-muted">{m.fromCandidate ? "Candidate" : m.sender ?? "Your team"} · {fmt(m.createdAt)}</p><p className="whitespace-pre-line">{m.body}</p></li>)}</ul>
            ) : <p className="mt-2 text-sm text-muted">No messages yet.</p>}
            {ctx.can("message.send") && !closed ? (
              <ActionForm action={messageAction.bind(null, orgId, a.id)} submitLabel="Send message" className="mt-4" resetOnSuccess><Textarea id="message-body" name="body" label="Message to the candidate" required maxLength={4000} rows={3} /></ActionForm>
            ) : !closed ? <p className="mt-3 text-xs text-muted">{orgDenialReason(ctx.role, "message.send", v)}</p> : null}
          </Card>

          <Card>
            <h3 className="font-semibold text-navy">Activity</h3>
            <ol className="mt-3 space-y-2 border-l border-line pl-4 text-sm">{history.map((h, i) => <li key={i}><span className="text-muted">{fmt(h.at)} · {h.who}</span><br />{h.text}</li>)}</ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h3 className="font-semibold text-navy">Status</h3>
            {ctx.can("applicant.update_status") && next.length ? (
              <ActionForm action={applicantStatusAction.bind(null, orgId, a.id)} submitLabel="Update status" className="mt-3">
                <Select name="status" label="Move to" defaultValue={next[0]}>{next.map((t) => <option key={t} value={t}>{APPLICATION_STATUS_LABEL[t]}</option>)}</Select>
                <Input id="status-reason" name="reason" label="Reason (shared in history)" maxLength={300} />
              </ActionForm>
            ) : <p className="mt-2 text-sm text-muted">{closed ? "This application is closed." : orgDenialReason(ctx.role, "applicant.update_status", v)}</p>}
          </Card>

          <Card>
            <h3 className="font-semibold text-navy">Interviews</h3>
            <ul className="mt-2 space-y-3 text-sm">
              {d.interviews.map((i) => (
                <li key={i.id} className="rounded-lg border border-line p-3">
                  <p className="font-medium text-navy">{fmt(i.scheduledAt)} · {i.durationMinutes} min · {i.mode}</p>
                  {i.location && <p className="break-all text-muted">{i.location}</p>}
                  <p className="text-muted">Status: {i.status}{i.outcome ? ` · recommendation: ${i.outcome}` : ""}</p>
                  {i.feedback && <p className="mt-1 whitespace-pre-line">{i.feedback}</p>}
                  {i.status === "scheduled" && ctx.can("interview.manage") && (
                    <ActionForm action={interviewFeedbackAction.bind(null, orgId, a.id, i.id)} submitLabel="Record" className="mt-2">
                      <Select id={`iv-status-${i.id}`} name="status" label="Interview" defaultValue="completed"><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select>
                      <Select id={`iv-outcome-${i.id}`} name="outcome" label="Your recommendation" defaultValue=""><option value="">None yet</option><option value="advance">Advance</option><option value="hold">Hold</option><option value="decline">Decline</option></Select>
                      <Textarea id={`iv-feedback-${i.id}`} name="feedback" label="Feedback (internal)" maxLength={4000} rows={3} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {ctx.can("interview.manage") && !closed && (
              <ActionForm action={interviewAction.bind(null, orgId, a.id)} submitLabel="Schedule interview" className="mt-3" resetOnSuccess>
                <Input name="scheduledAt" label="Date and time" type="datetime-local" required />
                <div className="grid grid-cols-2 gap-3">
                  <Input name="durationMinutes" label="Minutes" type="number" defaultValue={45} min={10} max={480} />
                  <Select name="mode" label="Mode" defaultValue="video"><option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On-site</option></Select>
                </div>
                <Input name="location" label="Meeting link or address" maxLength={300} />
                <Input name="interviewers" label="Interviewers" maxLength={300} />
              </ActionForm>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold text-navy">Assessments</h3>
            <ul className="mt-2 space-y-3 text-sm">
              {d.assessments.map((x) => (
                <li key={x.id} className="rounded-lg border border-line p-3">
                  <p className="font-medium text-navy">{x.title}{x.dueAt ? ` · due ${fmt(x.dueAt)}` : ""}</p>
                  {x.result ? <p className="text-muted">Result: {x.result.replace("_", " ")}{x.score !== null ? ` · ${x.score}${x.maxScore ? `/${x.maxScore}` : ""}` : ""}</p> : null}
                  {x.feedback && <p className="mt-1 whitespace-pre-line">{x.feedback}</p>}
                  {!x.result && ctx.can("assessment.manage") && (
                    <ActionForm action={assessmentResultAction.bind(null, orgId, a.id, x.id)} submitLabel="Record result" className="mt-2">
                      <Select id={`as-result-${x.id}`} name="result" label="Result" defaultValue="passed"><option value="passed">Passed</option><option value="not_passed">Not passed</option><option value="incomplete">Incomplete</option></Select>
                      <Input id={`as-score-${x.id}`} name="score" label={`Score${x.maxScore ? ` (out of ${x.maxScore})` : ""}`} type="number" min={0} />
                      <Textarea id={`as-feedback-${x.id}`} name="feedback" label="Feedback (internal)" maxLength={4000} rows={2} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {ctx.can("assessment.manage") && !closed && (
              <ActionForm action={assessmentAction.bind(null, orgId, a.id)} submitLabel="Assign assessment" className="mt-3" resetOnSuccess>
                <Input name="title" label="Assessment" required maxLength={160} />
                <Textarea name="instructions" label="Instructions for the candidate" maxLength={4000} rows={2} />
                <div className="grid grid-cols-2 gap-3"><Input name="dueAt" label="Due" type="datetime-local" /><Input name="maxScore" label="Max score" type="number" min={1} /></div>
              </ActionForm>
            )}
          </Card>

          {d.notes !== null && (
            <Card>
              <h3 className="font-semibold text-navy">Internal notes</h3>
              <p className="text-xs text-muted">Visible only to your organization. Never shown to the candidate.</p>
              <ul className="mt-2 space-y-2 text-sm">{d.notes.map(({ n, author }) => <li key={n.id} className="rounded-lg bg-surface-muted p-3"><p className="text-xs text-muted">{author} · {fmt(n.createdAt)}</p><p className="whitespace-pre-line">{n.body}</p></li>)}</ul>
              {ctx.can("note.write") && <ActionForm action={noteAction.bind(null, orgId, a.id)} submitLabel="Add note" className="mt-3" resetOnSuccess><Textarea id="note-body" name="body" label="Note" required maxLength={4000} rows={3} /></ActionForm>}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
