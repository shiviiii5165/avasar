import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Link2, SlidersHorizontal, Sparkles } from "lucide-react";

import { defaultResumeAction, deleteResumeAction, saveProfileFieldsAction, saveSkillsAction, setSkillLevelAction, uploadResumeAction } from "@/app/actions/candidate";
import { SkillExplorer } from "@/components/career/skill-explorer";
import { skillLinks, skillViews } from "@/components/career/skill-view";
import { ConfirmButton } from "@/components/forms/buttons";
import { Input, Select } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { EducationSection, ExperienceSection, LinkValue, ProjectsSection, SectionCard, SummaryRow, ValueChips } from "@/components/profile/profile-sections";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { Badge, buttonClass, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { CATEGORIES } from "@/server/domain/categories";
import { aitLearnUrl, matchInputFor } from "@/server/services/career";
import { signedDocumentUrl } from "@/server/services/documents";
import { experienceSkillLinks, loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Profile" };

const SYNC_MESSAGE: Record<string, string> = {
  login_required: "AI Tathastu needs you to sign in again before Avsar can refresh your profile.",
  consent_required: "Avsar isn't connected to your AI Tathastu account any more. Reconnect to import your profile again.",
};
const SECTIONS = [["skills", "Skills"], ["education", "Education"], ["experience", "Experience"], ["projects", "Projects"], ["preferences", "Preferences"], ["links", "Links"], ["resumes", "Resume"]] as const;
const MODES: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const CATEGORY_PLURAL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.plural])) as Record<string, string>;

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ sync?: string; synced?: string; resume_applied?: string }> }) {
  const session = await requireCandidate("/app/profile");
  const db = await getDb();
  const p = await loadProfile(db, session.profileId);
  if (!p) notFound();
  const pr = p.profile;
  const { sync, synced, resume_applied } = await searchParams;
  const ownSkills = p.skills.filter((s) => s.source === "avsar");
  const importedSkills = p.skills.filter((s) => s.source === "ai_tathastu");
  // The same canonical, evidence-based skill profile Career intelligence uses (one source of truth).
  const [{ input }, links] = await Promise.all([matchInputFor(db, p), experienceSkillLinks(db, pr.id)]);
  const skillProfile = input.profile;
  const skillsByExperience = new Map<string, string[]>();
  for (const l of links) skillsByExperience.set(l.experienceId, [...(skillsByExperience.get(l.experienceId) ?? []), l.skillName]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={pr.fullName ?? "Your profile"}
        description={[pr.headline, [pr.city, pr.region].filter(Boolean).join(", "), pr.country].filter(Boolean).join(" · ") || "Your Avsar profile, built from what you share on AI Tathastu."}
        actions={
          <FormDialog label="Edit name and location" title="Your name, headline and location" description="If you change a value here, Avsar keeps your version instead of the one from AI Tathastu." action={saveProfileFieldsAction.bind(null, "basics")} icon="edit">
            <Input name="fullName" label="Full name" defaultValue={pr.fullName ?? ""} required />
            <Input name="headline" label="Headline" defaultValue={pr.headline ?? ""} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="city" label="City" defaultValue={pr.city ?? ""} />
              <Input name="region" label="State" defaultValue={pr.region ?? ""} />
            </div>
          </FormDialog>
        }
      />

      {resume_applied && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Added the items you confirmed from your resume.</p>}
      {synced && pr.aitSyncStatus !== "failed" && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Profile refreshed from AI Tathastu.</p>}
      {sync && SYNC_MESSAGE[sync] && (
        <p role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          {SYNC_MESSAGE[sync]}
          <a href="/api/auth/login?prompt=consent&returnTo=/app/profile%3Fsynced%3D1" className={buttonClass("secondary", "sm")}>Reconnect with AI Tathastu</a>
        </p>
      )}
      <SyncStatusCard status={pr.aitSyncStatus} syncedAt={pr.aitSyncedAt} error={pr.aitSyncError} provider={session.identity.provider} />
      <p className="text-sm text-muted">
        Records marked <span className="rounded-full bg-purple-soft px-2 py-0.5 text-xs font-semibold text-purple">From AI Tathastu</span> stay in sync with AI Tathastu; change them there. What you add here is yours and is never overwritten.
      </p>

      <nav aria-label="Profile sections" className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex w-max gap-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-navy transition-colors duration-150 hover:border-purple/40 hover:bg-purple-soft/50 focus-visible:outline-2 focus-visible:outline-purple">{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Skills ── */}
      <div id="skills" className="scroll-mt-24 space-y-3">
        {skillProfile.length > 0 ? (
          <SkillExplorer skills={skillViews(skillProfile)} links={skillLinks(skillProfile)} aitLearnUrl={aitLearnUrl()} />
        ) : (
          <section className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line bg-surface p-6">
            <Sparkles aria-hidden className="size-6 text-purple" />
            <h2 className="text-xl font-semibold text-navy">Your skills will appear here</h2>
            <p className="max-w-xl text-sm text-muted">Add skills below or a project further down, and they show up as a map with what backs each one up.</p>
          </section>
        )}
        <details className="group rounded-2xl border border-line bg-surface shadow-card" data-testid="manage-skills">
          <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-6 focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
            <span className="text-base font-semibold text-navy">All skills ({p.skills.length})</span>
            <span className="text-sm text-muted">{importedSkills.length} from AI Tathastu · {ownSkills.length} added in Avsar</span>
            <span className="ml-auto text-sm font-semibold text-purple group-open:hidden">Show</span>
            <span className="ml-auto hidden text-sm font-semibold text-purple group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-line px-4 py-4 sm:px-6">
            {importedSkills.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">From AI Tathastu · edit there</p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Skills from AI Tathastu">
                  {importedSkills.map((s) => (
                    <li key={s.id}>
                      <Badge tone="purple">
                        {s.name}{s.level ? ` · ${s.level}` : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Added in Avsar</p>
              <FormDialog label="Edit my skills" title="Skills you add in Avsar" description="Comma separated. Skills from AI Tathastu are already included." action={saveSkillsAction} submitLabel="Save my added skills" icon="edit" variant="ghost">
                <Input name="skills" label="Skills you want to add in Avsar (comma separated)" defaultValue={ownSkills.map((s) => s.name).join(", ")} />
              </FormDialog>
            </div>
            {ownSkills.length > 0 ? (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Skills you added in Avsar">
                {ownSkills.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="min-w-0 truncate"><span className="font-medium text-navy">{s.name}</span> {s.evidenceCount > 0 ? <Badge tone="success">{s.evidenceCount} evidence</Badge> : null}</span>
                    <form action={setSkillLevelAction.bind(null, s.id)} className="flex shrink-0 items-center gap-1">
                      <label htmlFor={`lvl-${s.id}`} className="sr-only">Level for {s.name}</label>
                      <select id={`lvl-${s.id}`} name="level" defaultValue={s.level ?? ""} className="rounded-md border border-line bg-surface px-2 py-1 text-xs">
                        <option value="">Level</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="expert">Expert</option>
                      </select>
                      <button className="rounded-md px-2 py-1 text-xs font-semibold text-purple hover:bg-purple-soft">Set</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">None yet.</p>
            )}
          </div>
        </details>
      </div>

      <EducationSection items={p.education} />
      <ExperienceSection items={p.experiences} skillsByExperience={skillsByExperience} />
      <ProjectsSection items={p.projects} certifications={p.certifications} achievements={p.achievements} />

      {/* ── Preferences ── */}
      <SectionCard id="preferences" title="Preferences" description="Used only to rank opportunities for you; never shared with organizations." icon={<SlidersHorizontal className="size-5" />}>
        <dl className="divide-y divide-line">
          <SummaryRow
            label="Roles you want"
            value={<ValueChips items={pr.preferredRoles} />}
            action={
              <FormDialog label="Edit roles" title="Roles you want" action={saveProfileFieldsAction.bind(null, "roles")} submitLabel="Save roles" icon="edit" variant="ghost">
                <Input name="preferredRoles" label="Roles you want (comma separated)" defaultValue={pr.preferredRoles.join(", ")} />
              </FormDialog>
            }
          />
          <SummaryRow
            label="Cities"
            value={<ValueChips items={pr.preferredLocations} empty="Anywhere" />}
            action={
              <FormDialog label="Edit cities" title="Cities you'd work in" action={saveProfileFieldsAction.bind(null, "locations")} submitLabel="Save cities" icon="edit" variant="ghost">
                <Input name="preferredLocations" label="Cities you'd work in (comma separated)" defaultValue={pr.preferredLocations.join(", ")} />
              </FormDialog>
            }
          />
          <SummaryRow
            label="Ways of working"
            value={<ValueChips items={pr.workModes.map((m) => MODES[m] ?? m)} empty="Any" />}
            action={
              <FormDialog label="Edit ways of working" title="Ways of working" action={saveProfileFieldsAction.bind(null, "workModes")} submitLabel="Save" icon="edit" variant="ghost">
                <fieldset className="space-y-2">
                  <legend className="sr-only">Ways of working</legend>
                  {Object.entries(MODES).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="workModes[]" value={v} defaultChecked={pr.workModes.includes(v)} className="size-4 accent-purple" /> {l}</label>
                  ))}
                </fieldset>
              </FormDialog>
            }
          />
          <SummaryRow
            label="Looking for"
            value={
              <div className="space-y-1.5">
                <ValueChips items={pr.preferredCategories.map((c) => CATEGORY_PLURAL[c] ?? c)} empty="All opportunity types" />
                {pr.interests.length > 0 && <p className="text-xs text-muted">Interested in: {pr.interests.join(", ")}</p>}
              </div>
            }
            action={
              <FormDialog label="Edit what you're looking for" title="What you're looking for" action={saveProfileFieldsAction.bind(null, "interests")} submitLabel="Save" icon="edit" variant="ghost">
                <fieldset>
                  <legend className="text-sm font-semibold text-navy">Opportunity types</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {CATEGORIES.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name="preferredCategories[]" value={c.key} defaultChecked={pr.preferredCategories.includes(c.key)} className="size-4 accent-purple" /> {c.plural}</label>
                    ))}
                  </div>
                </fieldset>
                <Input name="interests" label="Fields that interest you (comma separated)" defaultValue={pr.interests.join(", ")} />
              </FormDialog>
            }
          />
          <SummaryRow
            label="Availability"
            value={
              [pr.availableFrom ? `From ${new Date(pr.availableFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : null, pr.hoursPerWeek ? `${pr.hoursPerWeek} hours a week` : null, pr.workAuthorizedIndia === null ? null : pr.workAuthorizedIndia ? "Authorized to work in India" : "Not authorized to work in India"]
                .filter(Boolean)
                .join(" · ") || <span className="italic text-muted">Not set</span>
            }
            action={
              <FormDialog label="Edit availability" title="Availability" action={saveProfileFieldsAction.bind(null, "availability")} submitLabel="Save" icon="edit" variant="ghost">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="availableFrom" label="Available from" type="date" defaultValue={pr.availableFrom ?? ""} />
                  <Input name="hoursPerWeek" label="Hours per week (part-time or gigs)" type="number" min={1} max={80} defaultValue={pr.hoursPerWeek ?? ""} />
                </div>
                <Select name="workAuthorizedIndia" label="Authorized to work in India?" defaultValue={pr.workAuthorizedIndia === null ? "" : pr.workAuthorizedIndia ? "yes" : "no"}>
                  <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              </FormDialog>
            }
          />
        </dl>
      </SectionCard>

      {/* ── Links ── */}
      <SectionCard
        id="links"
        title="Links"
        description="Your LinkedIn, GitHub and portfolio."
        icon={<Link2 className="size-5" />}
        action={
          <FormDialog label="Edit links" title="Your links" description="Use full https:// links." action={saveProfileFieldsAction.bind(null, "links")} submitLabel="Save links" icon="edit">
            <Input name="linkedinUrl" label="LinkedIn" type="url" defaultValue={pr.linkedinUrl ?? ""} />
            <Input name="githubUrl" label="GitHub" type="url" defaultValue={pr.githubUrl ?? ""} />
            <Input name="portfolioUrl" label="Portfolio" type="url" defaultValue={pr.portfolioUrl ?? ""} />
          </FormDialog>
        }
      >
        <dl className="divide-y divide-line">
          <SummaryRow label="LinkedIn" value={<LinkValue url={pr.linkedinUrl} />} />
          <SummaryRow label="GitHub" value={<LinkValue url={pr.githubUrl} />} />
          <SummaryRow label="Portfolio" value={<LinkValue url={pr.portfolioUrl} />} />
        </dl>
      </SectionCard>

      {/* ── Resume ── */}
      <SectionCard
        id="resumes"
        title="Resume"
        description="Optional and private. Shared only with organizations you apply to, and only the version you choose."
        icon={<FileText className="size-5" />}
        action={
          <FormDialog label="Upload resume" title="Upload a resume" description="PDF or Word (.docx), up to 4 MB. Download links work for 5 minutes and only for you." action={uploadResumeAction} submitLabel="Upload resume" icon="upload">
            <Input name="file" label="Resume file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
            <Input name="label" label="Label (optional)" placeholder="e.g. Frontend roles" maxLength={80} />
          </FormDialog>
        }
      >
        {p.resumes.length === 0 ? (
          <p className="text-sm text-muted">No resume uploaded. You can still apply: many listings don&apos;t need one.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {p.resumes.map(({ resume: r, doc }) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText aria-hidden className="size-4 shrink-0 text-purple" />
                  <a href={signedDocumentUrl(doc.id, session.identity.id)} target="_blank" rel="noopener" className="truncate font-medium text-navy hover:underline">{r.label}</a>
                  <span className="text-muted">v{r.version} · {(doc.sizeBytes / 1024).toFixed(0)} KB</span>
                  {r.isDefault && <Badge tone="purple">Default</Badge>}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <Link href={`/app/profile/resume/${r.id}`} className={buttonClass("ghost", "sm")}>Suggest profile updates</Link>
                  {!r.isDefault && <form action={defaultResumeAction.bind(null, r.id)}><button className={buttonClass("ghost", "sm")}>Make default</button></form>}
                  <form action={deleteResumeAction.bind(null, r.id)}><ConfirmButton label="Delete" message={`Delete "${r.label}"? Applications already submitted keep their copy.`} /></form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
