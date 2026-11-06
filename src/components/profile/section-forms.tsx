import { Trash2 } from "lucide-react";

import { addSectionAction, removeSectionAction, uploadResumeAction } from "@/app/actions/candidate";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import type { LoadedProfile } from "@/server/services/profiles";

const LEVELS = [
  ["secondary", "Class 10"], ["higher_secondary", "Class 12"], ["diploma", "Diploma"], ["bachelors", "Bachelor's"], ["masters", "Master's"], ["doctorate", "Doctorate"],
] as const;
const LEVEL_LABEL = Object.fromEntries(LEVELS) as Record<string, string>;
const KINDS = [["internship", "Internship"], ["full_time", "Full-time"], ["part_time", "Part-time"], ["freelance", "Freelance"], ["volunteer", "Volunteer"]] as const;

function RemoveButton({ section, id, label }: { section: "education" | "experience" | "project" | "certification"; id: string; label: string }) {
  return (
    <form action={removeSectionAction.bind(null, section, id)}>
      <button type="submit" aria-label={`Remove ${label}`} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
        <Trash2 aria-hidden className="size-4" />
      </button>
    </form>
  );
}

function ItemList({ children, empty }: { children: React.ReactNode[]; empty: string }) {
  return children.length ? <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{children}</ul> : <p className="text-sm text-muted">{empty}</p>;
}

export function EducationSection({ p }: { p: LoadedProfile }) {
  return (
    <div className="space-y-4">
      <ItemList empty="No education added yet.">
        {p.education.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div><p className="font-semibold text-navy">{e.institution}</p><p className="text-muted">{[LEVEL_LABEL[e.level], e.degree, e.field].filter(Boolean).join(" · ")}{e.graduationYear ? ` · ${e.graduationYear}` : ""}</p></div>
            <RemoveButton section="education" id={e.id} label={e.institution} />
          </li>
        ))}
      </ItemList>
      <details className="rounded-lg border border-dashed border-line p-4" open={p.education.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-purple">Add education</summary>
        <ActionForm action={addSectionAction.bind(null, "education")} submitLabel="Add education" className="mt-4" resetOnSuccess>
          <Input name="institution" label="Institution" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="level" label="Level" required defaultValue="bachelors">{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <Input name="degree" label="Degree (e.g. B.Tech)" />
            <Input name="field" label="Field of study" />
            <Input name="grade" label="Grade or CGPA" />
            <Input name="startYear" label="Start year" type="number" inputMode="numeric" min={1950} max={2045} />
            <Input name="graduationYear" label="Graduation year (expected is fine)" type="number" inputMode="numeric" min={1950} max={2045} />
          </div>
        </ActionForm>
      </details>
    </div>
  );
}

export function ExperienceSection({ p }: { p: LoadedProfile }) {
  return (
    <div className="space-y-4">
      <ItemList empty="No experience added yet. Internships, part-time and volunteer work all count.">
        {p.experiences.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div><p className="font-semibold text-navy">{e.title} · {e.organization}</p><p className="text-muted">{KINDS.find((k) => k[0] === e.kind)?.[1]} · {e.startDate ?? "?"} – {e.current ? "present" : (e.endDate ?? "?")}</p></div>
            <RemoveButton section="experience" id={e.id} label={e.title} />
          </li>
        ))}
      </ItemList>
      <details className="rounded-lg border border-dashed border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold text-purple">Add experience</summary>
        <ActionForm action={addSectionAction.bind(null, "experience")} submitLabel="Add experience" className="mt-4" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="title" label="Role" required />
            <Input name="organization" label="Organization" required />
            <Select name="kind" label="Type" defaultValue="internship">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <div />
            <Input name="startDate" label="Start (month)" type="month" />
            <Input name="endDate" label="End (month)" type="month" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="current" className="size-4 accent-purple" /> I currently work here</label>
          <Textarea name="description" label="What you did" maxLength={2000} />
        </ActionForm>
      </details>
    </div>
  );
}

export function ProjectSection({ p }: { p: LoadedProfile }) {
  return (
    <div className="space-y-4">
      <ItemList empty="No projects yet. Projects are the strongest evidence for your skills.">
        {p.projects.map((pr) => (
          <li key={pr.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div><p className="font-semibold text-navy">{pr.title}</p>{pr.skills.length > 0 && <p className="text-muted">Skills: {pr.skills.join(", ")}</p>}{pr.url && <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">{pr.url}</a>}</div>
            <RemoveButton section="project" id={pr.id} label={pr.title} />
          </li>
        ))}
      </ItemList>
      <details className="rounded-lg border border-dashed border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold text-purple">Add a project</summary>
        <ActionForm action={addSectionAction.bind(null, "project")} submitLabel="Add project" className="mt-4" resetOnSuccess>
          <Input name="title" label="Project title" required />
          <Textarea name="description" label="What it does and your role" maxLength={2000} />
          <Input name="skills" label="Skills used (comma separated)" hint="Listed skills are linked to this project as evidence." />
          <Input name="url" label="Link (https://)" type="url" />
        </ActionForm>
      </details>
    </div>
  );
}

export function CertificationSection({ p }: { p: LoadedProfile }) {
  return (
    <div className="space-y-4">
      <ItemList empty="No certifications added.">
        {p.certifications.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div><p className="font-semibold text-navy">{c.name}</p><p className="text-muted">{[c.issuer, c.issuedOn].filter(Boolean).join(" · ")}</p></div>
            <RemoveButton section="certification" id={c.id} label={c.name} />
          </li>
        ))}
      </ItemList>
      <details className="rounded-lg border border-dashed border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold text-purple">Add a certification</summary>
        <ActionForm action={addSectionAction.bind(null, "certification")} submitLabel="Add certification" className="mt-4" resetOnSuccess>
          <Input name="name" label="Certification" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="issuer" label="Issued by" />
            <Input name="issuedOn" label="Issued (month)" type="month" />
          </div>
          <Input name="url" label="Credential link (https://)" type="url" />
        </ActionForm>
      </details>
    </div>
  );
}

export function ResumeUpload() {
  return (
    <ActionForm action={uploadResumeAction} submitLabel="Upload resume" resetOnSuccess>
      <Input name="file" label="Resume (PDF or Word .docx, up to 5 MB)" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
      <Input name="label" label="Label (optional)" placeholder="e.g. Frontend roles" maxLength={80} />
      <p className="text-xs text-muted">Your resume stays private. It&apos;s shared only with organizations you apply to, and only the version you choose.</p>
    </ActionForm>
  );
}
