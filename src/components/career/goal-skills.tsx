import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, Compass, Hammer, Route } from "lucide-react";
import type { ReactNode } from "react";

import { FieldChip } from "@/components/opportunity/field";
import type { roleReadiness } from "@/server/intelligence/career-match";
import { STATUS, statusLabel, type SkillProfileEntry, type SkillStatusKey } from "@/server/intelligence/evidence";

import { StatusPill } from "./status-pill";
import { STATUS_STYLE } from "./status-style";

type Readiness = NonNullable<ReturnType<typeof roleReadiness>>;
type RoleSkill = Readiness["skills"][number];
type Roadmap = { skill: string; conceptId: string; why: string; buildsOn: string | null; openListings: number }[];

/**
 * "Skills for your career goal": the existing role-readiness result (roleReadiness) shown as groups the student can
 * act on. Counts are counts of the role's listed skills; there is no readiness percentage, and nothing here
 * promises selection or a job.
 */
export function GoalSkills({ readiness, skills, roadmap, domains, aitLearnUrl }: { readiness: Readiness[]; skills: SkillProfileEntry[]; roadmap: Roadmap; domains: Record<string, string | null>; aitLearnUrl: string | null }) {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const [first, ...others] = readiness;
  return (
    <section aria-labelledby="goal-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6" data-testid="goal-skills">
      <h2 id="goal-title" className="text-xl font-semibold text-navy">Skills for your career goal</h2>
      <p className="mt-0.5 text-sm text-muted">What to work on next to strengthen your profile for this career.</p>

      {!first ? (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-dashed border-line bg-surface-muted/50 p-5">
          <Compass aria-hidden className="size-6 text-purple" />
          <p className="font-semibold text-navy">You haven&apos;t set a career goal yet</p>
          <p className="text-sm text-muted">Add a target role (for example &ldquo;Data analyst&rdquo;, &ldquo;HR executive&rdquo; or &ldquo;Fitter apprentice&rdquo;) and this section shows which of its skills your profile already backs up.</p>
          <Link href="/app/profile" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-purple underline-offset-4 hover:underline">
            Set your career goal <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      ) : (
        <>
          <Goal r={first} byName={byName} domain={domains[first.role.id] ?? null} primary />
          {roadmap.length > 0 && <NextSteps roadmap={roadmap} role={first.role.title} aitLearnUrl={aitLearnUrl} />}
          {others.map((r) => (
            <details key={r.role.id} className="group mt-4 rounded-xl border border-line">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
                <span className="font-semibold text-navy">Also aiming for: {r.role.title}</span>
                <span className="text-muted">· {r.essentialEvidenced} of {r.essentialTotal} essential skills backed by evidence</span>
                <span className="ml-auto text-xs font-semibold text-purple group-open:hidden">Show</span>
                <span className="ml-auto hidden text-xs font-semibold text-purple group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-line px-4 pb-4">
                <Goal r={r} byName={byName} domain={domains[r.role.id] ?? null} />
              </div>
            </details>
          ))}
          <p className="mt-4 text-xs text-muted">Skill lists come from Avsar&apos;s role catalogue. Building them up strengthens your profile; it doesn&apos;t guarantee an interview, a selection or a job.</p>
        </>
      )}
    </section>
  );
}

function statusOf(s: RoleSkill): SkillStatusKey {
  if (!s.supportedBy) return "not_shown";
  return s.supportedBy.relation === "related" ? "related" : s.supportedBy.state;
}

function Goal({ r, byName, domain, primary = false }: { r: Readiness; byName: Map<string, SkillProfileEntry>; domain: string | null; primary?: boolean }) {
  const rows = r.skills.map((s) => {
    const status = statusOf(s);
    const entry = s.supportedBy ? byName.get(s.supportedBy.name) : undefined;
    const label = status === "related" ? `Related: your ${s.supportedBy!.name}` : entry && status !== "not_shown" ? statusLabel(entry) : STATUS[status].label;
    const via = s.supportedBy?.relation === "specialization" ? `through your ${s.supportedBy.name}` : null;
    return { ...s, status, label, via };
  });
  const essential = rows.filter((s) => s.importance === "essential");
  const backed = rows.filter((s) => s.status === "verified" || s.status === "demonstrated");
  const listed = rows.filter((s) => s.status === "declared" || s.status === "practiced" || s.status === "learning");
  const build = rows.filter((s) => s.status === "not_shown");
  const related = rows.filter((s) => s.status === "related");
  const byImportance = <T extends { importance: string }>(l: T[]) => [...l].sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "essential" ? -1 : 1));

  return (
    <div className={primary ? "mt-5" : "mt-3"}>
      {primary && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your career goal</p>
            <p className="mt-0.5 font-serif text-3xl leading-tight text-navy sm:text-4xl" data-testid="career-goal">{r.role.title}</p>
          </div>
          {domain && <FieldChip domainId={domain} />}
        </div>
      )}

      {/* Essential skills, one segment each, coloured by how each is backed. A count, not a score. */}
      <div className="mt-4 rounded-xl bg-surface-muted/60 p-3 sm:p-4">
        <p className="text-sm text-navy">
          <span className="font-semibold">{r.essentialEvidenced} of {r.essentialTotal}</span> essential skills are backed by a project, job, assessment or verification
        </p>
        <ol className="mt-2 flex h-3.5 gap-1" aria-label="Essential skills">
          {essential.map((s) => {
            const st = STATUS_STYLE[s.status];
            return (
              <li key={s.conceptId} className="h-full flex-1 rounded-full" style={{ background: st.outlined ? "transparent" : st.light, border: st.outlined ? `1.5px dashed ${st.dot}` : undefined }} title={`${s.name}: ${s.label}`}>
                <span className="sr-only">{s.name}: {s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Group icon={<CircleCheck aria-hidden className="size-4 text-success" />} title="Backed by evidence" hint="Verified, or shown in a project, job or assessment." items={byImportance(backed)} empty="None yet. A project that uses one of these skills is the quickest way to start." />
        <Group icon={<CircleDashed aria-hidden className="size-4 text-[#1e40af]" />} title="On your profile, not shown yet" hint="Listed, being learnt or practised; nothing backs them up yet." items={byImportance(listed)} empty="Nothing here." />
        <Group icon={<Hammer aria-hidden className="size-4 text-orange-deep" />} title="Build next" hint="Part of this goal; nothing on your profile shows them yet." items={byImportance(build)} empty="Every skill on this goal's list appears on your profile." />
        {related.length > 0 && <Group icon={<Route aria-hidden className="size-4 text-muted" />} title="Related skills" hint="A related skill you have helps a little; it isn't proof of these." items={byImportance(related)} empty="" />}
      </div>
    </div>
  );
}

function Group({ icon, title, hint, items, empty }: { icon: ReactNode; title: string; hint: string; items: (RoleSkill & { status: SkillStatusKey; label: string; via: string | null })[]; empty: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-navy">
        {icon}
        {title}
        <span className="ml-auto rounded-full bg-surface-muted px-2 text-xs tabular-nums text-muted">{items.length}</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((s) => (
            <li key={s.conceptId} className="rounded-lg bg-surface-muted/60 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-navy" title={s.name}>{s.name}</span>
                <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${s.importance === "essential" ? "text-purple" : "text-muted"}`}>{s.importance === "essential" ? "Essential" : "Optional"}</span>
              </div>
              {s.status !== "not_shown" && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusPill state={s.status} label={s.label} className="max-w-full truncate" />
                  {s.via && <span className="text-xs text-muted">{s.via}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">{empty}</p>
      )}
    </div>
  );
}

function NextSteps({ roadmap, role, aitLearnUrl }: { roadmap: Roadmap; role: string; aitLearnUrl: string | null }) {
  return (
    <div className="mt-5 rounded-xl border border-purple/20 bg-purple-soft/40 p-4" data-testid="next-steps">
      <h3 className="text-base font-semibold text-navy">Your next steps toward {role}</h3>
      <ol className="mt-3 grid gap-2 md:grid-cols-2">
        {roadmap.map((r, i) => (
          <li key={r.conceptId} className="flex gap-3 rounded-lg bg-surface p-3">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-purple text-sm font-bold text-white">{i + 1}</span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-navy">{r.skill}</p>
              <p className="text-xs text-muted">
                {r.why}
                {r.openListings > 0 && ` · asked for by ${r.openListings} open listing${r.openListings === 1 ? "" : "s"}`}
              </p>
              {r.buildsOn && <p className="mt-0.5 text-xs text-navy-soft">Builds on your {r.buildsOn}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-navy-soft">
        Practise on {aitLearnUrl ? <a href={aitLearnUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple underline-offset-4 hover:underline">AI Tathastu Learning<span className="sr-only"> (opens in a new tab)</span></a> : "AI Tathastu"}, then{" "}
        <Link href="/app/profile" className="font-semibold text-purple underline-offset-4 hover:underline">add the project to your profile</Link> so it counts as evidence.
      </p>
    </div>
  );
}
