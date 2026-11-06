import Link from "next/link";
import { redirect } from "next/navigation";

import { completeOnboardingAction, saveProfileFieldsAction, saveSkillsAction, startOnboardingAction } from "@/app/actions/candidate";
import { ActionForm, Input, Select } from "@/components/forms/action-form";
import { CertificationSection, EducationSection, ExperienceSection, ProjectSection, ResumeUpload } from "@/components/profile/section-forms";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { loadProfile, type LoadedProfile } from "@/server/services/profiles";

export const metadata = { title: "Set up your profile" };

const STEPS = [
  "Basic information", "Career stage", "Education", "Skills", "Experience", "Projects", "Certifications", "Career interests",
  "Preferred roles", "Preferred locations", "Work arrangement", "Compensation", "Availability", "Resume", "Professional links", "Review",
] as const;
const TOTAL = STEPS.length;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const session = await requireUser("/app/onboarding");
  if (!session.profileId) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="font-serif text-3xl text-navy">Let&apos;s set up your Avsar profile</h1>
        <p className="mt-2 text-sm text-muted">A few minutes now makes every eligibility check and recommendation more useful. Skip anything you like and come back later. Your profile is private until you choose otherwise.</p>
        <form action={startOnboardingAction} className="mt-6"><button className={buttonClass("primary", "lg")}>Get started</button></form>
        <Link href="/opportunities" className="mt-3 inline-block text-sm font-semibold text-purple hover:underline">Browse opportunities first</Link>
      </Card>
    );
  }
  const step = Math.min(TOTAL, Math.max(1, Number((await searchParams).step) || 1));
  const p = await loadProfile(await getDb(), session.profileId);
  if (!p) redirect("/app");
  const next = step < TOTAL ? `/app/onboarding?step=${step + 1}` : null;
  const prev = step > 1 ? `/app/onboarding?step=${step - 1}` : null;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold text-purple">Step {step} of {TOTAL}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL} aria-label="Onboarding progress">
        <div className="h-full rounded-full bg-gradient-to-r from-orange to-purple" style={{ width: `${(step / TOTAL) * 100}%` }} />
      </div>
      <h1 className="mt-4 font-serif text-3xl text-navy">{STEPS[step - 1]}</h1>
      <Card className="mt-6"><StepBody step={step} p={p} next={next} /></Card>
      <div className="mt-4 flex items-center justify-between text-sm">
        {prev ? <Link href={prev} className="font-semibold text-navy hover:underline">← Back</Link> : <span />}
        {next && <Link href={next} className="font-semibold text-muted hover:text-navy">Skip for now →</Link>}
      </div>
    </div>
  );
}

function Continue({ next }: { next: string | null }) {
  return next ? <Link href={next} className={buttonClass("primary")}>Continue</Link> : null;
}

function StepBody({ step, p, next }: { step: number; p: LoadedProfile; next: string | null }) {
  const pr = p.profile;
  switch (step) {
    case 1:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "basics", next)} submitLabel="Save and continue">
          <Input name="fullName" label="Full name" defaultValue={pr.fullName ?? ""} required autoComplete="name" />
          <Input name="headline" label="Headline" placeholder="e.g. Final-year B.Tech student interested in data" defaultValue={pr.headline ?? ""} maxLength={140} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="city" label="City" defaultValue={pr.city ?? ""} autoComplete="address-level2" />
            <Input name="region" label="State" defaultValue={pr.region ?? ""} autoComplete="address-level1" />
          </div>
        </ActionForm>
      );
    case 2:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "stage", next)} submitLabel="Save and continue">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-navy">Which describes you best?</legend>
            {[["student", "Student"], ["fresher", "Fresher (recently graduated)"], ["early_career", "Early career (up to 3 years)"], ["experienced", "Experienced"], ["career_switcher", "Switching careers"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-purple has-[:checked]:bg-purple-soft">
                <input type="radio" name="careerStage" value={v} defaultChecked={pr.careerStage === v} className="size-4 accent-purple" /> {l}
              </label>
            ))}
          </fieldset>
        </ActionForm>
      );
    case 3:
      return <div className="space-y-4"><EducationSection p={p} /><Continue next={next} /></div>;
    case 4:
      return (
        <ActionForm action={saveSkillsAction.bind(null, next)} submitLabel="Save and continue">
          <Input name="skills" label="Your skills (comma separated)" defaultValue={p.skills.map((s) => s.name).join(", ")} hint="Technical and non-technical, e.g. Python, Excel, Communication, Figma. You can set levels later on your profile." />
        </ActionForm>
      );
    case 5:
      return <div className="space-y-4"><ExperienceSection p={p} /><Continue next={next} /></div>;
    case 6:
      return <div className="space-y-4"><ProjectSection p={p} /><Continue next={next} /></div>;
    case 7:
      return <div className="space-y-4"><CertificationSection p={p} /><Continue next={next} /></div>;
    case 8:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "interests", next)} submitLabel="Save and continue">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-navy">What are you looking for?</legend>
            {[["job", "Jobs"], ["internship", "Internships"], ["gig", "Freelance & gigs"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="preferredCategories[]" value={v} defaultChecked={pr.preferredCategories.includes(v)} className="size-4 accent-purple" /> {l}</label>
            ))}
          </fieldset>
          <Input name="interests" label="Fields that interest you (comma separated)" defaultValue={pr.interests.join(", ")} placeholder="e.g. Data, Design, Education, Finance" />
        </ActionForm>
      );
    case 9:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "roles", next)} submitLabel="Save and continue">
          <Input name="preferredRoles" label="Roles you want (comma separated)" defaultValue={pr.preferredRoles.join(", ")} placeholder="e.g. Frontend developer, Data analyst" />
        </ActionForm>
      );
    case 10:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "locations", next)} submitLabel="Save and continue">
          <Input name="preferredLocations" label="Cities you'd work in (comma separated)" defaultValue={pr.preferredLocations.join(", ")} placeholder="e.g. Pune, Bengaluru" />
        </ActionForm>
      );
    case 11:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "workModes", next)} submitLabel="Save and continue">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-navy">Which ways of working suit you?</legend>
            {[["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="workModes[]" value={v} defaultChecked={pr.workModes.includes(v)} className="size-4 accent-purple" /> {l}</label>
            ))}
          </fieldset>
        </ActionForm>
      );
    case 12:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "compensation", next)} submitLabel="Save and continue">
          <p className="text-sm text-muted">Optional. Used only to explain matches; it&apos;s never shown to organizations.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="expectedCompMin" label="Minimum expected (₹)" type="number" inputMode="numeric" min={0} defaultValue={pr.expectedCompMin ?? ""} />
            <Select name="compPeriod" label="Per" defaultValue={pr.compPeriod ?? ""}><option value="">Choose</option><option value="month">Month</option><option value="year">Year</option><option value="project">Project</option></Select>
          </div>
        </ActionForm>
      );
    case 13:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "availability", next)} submitLabel="Save and continue">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="availableFrom" label="Available from" type="date" defaultValue={pr.availableFrom ?? ""} />
            <Input name="hoursPerWeek" label="Hours per week (for part-time or gigs)" type="number" inputMode="numeric" min={1} max={80} defaultValue={pr.hoursPerWeek ?? ""} />
          </div>
          <Select name="workAuthorizedIndia" label="Are you authorized to work in India?" defaultValue={pr.workAuthorizedIndia === null ? "" : pr.workAuthorizedIndia ? "yes" : "no"}>
            <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
          </Select>
        </ActionForm>
      );
    case 14:
      return (
        <div className="space-y-4">
          {p.resumes.length > 0 && <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">You have {p.resumes.length} resume{p.resumes.length > 1 ? "s" : ""} uploaded.</p>}
          <ResumeUpload />
          <Continue next={next} />
        </div>
      );
    case 15:
      return (
        <ActionForm action={saveProfileFieldsAction.bind(null, "links", next)} submitLabel="Save and continue">
          <Input name="linkedinUrl" label="LinkedIn" type="url" placeholder="https://www.linkedin.com/in/…" defaultValue={pr.linkedinUrl ?? ""} />
          <Input name="githubUrl" label="GitHub" type="url" placeholder="https://github.com/…" defaultValue={pr.githubUrl ?? ""} />
          <Input name="portfolioUrl" label="Portfolio" type="url" placeholder="https://…" defaultValue={pr.portfolioUrl ?? ""} />
        </ActionForm>
      );
    default:
      return (
        <div className="space-y-4">
          <p className="text-sm text-navy">Your profile is <strong>{p.completeness.percent}% complete</strong>. You can finish now and add the rest any time.</p>
          {p.completeness.missing.length > 0 && (
            <ul className="space-y-1 text-sm">
              {p.completeness.missing.map((m) => <li key={m.label}><Link href={m.href} className="text-purple hover:underline">{m.action}</Link></li>)}
            </ul>
          )}
          <p className="text-sm text-muted">Visibility: <strong>Private</strong>. Only you can see your profile until you apply or change this in Settings.</p>
          <form action={completeOnboardingAction}><button className={buttonClass("primary", "lg")}>Finish and go to my dashboard</button></form>
        </div>
      );
  }
}
