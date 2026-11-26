import Link from "next/link";
import { ArrowRight, Compass, Sparkles, Target } from "lucide-react";

import { buttonClass } from "@/components/ui";
import { registry } from "@/server/intelligence/registry";
import type { CareerIntelligence } from "@/server/services/career";
import { hasAnyId, recordIdIn } from "@/server/services/opportunities";

import { GoalSkills } from "./goal-skills";
import { RecommendationCard } from "./recommendation-card";
import { SkillExplorer } from "./skill-explorer";
import { skillLinks, skillViews } from "./skill-view";

/**
 * The career intelligence experience (skills map, goal skills and next steps, openings that fit), shown on Home.
 * One implementation and one data load (services/career careerIntelligence); nothing here is generated: every number
 * and sentence comes from the student's own records or from listings on the page, and nothing promises a job.
 */
export function CareerDashboard({ data, saved, path = "/app" }: { data: CareerIntelligence; saved: ReadonlySet<string>; path?: string }) {
  const { skills, readiness, recommendations, roadmap } = data;
  const reg = registry();
  const domains = Object.fromEntries(readiness.map((r) => [r.role.id, reg.roles.find((x) => x.id === r.role.id)?.domain ?? null]));
  const views = skillViews(skills, readiness[0] ? { title: readiness[0].role.title, skills: readiness[0].skills } : null);

  return (
    <div className="space-y-6">
      <CareerSummary data={data} />

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

      <GoalSkills readiness={readiness} roadmap={roadmap} domains={domains} aitLearnUrl={data.aitLearnUrl} inferred={data.targetSource === "inferred"} />

      <section aria-labelledby="recs-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="recs-title" className="text-xl font-semibold text-navy">Openings that fit you</h2>
            <p className="mt-0.5 text-sm text-muted">Picked using your skills, your career goal and your preferences.</p>
          </div>
          <Link href="/app/discover" className="inline-flex items-center gap-1 text-sm font-semibold text-purple underline-offset-4 hover:underline">
            See all opportunities <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {recommendations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted">No open listings fit your profile right now. New listings are added as they are checked; your recommendations update on every visit.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="recommendations">
            {recommendations.map(({ o, match }) => (
              <li key={o.id} className="min-w-0">
                <RecommendationCard o={o} match={match} saved={hasAnyId(saved, o)} savedRecordId={recordIdIn(saved, o)} path={path} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The top of Home: the career goal and one way forward. Deliberately no counts, scores or generated sentences; the
 * sections below carry the detail.
 */
function CareerSummary({ data }: { data: CareerIntelligence }) {
  const goal = data.readiness[0];
  return (
    <section aria-labelledby="summary-title" className="overflow-hidden rounded-2xl border border-purple/15 bg-gradient-to-br from-purple-soft via-surface to-peach-soft p-5 shadow-card motion-safe:animate-[dialog-in_240ms_ease-out] sm:p-6" data-testid="career-summary">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {goal ? (
            <>
              <p id="summary-title" className="flex items-center gap-1.5 text-sm text-navy-soft">
                <Target aria-hidden className="size-4 text-purple" />
                {data.targetSource === "inferred" ? "Suggested career goal" : "Your career goal"}
              </p>
              <p className="mt-0.5 font-serif text-2xl text-navy sm:text-3xl">{goal.role.title}</p>
            </>
          ) : (
            <>
              <p id="summary-title" className="font-serif text-2xl text-navy sm:text-3xl">Set your career goal</p>
              <p className="mt-0.5 text-sm text-navy-soft">
                <Link href="/app/profile#preferences" className="font-semibold text-purple underline-offset-4 hover:underline">Add the role you&apos;re aiming for</Link> to see the skills and openings that fit it.
              </p>
            </>
          )}
          <p className="mt-2 text-sm text-navy-soft">Explore opportunities that match your interests and experience.</p>
        </div>
        <Link href="/app/discover" className={buttonClass("primary", "md")}>
          <Compass aria-hidden className="size-4" /> Explore opportunities
        </Link>
      </div>
    </section>
  );
}