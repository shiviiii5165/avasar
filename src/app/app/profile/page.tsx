import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { defaultResumeAction, deleteResumeAction, saveProfileFieldsAction, saveSkillsAction, setSkillLevelAction } from "@/app/actions/candidate";
import { ConfirmButton } from "@/components/forms/buttons";
import { ActionForm, Input, Select } from "@/components/forms/action-form";
import { CertificationSection, EducationSection, ExperienceSection, ProjectSection, ResumeUpload, SourceBadge } from "@/components/profile/section-forms";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { CATEGORIES } from "@/server/domain/categories";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { signedDocumentUrl } from "@/server/services/documents";
import { normalizeSkill } from "@/server/domain/skills";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Profile" };

const SYNC_MESSAGE: Record<string, string> = {
  login_required: "AI Tathastu needs you to sign in again before Avsar can refresh your profile.",
  consent_required: "Avsar isn't connected to your AI Tathastu account any more. Reconnect to import your profile again.",
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ sync?: string; synced?: string; resume_applied?: string }> }) {
  const session = await requireCandidate("/app/profile");
  const p = await loadProfile(await getDb(), session.profileId);
  if (!p) notFound();
  const pr = p.profile;
  const { sync, synced, resume_applied } = await searchParams;
  const ownSkills = p.skills.filter((s) => s.source === "avsar");
  const importedSkills = p.skills.filter((s) => s.source === "ai_tathastu");
  // Skills AI Tathastu verified from evidence (GitHub, assessments), as shared at the last sync.
  const verified = new Set((pr.aitInsights.skills ?? []).filter((x) => x.verified).map((x) => normalizeSkill(x.name)));

  return (
    <div className="space-y-6">
      <PageHeader title={pr.fullName ?? "Your profile"} description={[pr.headline, pr.city, pr.country].filter(Boolean).join(" · ") || "Your Avsar profile, built from what you share on AI Tathastu."} />

      {resume_applied && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Added the items you confirmed from your resume.</p>}
      {synced && pr.aitSyncStatus !== "failed" && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Profile refreshed from AI Tathastu.</p>}
      {sync && SYNC_MESSAGE[sync] && (
        <p role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          {SYNC_MESSAGE[sync]}
          <a href="/api/auth/login?prompt=consent&returnTo=/app/profile%3Fsynced%3D1" className={buttonClass("secondary", "sm")}>Reconnect with AI Tathastu</a>
        </p>
      )}
      <SyncStatusCard status={pr.aitSyncStatus} syncedAt={pr.aitSyncedAt} error={pr.aitSyncError} provider={session.identity.provider} />
      <p className="text-xs text-muted">
        Records marked <Badge tone="purple">From AI Tathastu</Badge> are kept in sync with your AI Tathastu profile; change them there. Anything you add here is yours in Avsar and is never overwritten by a sync. Nothing on this page is required to browse or apply.
      </p>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Skills</h2>
        {importedSkills.length > 0 && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">From AI Tathastu · edit there</p>}
        {importedSkills.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Skills from AI Tathastu">
            {importedSkills.map((s) => (
              <li key={s.id}>
                <Badge tone={verified.has(s.normalized) ? "success" : "purple"}>
                  {s.name}{s.level ? ` · ${s.level}` : ""}{verified.has(s.normalized) ? " · verified" : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {ownSkills.length > 0 && <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Added in Avsar</p>}
        {ownSkills.length > 0 && (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Skills you added in Avsar">
            {ownSkills.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium text-navy">{s.name}</span> {s.evidenceCount > 0 ? <Badge tone="success">{s.evidenceCount} evidence</Badge> : null}</span>
                <form action={setSkillLevelAction.bind(null, s.id)} className="flex items-center gap-1">
                  <label htmlFor={`lvl-${s.id}`} className="sr-only">Level for {s.name}</label>
                  <select id={`lvl-${s.id}`} name="level" defaultValue={s.level ?? ""} className="rounded-md border border-line bg-surface px-2 py-1 text-xs">
                    <option value="">Level</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="expert">Expert</option>
                  </select>
                  <button className="rounded-md px-2 py-1 text-xs font-semibold text-purple hover:bg-purple-soft">Set</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <ActionForm action={saveSkillsAction} submitLabel="Save my added skills">
            <Input name="skills" label="Skills you want to add in Avsar (comma separated)" defaultValue={ownSkills.map((s) => s.name).join(", ")} hint="Optional. Skills from AI Tathastu are already included above." />
          </ActionForm>
        </div>
      </Card>

      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Education</h2><EducationSection p={p} /></Card>
      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Experience</h2><ExperienceSection p={p} /></Card>
      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Projects</h2><ProjectSection p={p} /></Card>
      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Certifications</h2><CertificationSection p={p} /></Card>
      {p.achievements.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-navy">Achievements and publications</h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {p.achievements.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div><p className="font-semibold text-navy">{a.title}</p><p className="text-muted">{[a.kind === "publication" ? "Publication" : "Achievement", a.issuer, a.date].filter(Boolean).join(" · ")}</p></div>
                <SourceBadge source={a.source} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-navy">Preferences for Avsar</h2>
        <p className="mt-1 text-xs text-muted">Optional. Used only to rank opportunities for you; never shared with organizations.</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <ActionForm action={saveProfileFieldsAction.bind(null, "roles")} submitLabel="Save roles">
            <Input name="preferredRoles" label="Roles you want (comma separated)" defaultValue={pr.preferredRoles.join(", ")} />
          </ActionForm>
          <ActionForm action={saveProfileFieldsAction.bind(null, "locations")} submitLabel="Save locations">
            <Input name="preferredLocations" label="Cities you'd work in (comma separated)" defaultValue={pr.preferredLocations.join(", ")} />
          </ActionForm>
          <ActionForm action={saveProfileFieldsAction.bind(null, "workModes")} submitLabel="Save work modes">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-navy">Ways of working</legend>
              {[["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="workModes[]" value={v} defaultChecked={pr.workModes.includes(v)} className="size-4 accent-purple" /> {l}</label>
              ))}
            </fieldset>
          </ActionForm>
          <ActionForm action={saveProfileFieldsAction.bind(null, "interests")} submitLabel="Save interests">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-navy">Looking for</legend>
              {CATEGORIES.map((c) => [c.key, c.plural]).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="preferredCategories[]" value={v} defaultChecked={pr.preferredCategories.includes(v)} className="size-4 accent-purple" /> {l}</label>
              ))}
            </fieldset>
            <Input name="interests" label="Fields that interest you" defaultValue={pr.interests.join(", ")} />
          </ActionForm>
          <ActionForm action={saveProfileFieldsAction.bind(null, "availability")} submitLabel="Save availability">
            <Input name="availableFrom" label="Available from" type="date" defaultValue={pr.availableFrom ?? ""} />
            <Input name="hoursPerWeek" label="Hours per week (part-time or gigs)" type="number" min={1} max={80} defaultValue={pr.hoursPerWeek ?? ""} />
            <Select name="workAuthorizedIndia" label="Authorized to work in India?" defaultValue={pr.workAuthorizedIndia === null ? "" : pr.workAuthorizedIndia ? "yes" : "no"}>
              <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
            </Select>
          </ActionForm>
          <ActionForm action={saveProfileFieldsAction.bind(null, "links")} submitLabel="Save links">
            <Input name="linkedinUrl" label="LinkedIn" type="url" defaultValue={pr.linkedinUrl ?? ""} />
            <Input name="githubUrl" label="GitHub" type="url" defaultValue={pr.githubUrl ?? ""} />
            <Input name="portfolioUrl" label="Portfolio" type="url" defaultValue={pr.portfolioUrl ?? ""} />
          </ActionForm>
        </div>
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-navy">Correct your name, headline or location in Avsar</summary>
          <p className="mt-2 text-xs text-muted">If you change a value here, Avsar keeps your version instead of the one from AI Tathastu.</p>
          <ActionForm action={saveProfileFieldsAction.bind(null, "basics")} submitLabel="Save" className="mt-3 max-w-xl">
            <Input name="fullName" label="Full name" defaultValue={pr.fullName ?? ""} required />
            <Input name="headline" label="Headline" defaultValue={pr.headline ?? ""} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="city" label="City" defaultValue={pr.city ?? ""} />
              <Input name="region" label="State" defaultValue={pr.region ?? ""} />
            </div>
          </ActionForm>
        </details>
      </Card>

      <Card id="resumes">
        <h2 className="text-lg font-semibold text-navy">Resumes</h2>
        <p className="mt-1 text-xs text-muted">Optional and private. Links below work for 5 minutes and only for you.</p>
        {p.resumes.length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {p.resumes.map(({ resume: r, doc }) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText aria-hidden className="size-4 shrink-0 text-purple" />
                  <a href={signedDocumentUrl(doc.id, session.identity.id)} target="_blank" rel="noopener" className="truncate font-medium text-navy hover:underline">{r.label}</a>
                  <span className="text-muted">v{r.version} · {(doc.sizeBytes / 1024).toFixed(0)} KB</span>
                  {r.isDefault && <Badge tone="purple">Default</Badge>}
                </span>
                <span className="flex items-center gap-1">
                  <Link href={`/app/profile/resume/${r.id}`} className={buttonClass("ghost", "sm")}>Suggest profile updates</Link>
                  {!r.isDefault && <form action={defaultResumeAction.bind(null, r.id)}><button className={buttonClass("ghost", "sm")}>Make default</button></form>}
                  <form action={deleteResumeAction.bind(null, r.id)}><ConfirmButton label="Delete" message={`Delete "${r.label}"? Applications already submitted keep their copy.`} /></form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4"><ResumeUpload /></div>
      </Card>
    </div>
  );
}
