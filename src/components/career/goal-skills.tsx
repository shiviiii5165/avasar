import Link from "next/link";
import { ArrowRight, BookOpen, Compass, Lightbulb, Route, Sparkles, Target } from "lucide-react";
import type { ReactNode } from "react";

import { FieldChip } from "@/components/opportunity/field";
import type { roleReadiness } from "@/server/intelligence/career-match";
import type { SkillStatusKey } from "@/server/intelligence/evidence";

type Readiness = NonNullable<ReturnType<typeof roleReadiness>>;
type RoleSkill = Readiness["skills"][number];
type Roadmap = { skill: string; conceptId: string; why: string; buildsOn: string | null; openListings: number }[];

/**
 * "Skills for your career goal": the existing role-readiness result (roleReadiness) and learning path (roadmap), shown as
 * four plain groups. No score, no completion bar, no essential/optional labels (important skills simply come first).
 * "Not on your profile" never means "you don't have it", and nothing here promises a job.
 */
export function GoalSkills({ readiness, roadmap, domains, aitLearnUrl, inferred = false }: { readiness: Readiness[]; roadmap: Roadmap; domains: Record<string, string | null>; aitLearnUrl: string | null; inferred?: boolean }) {
  const [first, ...others] = readiness;
  return (
    <section aria-labelledby="goal-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6" data-testid="goal-skills">
      <h2 id="goal-title" className="text-xl font-semibold text-navy">Skills for your career goal</h2>

      {!first ? (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-dashed border-line bg-surface-muted/50 p-5">
          <Compass aria-hidden className="size-6 text-purple" />
          <p className="font-semibold text-navy">Add a career goal</p>
          <p className="text-sm text-muted">Tell us the role you&apos;re aiming for, such as Data analyst or HR executive, and we&apos;ll show the skills that matter for it.</p>
          <Link href="/app/profile#preferences" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-purple underline-offset-4 hover:underline">
            Set your career goal <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      ) : (
        <>
          <Goal r={first} roadmap={roadmap} domain={domains[first.role.id] ?? null} inferred={inferred} aitLearnUrl={aitLearnUrl} primary />
          {others.map((r) => (
            <details key={r.role.id} className="group mt-4 rounded-xl border border-line">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
                <span className="font-semibold text-navy">Also aiming for: {r.role.title}</span>
                <span className="ml-auto text-xs font-semibold text-purple group-open:hidden">Show</span>
                <span className="ml-auto hidden text-xs font-semibold text-purple group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-line px-4 pb-4">
                <Goal r={r} roadmap={[]} domain={domains[r.role.id] ?? null} aitLearnUrl={aitLearnUrl} />
              </div>
            </details>
          ))}
          <p className="mt-4 text-xs text-muted">Building these skills strengthens your profile. It doesn&apos;t guarantee a selection or a job.</p>
        </>
      )}
    </section>
  );
}

function statusOf(s: RoleSkill): SkillStatusKey {
  if (!s.supportedBy) return "not_shown";
  return s.supportedBy.relation === "related" ? "related" : s.supportedBy.state;
}

function Goal({ r, roadmap, domain, aitLearnUrl, primary = false, inferred = false }: { r: Readiness; roadmap: Roadmap; domain: string | null; aitLearnUrl: string | null; primary?: boolean; inferred?: boolean }) {
  // Important skills first in every group.
  const rows = [...r.skills].sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "essential" ? -1 : 1)).map((s) => ({ ...s, status: statusOf(s) }));
  const inWork = rows.filter((s) => s.status === "verified" || s.status === "demonstrated");
  const onProfile = rows.filter((s) => s.status === "declared" || s.status === "practiced" || s.status === "learning");
  const order = new Map(roadmap.map((x, i) => [x.conceptId, i]));
  const explore = rows.filter((s) => s.status === "not_shown").sort((a, b) => (order.get(a.conceptId) ?? 99) - (order.get(b.conceptId) ?? 99));
  const related = rows.filter((s) => s.status === "related");
  const buildsOn = new Map(roadmap.filter((x) => x.buildsOn).map((x) => [x.conceptId, x.buildsOn!]));

  return (
    <div className={primary ? "mt-1" : "mt-3"}>
      {primary && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-navy-soft">
          <Target aria-hidden className="size-4 text-purple" />
          {inferred ? "Suggested from your skills:" : "For"}
          <span className="font-semibold text-navy" data-testid="career-goal">{r.role.title}</span>
          {domain && <FieldChip domainId={domain} />}
          {inferred && <Link href="/app/profile#preferences" className="font-semibold text-purple underline-offset-4 hover:underline">Set your own goal</Link>}
        </p>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Group tone="emerald" icon={<Sparkles aria-hidden className="size-4" />} title="In your work" hint="You've used these in projects or work." items={inWork.map((s) => ({ key: s.conceptId, name: s.name }))} empty="Add a project that uses one of these skills and it will show here." />
        <Group tone="blue" icon={<BookOpen aria-hidden className="size-4" />} title="On your profile" hint="Listed on your profile. A project would show them in action." items={onProfile.map((s) => ({ key: s.conceptId, name: s.name, note: s.status === "learning" || s.status === "practiced" ? "learning" : undefined }))} empty="Nothing else listed for this goal." />
        <Group
          tone="amber"
          icon={<Lightbulb aria-hidden className="size-4" />}
          title="Worth exploring"
          hint="Useful for this role and not on your profile yet."
          items={explore.map((s) => ({ key: s.conceptId, name: s.name, note: buildsOn.get(s.conceptId) ? `builds on ${buildsOn.get(s.conceptId)}` : undefined }))}
          empty="Your profile already mentions every skill this role lists."
          footer={
            explore.length > 0 ? (
              <p className="text-xs text-navy-soft">
                Practise on {aitLearnUrl ? <a href={aitLearnUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple underline-offset-4 hover:underline">AI Tathastu Learning<span className="sr-only"> (opens in a new tab)</span></a> : "AI Tathastu"}, then <Link href="/app/profile#projects" className="font-semibold text-purple underline-offset-4 hover:underline">add the project</Link> to your profile.
              </p>
            ) : null
          }
        />
        {related.length > 0 && (
          <Group tone="violet" icon={<Route aria-hidden className="size-4" />} title="Related skills" hint="You have a closely related skill." items={related.map((s) => ({ key: s.conceptId, name: s.name, note: `via ${s.supportedBy!.name}` }))} empty="" />
        )}
      </div>
    </div>
  );
}

const TONES = {
  emerald: { box: "border-[#bfe8d3] bg-[#f3fbf7]", head: "text-[#05603f]", chip: "bg-white text-[#05603f] ring-[#bfe8d3]" },
  blue: { box: "border-[#cfdcf8] bg-[#f4f7ff]", head: "text-[#1e40af]", chip: "bg-white text-[#1e40af] ring-[#cfdcf8]" },
  amber: { box: "border-[#f5d9b8] bg-[#fff8ef]", head: "text-[#9a4a0c]", chip: "bg-white text-[#9a4a0c] ring-[#f5d9b8]" },
  violet: { box: "border-[#ddd0fb] bg-[#f8f5ff]", head: "text-[#5b21b6]", chip: "bg-white text-[#5b21b6] ring-[#ddd0fb]" },
} as const;

function Group({ tone, icon, title, hint, items, empty, footer }: { tone: keyof typeof TONES; icon: ReactNode; title: string; hint: string; items: { key: string; name: string; note?: string }[]; empty: string; footer?: ReactNode }) {
  const t = TONES[tone];
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${t.box}`}>
      <h3 className={`flex items-center gap-2 text-sm font-semibold ${t.head}`}>{icon}{title}</h3>
      <p className="mt-0.5 text-xs text-navy-soft">{hint}</p>
      {items.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={title}>
          {items.map((s) => (
            <li key={s.key} className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${t.chip}`}>
              <span className="truncate">{s.name}</span>
              {s.note && <span className="shrink-0 text-xs font-normal text-muted">· {s.note}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
      {footer && <div className="mt-3 border-t border-black/5 pt-3">{footer}</div>}
    </div>
  );
}

