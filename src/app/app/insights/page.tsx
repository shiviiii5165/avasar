import Link from "next/link";

import { Badge, buttonClass, Card, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { matchAll } from "@/server/services/candidate-context";
import { listOpenOpportunities } from "@/server/services/opportunities";
import { loadProfile, toCandidateFacts } from "@/server/services/profiles";
import { duplicateSkills, roadmap, suggestRoles } from "@/server/domain/career";

export const metadata = { title: "Career insights" };

/**
 * Career insights grounded only in real data: the candidate's own profile and the currently open listings.
 * No AI-generated claims; every number here can be traced back to listings shown on the page.
 */
export default async function InsightsPage() {
  const session = await requireCandidate("/app/insights");
  const db = await getDb();
  // Every open listing, not one search page: the counts below must cover all of them.
  const [profile, open] = await Promise.all([loadProfile(db, session.profileId), listOpenOpportunities(db)]);
  // Derived from the profile already loaded above (it used to be loaded a second time, after everything else).
  const facts = profile ? toCandidateFacts(profile) : null;
  const matches = matchAll(facts, open);
  const prefs = profile!.profile.preferredCategories;
  const relevant = open.filter((o) => !prefs.length || prefs.includes(o.category));

  const gaps = new Map<string, string[]>();
  for (const o of relevant) for (const s of matches.get(o.id)?.missingRequiredSkills ?? []) gaps.set(s, [...(gaps.get(s) ?? []), o.title]);
  const ranked = [...gaps].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const unbacked = profile!.skills.filter((s) => s.evidenceCount === 0);
  const names = profile!.skills.map((s) => s.name);
  const roles = suggestRoles(names);
  const plan = roadmap(roles[0] ?? null, new Map(ranked.map(([s, t]) => [s, t.length])), names);
  const dupes = duplicateSkills(names);

  const ait = profile!.profile.aitInsights;
  const hasAit = Boolean(ait.goals?.targetRole || ait.readiness || ait.goals?.needs?.length);

  return (
    <div className="space-y-6">
      <PageHeader title="Career insights" description={`Based on your profile and the ${relevant.length} open listing${relevant.length === 1 ? "" : "s"} in the categories you're interested in. Recomputed every time you visit.`} />
      {hasAit && (
        <Card>
          <h2 className="text-lg font-semibold text-navy">From AI Tathastu</h2>
          <p className="mt-1 text-xs text-muted">What AI Tathastu&apos;s career engine says about your evidence, shared with your permission. Updated each time your profile syncs.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {ait.goals?.targetRole && (
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Target role</dt><dd className="mt-1 font-semibold text-navy">{ait.goals.targetRole}</dd></div>
            )}
            {ait.readiness && (
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Interview readiness</dt><dd className="mt-1 font-semibold text-navy">{ait.readiness.score} / 100</dd></div>
            )}
          </dl>
          {ait.goals?.needs && ait.goals.needs.length > 0 && (
            <>
              <p className="mt-4 text-sm font-semibold text-navy">Skills this role still needs</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {ait.goals.needs.map((n) => <li key={n.skill}><Badge tone={n.priority === "High" ? "orange" : "purple"}>{n.skill}{n.state === "unverified" ? " · not yet proven" : ""}</Badge></li>)}
              </ul>
            </>
          )}
        </Card>
      )}
      {!profile!.skills.length ? (
        <StateMessage kind="empty" title="Add your skills first" body="Insights compare your skills with what open opportunities ask for." action={<Link href="/app/profile" className={buttonClass("primary")}>Add skills</Link>} />
      ) : (
        <>
          <Card>
            <h2 className="text-lg font-semibold text-navy">Skills that would open the most doors</h2>
            <p className="mt-1 text-xs text-muted">Required skills you haven&apos;t listed, counted across open listings.</p>
            {relevant.length === 0 ? (
              <p className="mt-3 text-sm text-muted">There are no open listings in the categories you&apos;re interested in right now, so there is nothing to compare yet.</p>
            ) : ranked.length ? (
              <ul className="mt-4 space-y-3">
                {ranked.map(([skill, titles]) => (
                  <li key={skill}>
                    <p className="text-sm font-semibold text-navy">{skill} <Badge tone="purple">required by {titles.length}</Badge></p>
                    <p className="text-xs text-muted">{titles.slice(0, 3).join(" · ")}{titles.length > 3 ? ` and ${titles.length - 3} more` : ""}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">You already list every required skill in the open listings that interest you.</p>
            )}
          </Card>
          {roles.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-navy">Roles your skills point to</h2>
              <p className="mt-1 text-xs text-muted">Suggestions from the skills you already have, not predictions. Each shows what you have and what the role usually also needs.</p>
              <ul className="mt-4 grid gap-3 md:grid-cols-3">
                {roles.map((r) => (
                  <li key={r.role} className="rounded-lg border border-line p-3 text-sm">
                    <p className="font-semibold text-navy">{r.role}</p>
                    <p className="mt-1 text-muted">You have: {r.have.join(", ")}</p>
                    {r.missing.length > 0 && <p className="text-muted">Usually also: {r.missing.join(", ")}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {plan.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-navy">Your next steps{roles[0] ? ` toward ${roles[0].role}` : ""}</h2>
              <ol className="mt-4 space-y-3">
                {plan.map((s, i) => (
                  <li key={s.skill} className="text-sm">
                    <p className="font-semibold text-navy">{i + 1}. Learn {s.skill} <span className="font-normal text-muted">({s.why})</span></p>
                    <p className="text-muted">Prove it: {s.project}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">When you finish a project, add it to your profile so it counts as evidence.</p>
            </Card>
          )}
          {dupes.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-navy">Possible duplicate skills</h2>
              <p className="mt-1 text-sm text-muted">These look like the same skill spelled differently: {dupes.map((g) => g.join(" / ")).join("; ")}. Matching already treats them as one.</p>
            </Card>
          )}
          <Card>
            <h2 className="text-lg font-semibold text-navy">Strengthen your evidence</h2>
            <p className="mt-1 text-xs text-muted">Skills without a project or role behind them. Adding a project that uses them makes your profile more convincing.</p>
            {unbacked.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">{unbacked.map((s) => <li key={s.id}><Badge>{s.name}</Badge></li>)}</ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Every skill you list has evidence behind it.</p>
            )}
            <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-purple hover:underline">Add a project</Link>
          </Card>
          <p className="text-xs text-muted">Want to add details from your resume? Open <Link href="/app/profile#resumes" className="font-semibold text-purple hover:underline">your resumes</Link> and choose &ldquo;Suggest profile updates&rdquo;. Nothing is added until you confirm it.</p>
        </>
      )}
    </div>
  );
}
