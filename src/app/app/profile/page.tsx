import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

import { defaultResumeAction, deleteResumeAction, saveSkillsAction, setSkillLevelAction } from "@/app/actions/candidate";
import { ConfirmButton } from "@/components/forms/buttons";
import { ActionForm, Input } from "@/components/forms/action-form";
import { CertificationSection, EducationSection, ExperienceSection, ProjectSection, ResumeUpload } from "@/components/profile/section-forms";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { signedDocumentUrl } from "@/server/services/documents";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Profile" };

const VISIBILITY = { private: "Private: only you", application: "Shared with organizations you apply to", discoverable: "Discoverable by verified employers" } as const;
const STAGE = { student: "Student", fresher: "Fresher", early_career: "Early career", experienced: "Experienced", career_switcher: "Career switcher" } as const;

export default async function ProfilePage() {
  const session = await requireCandidate("/app/profile");
  const p = await loadProfile(await getDb(), session.profileId);
  if (!p) redirect("/app/onboarding");
  const pr = p.profile;

  return (
    <div className="space-y-6">
      <PageHeader
        title={pr.fullName ?? "Your profile"}
        description={[pr.headline, pr.careerStage && STAGE[pr.careerStage], pr.city].filter(Boolean).join(" · ") || "Add a headline and your city in step 1."}
        actions={<><Link href="/app/onboarding?step=1" className={buttonClass("secondary", "sm")}>Edit details</Link><Link href="/app/settings" className={buttonClass("ghost", "sm")}>Visibility: {pr.visibility}</Link></>}
      />

      <Card className="flex flex-wrap items-center gap-4">
        <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={p.completeness.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
          <div className="h-full rounded-full bg-purple" style={{ width: `${p.completeness.percent}%` }} />
        </div>
        <p className="text-sm text-navy">{p.completeness.percent}% complete{p.completeness.next ? <> · <Link href={p.completeness.next.href} className="font-semibold text-purple hover:underline">{p.completeness.next.action}</Link></> : ""}</p>
        <p className="w-full text-xs text-muted">{VISIBILITY[pr.visibility]}.</p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Skills</h2>
        <p className="mt-1 text-xs text-muted">Evidence counts come from projects that list the skill. Skills with evidence carry more weight in matching explanations.</p>
        {p.skills.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.skills.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium text-navy">{s.name}</span> {s.evidenceCount > 0 ? <Badge tone="success">{s.evidenceCount} evidence</Badge> : <Badge>no evidence yet</Badge>}</span>
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
          <ActionForm action={saveSkillsAction.bind(null, null)} submitLabel="Save skills">
            <Input name="skills" label="Edit skills (comma separated)" defaultValue={p.skills.map((s) => s.name).join(", ")} />
          </ActionForm>
        </div>
      </Card>

      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Education</h2><EducationSection p={p} /></Card>
      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Experience</h2><ExperienceSection p={p} /></Card>
      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Projects</h2><ProjectSection p={p} /></Card>
      <Card><h2 className="mb-4 text-lg font-semibold text-navy">Certifications</h2><CertificationSection p={p} /></Card>

      <Card id="resumes">
        <h2 className="text-lg font-semibold text-navy">Resumes</h2>
        <p className="mt-1 text-xs text-muted">Private. Links below work for 5 minutes and only for you.</p>
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
                  {!r.isDefault && <form action={defaultResumeAction.bind(null, r.id)}><button className={buttonClass("ghost", "sm")}>Make default</button></form>}
                  <form action={deleteResumeAction.bind(null, r.id)}><ConfirmButton label="Delete" message={`Delete "${r.label}"? Applications already submitted keep their copy.`} /></form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4"><ResumeUpload /></div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Links and preferences</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {[["LinkedIn", pr.linkedinUrl], ["GitHub", pr.githubUrl], ["Portfolio", pr.portfolioUrl]].map(([k, v]) => (
            <div key={k}><dt className="text-muted">{k}</dt><dd>{v ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">{v}</a> : "Not added"}</dd></div>
          ))}
          <div><dt className="text-muted">Looking for</dt><dd className="text-navy">{pr.preferredCategories.join(", ") || "Not set"}</dd></div>
          <div><dt className="text-muted">Roles</dt><dd className="text-navy">{pr.preferredRoles.join(", ") || "Not set"}</dd></div>
          <div><dt className="text-muted">Locations</dt><dd className="text-navy">{pr.preferredLocations.join(", ") || "Not set"}</dd></div>
          <div><dt className="text-muted">Work modes</dt><dd className="text-navy">{pr.workModes.join(", ") || "Not set"}</dd></div>
        </dl>
        <Link href="/app/onboarding?step=8" className="mt-4 inline-block text-sm font-semibold text-purple hover:underline">Edit preferences</Link>
      </Card>
    </div>
  );
}
