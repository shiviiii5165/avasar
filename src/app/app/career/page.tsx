import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { GoalSkills } from "@/components/career/goal-skills";
import { RecommendationCard } from "@/components/career/recommendation-card";
import { SkillExplorer } from "@/components/career/skill-explorer";
import { skillLinks, skillViews } from "@/components/career/skill-view";
import { buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { registry } from "@/server/intelligence/registry";
import { careerIntelligence } from "@/server/services/career";
import { dismissedIds, savedIds } from "@/server/services/engagement";
import { hasAnyId, recordIdIn } from "@/server/services/opportunities";

export const metadata = { title: "Career intelligence" };


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
  const { skills, readiness, recommendations, roadmap } = data;
  const reg = registry();
  const domains = Object.fromEntries(readiness.map((r) => [r.role.id, reg.roles.find((x) => x.id === r.role.id)?.domain ?? null]));
  const byName = new Map(skills.map((s) => [s.name, s]));
  const views = skillViews(skills, readiness[0] ? { title: readiness[0].role.title, skills: readiness[0].skills } : null);

  return (
    <div className="space-y-6">
      <PageHeader title="Career intelligence" description="Your skills, your career goal and openings that match you." />

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

      <GoalSkills readiness={readiness} skills={skills} roadmap={roadmap} domains={domains} aitLearnUrl={data.aitLearnUrl} inferred={data.targetSource === "inferred"} />

      <section aria-labelledby="recs-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <h2 id="recs-title" className="text-xl font-semibold text-navy">Openings that fit you</h2>
        <p className="mt-0.5 text-sm text-muted">Picked using your skills, your career goal and your preferences.</p>
        {recommendations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted">No open listings fit your profile right now. New listings are added as they are checked; your recommendations update on every visit.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="recommendations">
            {recommendations.map(({ o, match }) => (
              <li key={o.id} className="min-w-0">
                <RecommendationCard o={o} match={match} saved={hasAnyId(saved, o)} savedRecordId={recordIdIn(saved, o)} byName={byName} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
