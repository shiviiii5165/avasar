import { saveOpportunityAction } from "@/app/actions/admin";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import type { OpportunityFull } from "@/server/services/opportunities";

const LEVELS = [["higher_secondary", "Class 12"], ["diploma", "Diploma"], ["bachelors", "Bachelor's"], ["masters", "Master's"], ["doctorate", "Doctorate"]] as const;

export function OpportunityForm({ o }: { o?: OpportunityFull }) {
  const d = (o?.details ?? {}) as { stipendNote?: string; conversionPossible?: boolean; deliverables?: string };
  const req = o?.skills.filter((s) => s.required).map((s) => s.name).join(", ") ?? "";
  const pref = o?.skills.filter((s) => !s.required).map((s) => s.name).join(", ") ?? "";
  const e = o?.eligibility;
  const date = o?.deadline ? new Date(o.deadline.getTime() - o.deadline.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return (
    <ActionForm action={saveOpportunityAction.bind(null, o?.id ?? null)} submitLabel={o ? "Save changes" : "Create draft"}>
      {o?.status === "published" && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Saving changes to a published listing sends it back to review and takes it offline until re-approved.</p>}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Basics</legend>
        <div className="sm:col-span-2"><Input name="title" label="Title" required defaultValue={o?.title} maxLength={140} /></div>
        <Input name="organizationName" label="Organization" required defaultValue={o?.organizationName} />
        <Select name="category" label="Category" required defaultValue={o?.category ?? "job"}>
          <option value="job">Job</option><option value="internship">Internship</option><option value="gig">Freelance / gig</option>
        </Select>
        <Select name="employmentType" label="Job type (jobs only)" defaultValue={o?.employmentType ?? "full_time"}>
          <option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option>
        </Select>
        <Select name="workMode" label="Work mode" required defaultValue={o?.workMode ?? "onsite"}>
          <option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
        </Select>
        <div className="sm:col-span-2"><Input name="locations" label="Locations (comma separated)" defaultValue={o?.locations.join(", ")} /></div>
        <div className="sm:col-span-2"><Input name="summary" label="One-line summary" defaultValue={o?.summary ?? ""} maxLength={240} /></div>
        <div className="sm:col-span-2"><Textarea name="description" label="Description (at least 40 characters)" required defaultValue={o?.description} rows={6} /></div>
        <div className="sm:col-span-2"><Textarea name="responsibilities" label="Responsibilities (one per line)" defaultValue={o?.responsibilities ?? ""} /></div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Compensation and timing</legend>
        <Input name="compMin" label="Pay from (₹)" type="number" min={0} defaultValue={o?.compMin ?? ""} />
        <Input name="compMax" label="Pay to (₹)" type="number" min={0} defaultValue={o?.compMax ?? ""} />
        <Select name="compPeriod" label="Per" defaultValue={o?.compPeriod ?? ""}><option value="">—</option><option value="month">Month</option><option value="year">Year</option><option value="project">Project</option><option value="total">Total</option></Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="unpaid" defaultChecked={o?.unpaid} className="size-4 accent-purple" /> Unpaid</label>
        <Input name="durationWeeks" label="Duration (weeks)" type="number" min={0} defaultValue={o?.durationWeeks ?? ""} />
        <Input name="deadline" label="Application deadline" type="datetime-local" defaultValue={date} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Category details</legend>
        <Input name="stipendNote" label="Stipend note (internships)" defaultValue={d.stipendNote ?? ""} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="conversionPossible" defaultChecked={d.conversionPossible} className="size-4 accent-purple" /> Conversion to full-time possible</label>
        <div className="sm:col-span-2"><Input name="deliverables" label="Deliverables (gigs)" defaultValue={d.deliverables ?? ""} /></div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Skills and eligibility (hard requirements)</legend>
        <Input name="requiredSkills" label="Required skills (comma separated)" defaultValue={req} />
        <Input name="preferredSkills" label="Nice-to-have skills" defaultValue={pref} />
        <Input name="experienceMinYears" label="Minimum experience (years)" type="number" min={0} defaultValue={o?.experienceMinYears ?? ""} />
        <div />
        <Input name="graduationYearMin" label="Graduation year from" type="number" defaultValue={e?.graduationYearMin ?? ""} />
        <Input name="graduationYearMax" label="Graduation year to" type="number" defaultValue={e?.graduationYearMax ?? ""} />
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold text-navy">Accepted education levels (none = any)</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {LEVELS.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="educationLevels" value={v} defaultChecked={e?.educationLevels?.includes(v)} className="size-4 accent-purple" /> {l}</label>)}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiresWorkAuthorizationIndia" defaultChecked={e?.requiresWorkAuthorizationIndia} className="size-4 accent-purple" /> Requires authorization to work in India</label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Application and source</legend>
        <Select name="applicationMethod" label="How candidates apply" defaultValue={o?.applicationMethod ?? "internal"}>
          <option value="internal">On Avsar (tracked)</option><option value="external">External site (not tracked)</option>
        </Select>
        <Input name="externalUrl" label="External application URL (https)" type="url" defaultValue={o?.externalUrl ?? ""} />
        <div className="sm:col-span-2"><Input name="sourceUrl" label="Source URL (where this listing came from)" type="url" defaultValue={o?.sourceUrl ?? ""} /></div>
      </fieldset>
    </ActionForm>
  );
}
