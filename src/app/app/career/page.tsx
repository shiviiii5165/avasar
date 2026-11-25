import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { evidencePreferencesAction, toggleLearningEvidenceAction } from "@/app/actions/career";
import { GoalSkills } from "@/components/career/goal-skills";
import { RecommendationCard } from "@/components/career/recommendation-card";
import { SkillExplorer } from "@/components/career/skill-explorer";
import { skillLinks, skillViews } from "@/components/career/skill-view";
import { OfficialPortalLinks } from "@/components/opportunity/portal-links";
import { discoveryLinks } from "@/server/ingestion/discovery";
import { discoveryFamilies } from "@/server/services/ingestion";
import { buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { registry } from "@/server/intelligence/registry";
import { careerIntelligence, CONTROLLABLE_EVIDENCE } from "@/server/services/career";
import { dismissedIds, savedIds } from "@/server/services/engagement";

export const metadata = { title: "Career intelligence" };

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "unknown");
const LEARNING_KIND: Record<string, string> = { asked: "Studied", practiced: "Practised", task_completed: "Completed a task", assessment_attempted: "Tried an assessment", assessment_passed: "Passed an assessment", project_demonstrated: "Shown in a project" };

/**
 * Evidence-based career intelligence for the signed-in student only. Every statement here comes from the
 * student's own records or from listings shown on the page; nothing is generated, and nothing promises a job.
 */
export default async function CareerPage() {
  const session = await requireCandidate("/app/career");
  const db = await getDb();
  const [dismissed, saved] = await Promise.all([dismissedIds(db, session.identity.id), savedIds(db, session.identity.id)]);
  const data = await careerIntelligence(db, session.profileId, new Date(), { exclude: dismissed });
  if (!data) return <StateMessage kind="error" title="Profile not found" />;
  const { skills, readiness, recommendations, roadmap, learning, excluded } = data;
  const families = await discoveryFamilies(db).catch(() => new Set<string>());
  const portalLinks = discoveryLinks({ query: data.targetRoles[0] ?? skills.find((s) => s.state === "demonstrated" || s.state === "verified")?.name, families });
  const reg = registry();
  const domains = Object.fromEntries(readiness.map((r) => [r.role.id, reg.roles.find((x) => x.id === r.role.id)?.domain ?? null]));
  const byName = new Map(skills.map((s) => [s.name, s]));
  const views = skillViews(skills, readiness[0] ? { title: readiness[0].role.title, skills: readiness[0].skills } : null);

  return (
    <div className="space-y-6">
      <PageHeader title="Career intelligence" description="Your skills, how they're backed up, what to build next for your goal, and openings that fit. Worked out fresh from your own profile on every visit; nothing here predicts getting a job." />

      {skills.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line bg-surface p-6" data-testid="skill-explorer-empty">
          <Sparkles aria-hidden className="size-6 text-purple" />
          <h2 className="text-xl font-semibold text-navy">Your skills will appear here</h2>
          <p className="max-w-xl text-sm text-muted">Add skills or a project to your profile and they&apos;ll show up as a map of what you can do, with what backs each one up. An empty profile says nothing about your ability.</p>
          <Link href="/app/profile" className={buttonClass("primary", "sm", "mt-2")}>
            Add skills or a project <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      ) : (
        <SkillExplorer skills={views} links={skillLinks(skills)} aitLearnUrl={data.aitLearnUrl} />
      )}

      <GoalSkills readiness={readiness} skills={skills} roadmap={roadmap} domains={domains} aitLearnUrl={data.aitLearnUrl} />

      <section aria-labelledby="recs-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <h2 id="recs-title" className="text-xl font-semibold text-navy">Openings that fit you</h2>
        <p className="mt-0.5 text-sm text-muted">Ordered by your skills first, then your career goal, then your preferences. Listings whose stated requirements you don&apos;t meet are left out; unknown details are never held against you. Each listing appears once, even when several sources carry it.</p>
        {recommendations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted">No open listings to recommend right now. Check back soon, or search the official portals below.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="recommendations">
            {recommendations.map(({ o, match }) => (
              <li key={o.id} className="min-w-0">
                <RecommendationCard o={o} match={match} saved={saved.has(o.id)} byName={byName} />
              </li>
            ))}
          </ul>
        )}
        <OfficialPortalLinks links={portalLinks} title={data.targetRoles[0] ? `Search official portals for ${data.targetRoles[0]}` : "Search official portals"} />
      </section>

      <section aria-labelledby="evidence-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <h2 id="evidence-title" className="text-lg font-semibold text-navy">What counts toward your career profile</h2>
        <p className="mt-1 text-sm text-muted">You decide which evidence is used. Unticked types are ignored everywhere on this page and in your recommendations.</p>
        <form action={evidencePreferencesAction} className="mt-3 space-y-2">
          {CONTROLLABLE_EVIDENCE.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="exclude" value={c.key} defaultChecked={excluded.includes(c.key)} />
              Don&apos;t use: {c.label}
            </label>
          ))}
          <button className={buttonClass("secondary", "sm")}>Save</button>
        </form>
        {learning.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-navy">Learning activity received from AI Tathastu</h3>
            <p className="text-xs text-muted">Only what happened, for which skill and when. Avsar never receives your conversations.</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {learning.slice(0, 30).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={e.includedInProfile ? "text-navy" : "text-muted line-through"}>{e.skillName}: {LEARNING_KIND[e.kind] ?? e.kind}{e.title ? ` (${e.title})` : ""}{e.score !== null && e.maxScore ? `, ${e.score}/${e.maxScore}` : ""} · {fmt(e.occurredAt)}</span>
                  <form action={toggleLearningEvidenceAction.bind(null, e.id, !e.includedInProfile)}>
                    <button className={buttonClass("ghost", "sm")}>{e.includedInProfile ? "Exclude" : "Include"}</button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
