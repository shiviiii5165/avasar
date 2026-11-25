import { Award, Briefcase, CalendarDays, ExternalLink, FolderGit2, GraduationCap, Link2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { addSectionAction, removeSectionAction, updateSectionAction } from "@/app/actions/candidate";
import { Input, Select, Textarea } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { INSTITUTION_NOT_STATED, ORGANIZATION_NOT_STATED, ROLE_NOT_STATED } from "@/server/integrations/tathastu-profile";
import type { LoadedProfile } from "@/server/services/profiles";

/**
 * Profile sections: a clear header with one compact action, and the records as cards or a timeline. Records from
 * AI Tathastu are read-only here (they're changed on AI Tathastu and kept in sync); records added in Avsar can be
 * edited and removed. Missing values are said plainly ("Dates not stated"), never filled in.
 */

type Edu = LoadedProfile["education"][number];
type Exp = LoadedProfile["experiences"][number];
type Proj = LoadedProfile["projects"][number];
type Cert = LoadedProfile["certifications"][number];
type Ach = LoadedProfile["achievements"][number];

const LEVELS = [["secondary", "Class 10"], ["higher_secondary", "Class 12"], ["diploma", "Diploma"], ["bachelors", "Bachelor's"], ["masters", "Master's"], ["doctorate", "Doctorate"]] as const;
const LEVEL_LABEL = Object.fromEntries(LEVELS) as Record<string, string>;
const KINDS = [["internship", "Internship"], ["full_time", "Full-time"], ["part_time", "Part-time"], ["freelance", "Freelance"], ["volunteer", "Volunteer"]] as const;
const KIND_LABEL = Object.fromEntries(KINDS) as Record<string, string>;
const NOT_STATED = new Set([INSTITUTION_NOT_STATED, ORGANIZATION_NOT_STATED, ROLE_NOT_STATED]);

/* ── Shared pieces ─────────────────────────────────────────────────────────── */

export function SectionCard({ id, title, description, icon, action, children }: { id: string; title: string; description?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-soft text-purple">{icon}</span>}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-xl font-semibold text-navy">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return source === "ai_tathastu" ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-purple-soft px-2 py-0.5 text-xs font-semibold text-purple" title="Kept in sync with AI Tathastu. Change it there.">From AI Tathastu</span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-navy-soft">Added in Avsar</span>
  );
}

function RemoveButton({ section, id, label }: { section: "education" | "experience" | "project" | "certification"; id: string; label: string }) {
  return (
    <form action={removeSectionAction.bind(null, section, id)}>
      <button type="submit" aria-label={`Remove ${label}`} title="Remove" className="flex size-9 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-purple">
        <Trash2 aria-hidden className="size-4" />
      </button>
    </form>
  );
}

function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-line bg-surface-muted/40 p-4">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </div>
  );
}

/** "Institution not stated" and similar are shown as unknown, not as a name. */
function Named({ value, className = "" }: { value: string; className?: string }) {
  return NOT_STATED.has(value) ? <span className={`font-normal italic text-muted ${className}`}>{value}</span> : <span className={className}>{value}</span>;
}

function LongText({ text }: { text: string }) {
  if (text.length <= 220) return <p className="mt-2 whitespace-pre-line text-sm text-navy-soft">{text}</p>;
  return (
    <details className="group mt-2 text-sm text-navy-soft">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="line-clamp-3 whitespace-pre-line group-open:hidden">{text}</span>
        <span className="mt-1 inline-block font-semibold text-purple underline-offset-4 hover:underline group-open:hidden">Read more</span>
        <span className="hidden font-semibold text-purple underline-offset-4 hover:underline group-open:inline">Show less</span>
      </summary>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </details>
  );
}

/* ── Dates (only what the record states) ───────────────────────────────────── */

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * A stored date as the student would say it. AI Tathastu dates given as a bare year are stored as January (start)
 * or December (end), so for imported records those months are shown as the year alone rather than as a month
 * nobody stated.
 */
function dateLabel(iso: string | null, imported: boolean, end: boolean): { text: string; precise: boolean } | null {
  if (!iso) return null;
  const [y, m] = iso.split("-").map(Number);
  if (!y) return null;
  const yearOnly = imported && ((!end && m === 1) || (end && m === 12));
  return yearOnly || !m ? { text: String(y), precise: false } : { text: `${MONTH[m - 1]} ${y}`, precise: true };
}
function duration(start: string, end: string | null): string | null {
  const [sy, sm] = start.split("-").map(Number);
  const now = new Date();
  const [ey, em] = end ? end.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const months = (ey - sy) * 12 + (em - sm) + 1;
  if (!(months > 0)) return null;
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}

/* ── Education ─────────────────────────────────────────────────────────────── */

export function EducationFields({ e }: { e?: Edu }) {
  return (
    <>
      <Input name="institution" label="Institution" required defaultValue={e?.institution ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="level" label="Level" required defaultValue={e?.level ?? ""}>
          <option value="" disabled>Choose a level</option>
          {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Input name="degree" label="Degree (e.g. B.Tech)" defaultValue={e?.degree ?? ""} />
        <Input name="field" label="Field of study" defaultValue={e?.field ?? ""} />
        <Input name="grade" label="Grade or CGPA" defaultValue={e?.grade ?? ""} />
        <Input name="startYear" label="Start year" type="number" inputMode="numeric" min={1950} max={2045} defaultValue={e?.startYear ?? ""} />
        <Input name="graduationYear" label="Graduation year (expected is fine)" type="number" inputMode="numeric" min={1950} max={2045} defaultValue={e?.graduationYear ?? ""} />
      </div>
    </>
  );
}

export function EducationSection({ items }: { items: Edu[] }) {
  const thisYear = new Date().getFullYear();
  const sorted = [...items].sort((a, b) => (b.graduationYear ?? 9999) - (a.graduationYear ?? 9999));
  return (
    <SectionCard
      id="education"
      title="Education"
      description="Where you've studied, newest first."
      icon={<GraduationCap className="size-5" />}
      action={<FormDialog label="Add education" title="Add education" description="Saved to your Avsar profile. You can edit or remove it any time." action={addSectionAction.bind(null, "education")} submitLabel="Add education"><EducationFields /></FormDialog>}
    >
      {sorted.length === 0 ? (
        <Empty icon={<GraduationCap className="size-4" />} title="No education yet" body="Add your school, college or university, or confirm your education on AI Tathastu and refresh." />
      ) : (
        <Timeline>
          {sorted.map((e) => {
            const current = e.graduationYear !== null && e.graduationYear >= thisYear;
            const when = e.startYear && e.graduationYear ? `${e.startYear} – ${e.graduationYear}${current ? " (expected)" : ""}` : e.graduationYear ? `${current ? "Graduating" : "Graduated"} ${e.graduationYear}` : e.startYear ? `From ${e.startYear}` : null;
            const subtitle = [e.degree, e.field].filter(Boolean).join(", ") || (e.level ? LEVEL_LABEL[e.level] : null);
            return (
              <TimelineItem key={e.id} kind="education" current={current} data-testid="education-item">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-navy"><Named value={e.institution} /></h3>
                    <p className="text-sm text-navy-soft">{subtitle ?? <span className="italic text-muted">Degree not stated</span>}</p>
                  </div>
                  <RowActions source={e.source}>
                    <FormDialog label={`Edit ${e.institution}`} title="Edit education" action={updateSectionAction.bind(null, "education", e.id)} icon="edit" iconOnly><EducationFields e={e} /></FormDialog>
                    <RemoveButton section="education" id={e.id} label={e.institution} />
                  </RowActions>
                </div>
                <Meta>
                  <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="size-3.5" />{when ?? <span className="italic">Dates not stated</span>}</span>
                  {e.level && subtitle !== LEVEL_LABEL[e.level] && <span>{LEVEL_LABEL[e.level]}</span>}
                  {e.grade && <span>Grade: {e.grade}</span>}
                </Meta>
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </SectionCard>
  );
}

/* ── Experience ────────────────────────────────────────────────────────────── */

export function ExperienceFields({ e }: { e?: Exp }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="title" label="Role" required defaultValue={e?.title ?? ""} />
        <Input name="organization" label="Organization" required defaultValue={e?.organization ?? ""} />
        <Select name="kind" label="Type" defaultValue={e?.kind && KIND_LABEL[e.kind] ? e.kind : "internship"}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <div className="hidden sm:block" />
        <Input name="startDate" label="Start (month)" type="month" defaultValue={e?.startDate?.slice(0, 7) ?? ""} />
        <Input name="endDate" label="End (month)" type="month" defaultValue={e?.endDate?.slice(0, 7) ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="current" defaultChecked={e?.current ?? false} className="size-4 accent-purple" /> I currently work here</label>
      <Textarea name="description" label="What you did" maxLength={2000} defaultValue={e?.description ?? ""} />
    </>
  );
}

export function ExperienceSection({ items, skillsByExperience }: { items: Exp[]; skillsByExperience: Map<string, string[]> }) {
  const sorted = [...items].sort((a, b) => Number(b.current) - Number(a.current) || (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  return (
    <SectionCard
      id="experience"
      title="Experience"
      description="Internships, jobs, freelance and volunteer work."
      icon={<Briefcase className="size-5" />}
      action={<FormDialog label="Add experience" title="Add experience" description="Internships, part-time and volunteer work all count." action={addSectionAction.bind(null, "experience")} submitLabel="Add experience"><ExperienceFields /></FormDialog>}
    >
      {sorted.length === 0 ? (
        <Empty icon={<Briefcase className="size-4" />} title="No experience yet" body="Add an internship, job or volunteer role, or confirm your experience on AI Tathastu and refresh." />
      ) : (
        <Timeline>
          {sorted.map((e) => {
            const imported = e.source === "ai_tathastu";
            const start = dateLabel(e.startDate, imported, false);
            const end = e.current ? { text: "Present", precise: true } : dateLabel(e.endDate, imported, true);
            const span = start && end ? `${start.text} – ${end.text}` : start ? `From ${start.text}` : end ? `Until ${end.text}` : null;
            const length = e.startDate && start?.precise && end?.precise ? duration(e.startDate, e.current ? null : e.endDate) : null;
            const skills = skillsByExperience.get(e.id) ?? [];
            return (
              <TimelineItem key={e.id} kind="experience" current={e.current} data-testid="experience-item">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-navy"><Named value={e.title} /></h3>
                    <p className="text-sm text-navy-soft"><Named value={e.organization} /></p>
                  </div>
                  <RowActions source={e.source}>
                    <FormDialog label={`Edit ${e.title}`} title="Edit experience" action={updateSectionAction.bind(null, "experience", e.id)} icon="edit" iconOnly><ExperienceFields e={e} /></FormDialog>
                    <RemoveButton section="experience" id={e.id} label={e.title} />
                  </RowActions>
                </div>
                <Meta>
                  <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="size-3.5" />{span ?? <span className="italic">Dates not stated</span>}</span>
                  {length && <span>{length}</span>}
                  {KIND_LABEL[e.kind] && <span>{KIND_LABEL[e.kind]}</span>}
                </Meta>
                {e.description && <LongText text={e.description} />}
                {skills.length > 0 && <Chips items={skills} label={`Skills used at ${e.organization}`} />}
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </SectionCard>
  );
}

/* ── Timeline (visual language of AI Tathastu's "Your Journey") ────────────── */

function Timeline({ children }: { children: ReactNode }) {
  return <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[1.1rem] before:w-px before:bg-line">{children}</ol>;
}

const KIND_STYLE = {
  education: { dot: "bg-[#f1ebfe] text-[#5b21b6] ring-[#d5c6fb]", Icon: GraduationCap },
  experience: { dot: "bg-[#e0f5f2] text-[#0f766e] ring-[#a8e3d9]", Icon: Briefcase },
} as const;

function TimelineItem({ kind, current, children, ...rest }: { kind: keyof typeof KIND_STYLE; current: boolean; children: ReactNode; "data-testid"?: string }) {
  const { dot, Icon } = KIND_STYLE[kind];
  return (
    <li className="relative flex gap-3 sm:gap-4" {...rest}>
      <span aria-hidden className={`relative z-10 mt-3 flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-surface ${dot}`}>
        <Icon className="size-4" />
      </span>
      <div className={`min-w-0 flex-1 rounded-xl border bg-surface p-4 transition-shadow duration-150 hover:shadow-card ${current ? "border-[#a8e3d9]" : "border-line"}`}>
        {current && <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">Now</span>}
        {children}
      </div>
    </li>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">{children}</p>;
}

function RowActions({ source, children }: { source: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <SourceBadge source={source} />
      {source === "avsar" && children}
    </div>
  );
}

function Chips({ items, label, max = 8 }: { items: string[]; label: string; max?: number }) {
  return (
    <ul aria-label={label} className="mt-3 flex flex-wrap gap-1.5">
      {items.slice(0, max).map((s) => <li key={s} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-navy-soft">{s}</li>)}
      {items.length > max && <li className="px-1 text-xs text-muted">+{items.length - max} more</li>}
    </ul>
  );
}

/* ── Projects, certifications, achievements ────────────────────────────────── */

export function ProjectFields({ pr }: { pr?: Proj }) {
  return (
    <>
      <Input name="title" label="Project title" required defaultValue={pr?.title ?? ""} />
      <Textarea name="description" label="What it does and your role" maxLength={2000} defaultValue={pr?.description ?? ""} />
      <Input name="skills" label="Skills used (comma separated)" hint="Listed skills are linked to this project as evidence." defaultValue={pr?.skills.join(", ") ?? ""} />
      <Input name="url" label="Link (https://)" type="url" defaultValue={pr?.url ?? ""} />
    </>
  );
}

function ProjectCard({ pr }: { pr: Proj }) {
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 transition-shadow duration-150 hover:shadow-card" data-testid="project-item">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold text-navy">{pr.title}</h3>
        <RowActions source={pr.source}>
          <FormDialog label={`Edit ${pr.title}`} title="Edit project" action={updateSectionAction.bind(null, "project", pr.id)} icon="edit" iconOnly><ProjectFields pr={pr} /></FormDialog>
          <RemoveButton section="project" id={pr.id} label={pr.title} />
        </RowActions>
      </div>
      {pr.description && <p className="mt-1.5 line-clamp-2 text-sm text-navy-soft">{pr.description}</p>}
      {pr.skills.length > 0 && <Chips items={pr.skills} label={`Skills used in ${pr.title}`} max={6} />}
      {pr.url && (
        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-w-0 items-center gap-1 pt-3 text-sm font-semibold text-purple underline-offset-4 hover:underline">
          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{pr.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </li>
  );
}

const SHOWN_PROJECTS = 6;
export function ProjectsSection({ items, certifications, achievements }: { items: Proj[]; certifications: Cert[]; achievements: Ach[] }) {
  const first = items.slice(0, SHOWN_PROJECTS);
  const rest = items.slice(SHOWN_PROJECTS);
  return (
    <SectionCard
      id="projects"
      title="Projects"
      description="Projects are the strongest evidence for your skills."
      icon={<FolderGit2 className="size-5" />}
      action={<FormDialog label="Add project" title="Add a project" action={addSectionAction.bind(null, "project")} submitLabel="Add project"><ProjectFields /></FormDialog>}
    >
      {items.length === 0 ? (
        <Empty icon={<FolderGit2 className="size-4" />} title="No projects yet" body="Add a project you built, or connect GitHub on AI Tathastu and refresh." />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">{first.map((pr) => <ProjectCard key={pr.id} pr={pr} />)}</ul>
          {rest.length > 0 && (
            <details className="group mt-3">
              <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-semibold text-navy transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {rest.length} more {rest.length === 1 ? "project" : "projects"}</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">{rest.map((pr) => <ProjectCard key={pr.id} pr={pr} />)}</ul>
            </details>
          )}
        </>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy"><Award aria-hidden className="size-4 text-purple" /> Certificates and achievements</h3>
          <FormDialog label="Add certificate" title="Add a certificate" action={addSectionAction.bind(null, "certification")} submitLabel="Add certificate" variant="ghost">
            <Input name="name" label="Certificate" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="issuer" label="Issued by" />
              <Input name="issuedOn" label="Issued (month)" type="month" />
            </div>
            <Input name="url" label="Credential link (https://)" type="url" />
          </FormDialog>
        </div>
        {certifications.length + achievements.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None added yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {certifications.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-semibold text-navy">{c.name}</span> <span className="text-muted">{[c.issuer, c.issuedOn?.slice(0, 7)].filter(Boolean).join(" · ")}</span></span>
                <span className="flex items-center gap-1"><SourceBadge source={c.source} />{c.source === "avsar" && <RemoveButton section="certification" id={c.id} label={c.name} />}</span>
              </li>
            ))}
            {achievements.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-semibold text-navy">{a.title}</span> <span className="text-muted">{[a.kind === "publication" ? "Publication" : "Achievement", a.issuer, a.date].filter(Boolean).join(" · ")}</span></span>
                <SourceBadge source={a.source} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

/* ── Summary rows (preferences, links) ─────────────────────────────────────── */

export function SummaryRow({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-sm font-semibold text-navy sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-navy-soft">{value}</dd>
      {action && <dd className="shrink-0">{action}</dd>}
    </div>
  );
}

export function ValueChips({ items, empty = "Not set" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="italic text-muted">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => <li key={i} className="rounded-full bg-purple-soft/70 px-2.5 py-0.5 text-xs font-semibold text-purple">{i}</li>)}
    </ul>
  );
}

export function LinkValue({ url }: { url: string | null }) {
  if (!url) return <span className="italic text-muted">Not added</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1 font-semibold text-purple underline-offset-4 hover:underline">
      <Link2 aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{url.replace(/^https?:\/\/(www\.)?/, "")}</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
