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
import { STATUS_STYLE } from "./status-style";

/**
 * The career intelligence experience (skills map, goal skills and next steps, openings that fit), shown on Home.
 * One implementation and one data load (services/career careerIntelligence); nothing here is generated: every number
 * and sentence comes from the student's own records or from listings on the page, and nothing promises a job.
 */
export function CareerDashboard({ data, saved, path = "/app" }: { data: CareerIntelligence; saved: ReadonlySet<string>; path?: string }) {
  const { skills, readiness, recommendations, roadmap } = data;
  const reg = registry();
  const domains = Object.fromEntries(readiness.map((r) => [r.role.id, reg.roles.find((x) => x.id === r.role.id)?.domain ?? null]));
  const byName = new Map(skills.map((s) => [s.name, s]));
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

      <GoalSkills readiness={readiness} skills={skills} roadmap={roadmap} domains={domains} aitLearnUrl={data.aitLearnUrl} inferred={data.targetSource === "inferred"} />

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
                <RecommendationCard o={o} match={match} saved={hasAnyId(saved, o)} savedRecordId={recordIdIn(saved, o)} byName={byName} path={path} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * "Where you stand": a short, factual summary at the top of Home. Built from the same data as the sections below
 * (counts, the goal and its essential skills, the first next step, how many openings fit), never from a language
 * model, so it can't state anything the profile doesn't show.
 */
function CareerSummary({ data }: { data: CareerIntelligence }) {
  const { skills, readiness, roadmap, recommendations } = data;
  const count = (states: string[]) => skills.filter((s) => states.includes(s.state)).length;
  const verified = count(["verified"]);
  const shown = count(["demonstrated"]);
  const listed = count(["declared", "practiced", "learning"]);
  const goal = readiness[0];
  const strong = recommendations.filter((r) => r.match.tier === "strong").length;
  const tiles = [
    { label: "Verified", value: verified, dot: STATUS_STYLE.verified.dot },
    { label: "Shown in your work", value: shown, dot: STATUS_STYLE.demonstrated.dot },
    { label: "Added to profile", value: listed, dot: STATUS_STYLE.declared.dot },
  ];
  return (
    <section aria-labelledby="summary-title" className="relative overflow-hidden rounded-2xl border border-purple/15 bg-gradient-to-br from-purple-soft via-surface to-peach-soft p-5 shadow-card motion-safe:animate-[dialog-in_240ms_ease-out] sm:p-6" data-testid="career-summary">
      <h2 id="summary-title" className="sr-only">Where you stand</h2>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div className="min-w-0 space-y-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-navy-soft">
            <Target aria-hidden className="size-4 text-purple" />
            {goal ? (
              <>
                {data.targetSource === "inferred" ? "Suggested goal from your skills:" : "Your career goal:"}
                <span className="font-semibold text-navy">{goal.role.title}</span>
              </>
            ) : (
              <>
                No career goal yet. <Link href="/app/profile#preferences" className="font-semibold text-purple underline-offset-4 hover:underline">Add one</Link> to see what it needs.
              </>
            )}
          </p>
          <ul className="space-y-1.5 text-sm text-navy">
            {goal && (
              <li>
                <span className="font-semibold">{goal.essentialEvidenced} of {goal.essentialTotal}</span> essential skills for this goal are backed by a project, job, assessment or verification.
              </li>
            )}
            {roadmap[0] && (
              <li>
                Next step: <span className="font-semibold">{roadmap[0].skill}</span>
                {roadmap[0].buildsOn ? <span className="text-muted"> (builds on your {roadmap[0].buildsOn})</span> : null}.
              </li>
            )}
            <li>
              {recommendations.length ? (
                <>
                  <span className="font-semibold">{recommendations.length}</span> open {recommendations.length === 1 ? "listing fits" : "listings fit"} your profile{strong ? <>, <span className="font-semibold">{strong}</span> of them in your goal&apos;s field</> : null}.
                </>
              ) : (
                <>No open listing fits your profile right now.</>
              )}
            </li>
          </ul>
          <Link href="/app/discover" className={buttonClass("primary", "sm")}>
            <Compass aria-hidden className="size-4" /> Explore opportunities
          </Link>
        </div>
        <dl className="grid grid-cols-3 gap-2 sm:gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col-reverse rounded-xl border border-line bg-surface/80 p-3 text-center backdrop-blur-sm">
              <dt className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-muted">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: t.dot }} />
                <span className="leading-tight">{t.label}</span>
              </dt>
              <dd className="text-2xl font-semibold tabular-nums text-navy sm:text-3xl">{t.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
